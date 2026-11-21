# Persistence and delivery specification

Executable source:

- `packages/db/migrations/0002_authoritative_store.*.sql`, `0003_world_status_projection.*.sql`;
- `packages/db/src` (repositories, transactions, outbox, consumers);
- `apps/simulation/src/command-processor.ts` (load → apply → commit);
- `apps/worker/src/ledger.ts`, `world-status.ts` (relay, consumer, reconciler, first projection).

Decision record: `docs/adr/0005-authoritative-persistence.md`. Kernel rules: `docs/KERNEL.md`.

## Authority

PostgreSQL is the only holder of authoritative facts. Redis/BullMQ carries notifications that can be lost, duplicated or reordered without losing or doubling any effect.

| Table (`civ.*`) | Kind | Mutability |
|---|---|---|
| `worlds` | identity: seed, span, launch versions, creator | append-only |
| `seasons` | schedule and lifecycle | revision-checked update + audit row |
| `world_state` | current aggregate state (kernel `WorldState`) + `command_position` | replaced by each command under the world lock; a trigger forbids moving version, positions or clock backwards, changing the world, `DELETE` and `TRUNCATE` |
| `command_log` | every processed command (accepted or rejected), in order | append-only |
| `domain_events` | the ledger, list-partitioned by world | append-only |
| `checkpoints` | checkpoint metadata + full state snapshot | append-only |
| `audit_log` | administrative actions (world/season changes, operator commands) | append-only |
| `outbox` | ledger notifications awaiting relay | `published_at`/retry columns only; pruned after publication |
| `inbox` | processed markers for jobs with side effects | insert-only |
| `consumer_offsets` | durable per-consumer, per-world ledger cursors | advanced with the consumer's own writes |
| `proj_world_status` | first projection (non-authoritative, rebuildable) | upserted by its consumer |

**Append-only enforcement.** A shared trigger function `civ.reject_mutation()` raises SQLSTATE `23001` on `UPDATE`, `DELETE` and `TRUNCATE` of every append-only table and of every ledger partition. Row triggers are cloned onto new partitions automatically; `civ.ensure_event_partition` adds the statement-level `TRUNCATE` trigger to each new partition. The repositories expose no operation that updates or deletes facts (asserted by a test). DDL (`DROP TABLE`, `DETACH PARTITION`, `ALTER TABLE … DISABLE TRIGGER`) and `session_replication_role = replica` bypass triggers. In shared environments the application role must therefore not own the schema or be a superuser, and must hold only `SELECT, INSERT` on append-only tables (Phase 24 provisions roles; recorded as a remaining risk).

**Partitioning.** `domain_events` is `PARTITION BY LIST (world_id)` with no `DEFAULT` partition, so an event for a world without its own partition fails loudly. `createWorld` creates the world's own partition (`domain_events_<md5(world_id)[0:16]>`). The primary key `(world_id, sequence)` serves every cursor read; `UNIQUE (world_id, event_id)` serves citation lookups. A large world can later be sub-partitioned by tick range in a new migration.

## Command transaction

`commitCommand(pool, { command, basedOn, outcome })` records one processed command in a single READ COMMITTED transaction:

1. `SELECT … FROM world_state WHERE world_id = $1 FOR UPDATE`. This serialises all writers of one world; writers of different worlds never block each other.
2. Look up `(world_id, idempotency_key)` in `command_log`.
   - Found, same request digest → return `duplicate` with the original record. Nothing is written.
   - Found, different digest → `IdempotencyConflictError`.
3. If `world_state.version` / `event_position` differ from `basedOn` → `StaleWriteError`. Nothing is written.
4. Insert the `command_log` row at `position = command_position`.
5. Accepted outcomes only:
   - bulk-insert the events (`unnest`);
   - replace the current state, version, event position and hash;
   - insert the checkpoint, if any;
   - insert one outbox row `ledger.appended` for `[eventFrom, eventTo)`.
6. Rejected outcomes only increment `command_position`.
7. Commands with an operator actor also append an `audit_log` row.

