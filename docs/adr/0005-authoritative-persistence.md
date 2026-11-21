# ADR 0005: Authoritative persistence and delivery

- Status: Accepted
- Date: 2026-11-21

## Context

Phase 03 needs PostgreSQL storage for worlds, seasons, the command log, checkpoints, current state, an append-only partition-ready ledger, a transactional outbox, consumer idempotency and audit metadata.

The constraints:
- One transaction must validate the expected version, append events, update state and checkpoints, and enqueue outbox work.
- Duplicate commands or jobs must have one effect.
- Redis loss must not lose facts.

## Decisions

1. **Per-world pessimistic lock plus optimistic `basedOn` check.**
   - `commitCommand` locks the `world_state` row (`FOR UPDATE`), then rejects a writer whose outcome was computed from another version or position (`StaleWriteError`).
   - The lock serialises duplicate checks and log positions without SERIALIZABLE retries. The check prevents committing a transition computed from stale state.
   - The engine runs outside the transaction, so a long `world.advance` never holds the lock while computing.
   - Rejected alternatives:
     - **SERIALIZABLE isolation:** retry storms under concurrent duplicates.
     - **Computing inside the lock:** the lock is held for the whole computation.
2. **Rejected commands are logged.**
   - The log holds every processed command, accepted or rejected, in order.
   - Idempotency covers rejections too, and the log is the exact replay input.
   - The kernel's `version` counts accepted commands only; `command_position` counts all.
3. **Idempotency is by `(world, idempotencyKey)` plus a request digest.**
   - The digest excludes `commandId`, `issuedAt` and `correlationId`, so a retry that re-mints them is a duplicate.
   - The same key with different intent is a conflict, never silently deduplicated.
   - `commandId` is globally unique.
4. **The ledger is list-partitioned by world, with no default partition.**
   - Each world gets its partition at creation; a missing partition fails loudly instead of trapping rows in a default partition.
   - Partitioning by tick range is deferred until event volume is measured (ARCHITECTURE: "benchmark before adding distributed complexity").
   - Event envelopes are stored as typed columns plus `payload jsonb`, and rebuilt and re-validated on read. There is no redundant envelope copy to drift.
5. **Append-only is enforced in the database** by `BEFORE UPDATE/DELETE/TRUNCATE` triggers (SQLSTATE 23001), not only by the repository API. `world_state` may only move forward. DDL and `session_replication_role` bypasses are closed by role privileges in shared environments (Phase 24).
6. **The current state is stored as one `jsonb` row per world, with its canonical hash.**
   - The store recomputes the hash with `node:crypto` on every write and read. The domain uses its own pure SHA-256, so two independent implementations cross-check each other.
   - Normalised per-entity tables arrive with the systems that need them (Phases 05–11).
7. **Outbox rows are notifications, not facts.**
   - The job payload names a ledger range, but consumers read events from PostgreSQL by durable cursor.
   - The relay leases rows in a short statement and publishes outside any transaction with a timeout, so a Redis outage never pins database connections or locks.
   - Lost, duplicated or reordered jobs are therefore harmless.
   - A periodic reconciler catches lagging projections up directly, so recovery after a Redis restart needs no operator action and no replay of Redis state.
8. **Exactly-once effect = cursor or inbox marker committed with the effects.**
   - Ledger consumers lock their offset row.
   - Generic jobs use `inbox (consumer, message_key)`.
9. **Rollback policy.**
   - A `down` migration that would destroy authoritative data refuses when data exists; production rolls forward.
   - Projections are droppable and rebuildable.
   - The full development reset is guarded by environment, an explicit flag and a loopback host.
10. **The command submission queue is not added yet.** The log records commands at processing time. The API-side pending-command intake (ARCHITECTURE step 5) arrives with the runner (Phase 06) and the admin API (Phase 21), which define its producers. It will reuse this log's key and digest semantics.

## Consequences

- One world's commits are serialised. Measured locally: about 370 single-event commits/s and about 35k events/s in bulk inserts, ample for about 1,027 ticks/h.
- Different worlds commit in parallel.
- A Redis outage delays projections by at most the reconcile interval after Redis returns. It never loses or corrupts authoritative data.
- Integration tests ran on a local PostgreSQL 16 during this phase because the Docker volume was full; CI runs PostgreSQL 17. No PostgreSQL-17-only features are used.