**Before the transaction** the store validates everything it can without the database. A failure raises `LedgerIntegrityError` (a defect, never retried):

- the command and events are parsed by the contract registries;
- the state hash is recomputed (node `crypto`, byte-identical to the domain's pure SHA-256);
- events must be contiguous from `basedOn.eventPosition`, belong to the world and be caused by the command;
- the new version is `basedOn.version + 1`, and the new position is the base plus the event count;
- a checkpoint must describe the new state.

A unique violation on `command_id` is an `IdempotencyConflictError`; any other unique violation (event ID, checkpoint, outbox key) is a `LedgerIntegrityError`, because those identities are engine-derived. Any error inside the transaction rolls everything back. No command, event, state, checkpoint, outbox or audit row is left behind (tested by injecting a failure into the last write).

**Request digest.** `requestDigest(command)` is `sha256` of the canonical command without `commandId`, `issuedAt` and `correlationId`. A client retry that re-mints those still deduplicates; any change of intent (type, payload, expected version, actor, causation, versions, instant) conflicts. A `commandId` reused under another key also conflicts (`UNIQUE (command_id)`).

**Rejections are recorded.** A rejected command occupies its key and log position, so a redelivery returns the same rejection, and replay of the full log reproduces it. This includes state-dependent rejections (`world_paused`, `stale_version`): to try again after the state changed, the client issues a new command with a new idempotency key.

**Processor.** `processCommand` (simulation app) loads the hash-verified state, re-freezes its data, runs `engine.apply` outside the transaction, then commits. On `StaleWriteError` it recomputes on the fresh state (default 5 attempts). Only accepted commits make an outcome stale, so a retry is lost only to another accepted command; exhaustion throws `StaleWriteError` for the caller's job retry. A test runs 8 concurrent writers: every command is recorded exactly once, and one advance wins. A redelivered key is answered from the log without running the engine. Two runners advancing from the same clock therefore produce exactly one accepted batch; the other is recomputed and recorded as `clock_mismatch`.

**Checkpoints.** The processor checkpoints an accepted command whose clock crosses a multiple of `checkpointIntervalTicks` (default 3,650). The world's initial state is checkpointed at creation. `latestCheckpoint(world, atOrBefore)` returns metadata and the hash-verified state snapshot for restore.

## Reading the ledger

- `readEvents({ worldId, after, limit ≤ 5,000 })` returns events with `sequence ≥ after` in order, plus `nextPosition`. Sequences are dense and immutable, so a page for a given cursor never changes; a gap is reported as `LedgerIntegrityError`. Event envelopes are rebuilt from columns and re-validated by `eventRegistry`.
- `findEvent(world, eventId)` serves archive citations.
- `readCommands({ worldId, after, limit })` returns the command log in order (replay input).
- Cursors map to the public `event-cursor` contract: `position` = number of events consumed.

## Delivery

**Outbox relay** (`relayOutbox`, run by the worker every `OUTBOX_RELAY_INTERVAL_MS`, default 500 ms):
- claims up to 100 due rows in one short statement that leases them: `next_attempt_at` moves 60 s ahead, selected with `FOR UPDATE SKIP LOCKED`. Concurrent relays never claim the same row, and no transaction or lock is held while talking to Redis;
- publishes each row outside any transaction as BullMQ job `ledger.appended` with `jobId` = `message_key` (`ledger.<worldId>.<toPosition>`), bounded by a 5 s timeout;
- marks successes published. A failed or timed-out publish records `attempts`, `last_error` and an exponential backoff (1 s doubling, capped at 300 s). Rows are never dropped.
- A relay that dies mid-batch leaves its lease to expire, and the rows are published again (at-least-once). The job ID and the consumer cursor make that harmless.

**Ledger consumer** (`startLedgerWorker`, queue `ledger`):
- validates the job (`ledger-notification` contract), then catches the world's projection up from its durable cursor;
- the job's range is advisory only; the cursor is the input;
- jobs retry 8 times with exponential backoff from 1 s; failed jobs are kept 7 days for inspection;
- unknown job names and payloads that fail the contract fail immediately (`UnrecoverableError`), without retries;
- a poison job cannot block progress, because the next notification or the reconciler retries the same cursor.

**Exactly-once effects** (`consumeBatch` / `catchUp`): one transaction
1. creates the offset row if missing;
2. locks it `FOR UPDATE`;
3. reads the next batch after the cursor;
4. runs the handler with the same client;
5. advances the cursor.

Concurrent or duplicate deliveries serialise on the offset row. A failing handler rolls back its writes and the cursor together.

**Job inbox** (`processOnce`): a processed marker `(consumer, message_key)` committed with the job's side effects. A concurrent duplicate blocks on the key and then reports `duplicate`; a rolled-back first attempt lets the retry run.

**Reconciler** (every `PROJECTION_RECONCILE_INTERVAL_MS`, default 30 s, and at worker start):
- lists worlds whose projection cursor is behind `world_state.event_position` (`consumerLag`) and catches them up directly from PostgreSQL;
- this is the Redis-loss safety net: after a Redis restart or flush, all lost notifications are covered without any operator action;
- failures are isolated per world: a world whose projection fails is logged and counted, and the others still catch up;
- it logs outbox backlog and projection lag each cycle.

## Projection: world status

`proj_world_status` holds `(clock, year, dayOfYear, status, eventPosition, lastEventId)` per world, reduced from the ledger by `reduceWorldStatus` (pure, unit-tested):
- `world.advanced` moves the clock to `toTick`;
- `world.paused` / `world.resumed` set the status at the current clock;
- other events only advance `eventPosition`.

**Rebuild** (projection corrupted, or reducer changed), in one transaction:

```sql
DELETE FROM civ.proj_world_status WHERE world_id = $1;
DELETE FROM civ.consumer_offsets WHERE consumer = 'world-status' AND world_id = $1;
```

The reconciler rebuilds it from position 0. Authoritative tables are never edited for recovery.

## Migrations

| Version | Content | Lock/rewrite risk | Rollback |
|---|---|---|---|
| 0002 `authoritative_store` | functions, tables, triggers, indexes above | new objects only; no lock on existing data | `down` refuses (SQLSTATE 55000) when any world exists; roll forward instead |
| 0003 `world_status_projection` | `proj_world_status` | new table only | `down` drops the projection and its cursors (rebuildable) |

**Verification queries after `up`:**
- `SELECT version FROM public.schema_migrations ORDER BY version` lists 1–3;
- `SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%append_only' OR tgname LIKE '%no_truncate'` counts the guard triggers.

**Tests** apply every released version (1, 2) and then migrate to the latest. A v2 database seeded through the repositories upgrades with byte-identical state, events, commands and checkpoints.

**Development reset.** `pnpm db:reset` drops the `civ` schema and the migration history, then migrates up. It is refused unless all of these hold:
- `NODE_ENV` is not `production`;
- `CIV_ALLOW_DB_RESET=1` (the script sets it);
- the `DATABASE_URL` host is loopback.

## Operations

| Signal | Source | Meaning / action |
|---|---|---|
| Outbox backlog | `outboxBacklog()`: pending count, oldest age, max attempts (logged by the reconciler) | Growing age or attempts: Redis unreachable or the relay stopped. Facts are safe; projections fall back to the reconciler. |
| Projection lag | `consumerLag(consumer)`: per-world `head − position` | Non-zero after a reconcile cycle: the consumer is failing; see `ledger job failed` logs. |
| Stale writes | `StaleWriteError` after retries | Two writers on one world: the world lease (Phase 06) must prevent this. |
| Integrity | `LedgerIntegrityError` | Defect or corruption: pause the world (SEV-1); never edit ledger rows. |

Outbox retention: `pruneOutbox(olderThanMs)` deletes published rows. It is not scheduled yet (Phase 23 sets the TTL).
