# World runner specification and runbook

Executable source:

- `apps/simulation/src/runner.ts`: `SimulationRunner` and `startRunnerLoop`;
- `apps/simulation/src/main.ts`: wiring and health;
- `apps/simulation/src/control-cli.ts`: operator controls;
- `packages/db/src/runner.ts` and `packages/db/migrations/0006_world_runner.*.sql`: lease, schedule, controls and status;
- `packages/domain/src/schedule.ts`: schedule segments.

Decision record: `docs/adr/0008-world-runner-lease-and-schedule.md`.

## Authority

The simulation process is the only thing that advances worlds. The API, workers and browsers never do; their uptime has no effect on the clock.

A world advances only by `world.advance` commands. They are committed through `processCommand`, so every rule of the command transaction applies: idempotency, stale-write rejection, checkpoints and the outbox. Each commit also carries the **world lease fence**.

## Schedule

A season maps ticks `0 … endTick` (739,490 for 1–2026 CE) onto its real window `[startsAt, endsAt)`. The runner uses a **schedule segment** `(anchorTick, anchorAt, endsAt)`. Ticks due at time *t* are:

```
due(t) = anchorTick + ⌊(t − anchorAt) · (endTick − anchorTick) / (endsAt − anchorAt)⌋, clamped to [anchorTick, endTick]
```

- **Exact arithmetic.** It is computed from the anchor with BigInt, so there is no drift. A season of 30 × 24 h gives about 1,027 ticks per hour, and every tick is due by `endsAt`.
- **Initial segment.** The first segment is `(0, startsAt, endsAt)`, which equals the Phase 02 `ticksDueAt`; a property test checks this.
- **Extension.** An extension re-anchors at the world's current clock and the current time, with a later end. Directly after it, `due = clock`: there is no jump in either direction, and the season still ends exactly at the new `endsAt`. Property tests cover endpoints, monotonicity, exact inversion with `dueAt`, re-anchoring after any pause, and 50 chained extensions without drift.
- **No backwards movement.** Simulated time never moves backwards:
  - the kernel only moves the clock forward;
  - `world_state` has a forward-only trigger (Phase 03);
  - schedule anchors only move forward (trigger on `world_runners`).

## Lease and fencing

`civ.world_runners` holds one lease per world: holder, fencing token and expiry. Lease expiry **and the schedule** use the **database clock** (`now()`; the runner reads it with `databaseNow`), so a runner host with a skewed clock can neither keep a lease too long nor advance early.

| Operation | Behaviour |
|---|---|
| **Acquire or renew** | Succeeds when the lease is free, has expired, or is already this holder's. Renewing a live own lease keeps the token. Every new acquisition, including an expired own lease, **increments the token**. |
| **Commit fence** | `commitCommand({ fence })` share-locks the lease row inside the command transaction. It requires the same holder and token and an unexpired lease, otherwise it raises `FencingError` and writes nothing. A takeover (an `UPDATE` of the row) waits for an in-flight commit and sees its result; a holder with an old token can never commit. Every runner-written state change uses the fence: advances, pause/resume, control decisions, schedule extensions and season status. |
| **Release** | On graceful shutdown the token is kept, so the released holder stays fenced. |

A runner that loses its lease reports `standby` and stops writing for that world. Only one runner advances a world at a time; tests cover 12 concurrent contenders and two runners cycling in parallel.

## Cycle

`startRunnerLoop` runs one cycle every `RUNNER_INTERVAL_MS`; cycles never overlap. For each world whose latest season is scheduled, live or paused:

1. **Engine check.** Build the world's engine (season-one systems, stored map). Its versions must equal the world's launch versions (`EngineMismatchError`).
2. **Lease.** Ensure a runner row exists (from the season), then acquire or renew the lease. No lease means `standby`.
3. **Season start.** At `startsAt` the season moves from scheduled to live (audited).
4. **Controls.** Apply pending operator controls in order (next section).
5. **Due ticks.** Read the clock and compute `due` and `backlog = due − clock`. If the season status disagrees with the world (for example, after a crash between a pause and its status update), set it to follow the world.
6. **Decide.**
   - At `endTick`: the season becomes completed, and the runner state is `completed`.
   - When the world is paused: the runner state is `paused`. Ticks stay due; the backlog grows.
   - When the backlog exceeds `RUNNER_CATCH_UP_CEILING_TICKS` and no catch-up is approved: the runner state is `held`. It logs the alert `runner_backlog_held` and does not advance.
   - Otherwise it submits one `world.advance` of `min(backlog, RUNNER_MAX_TICKS_PER_BATCH, engine limit)` ticks, with the fence and the idempotency key `adv:<commandPosition>:<from>:<to>`. Catch-up is therefore bounded to one batch per cycle.
     - The command position changes with every recorded command, so a crash retry reuses the key and a rejected advance is retried under a new key next cycle.
     - A rejection marks the world `failed` with the alert `runner_advance_rejected`.
     - A catch-up approval is cleared once the world reaches it.
7. **Status and alerts.** Record the state, backlog and last cycle (fenced). A backlog above `RUNNER_BACKLOG_ALERT_TICKS` logs the alert `runner_backlog`.

**Crash safety.** All authoritative state is in PostgreSQL, so a restarted runner continues from the stored clock.
- A crash before a commit's `COMMIT` leaves nothing behind.
- A crash after it leaves a committed batch that the next cycle builds on.

In both cases the result has neither a duplicate nor a missed tick. The integration test covers every commit boundary of a timeline that includes a season start, advances, and operator pause and resume:
- it injects a crash before and after **each of the run's 18 `COMMIT`s** (36 scenarios);
- after each crash, a new runner takes over once the lease expires;
- the run must end with the same tick ranges, state hash, command keys, season status and control decisions as an uninterrupted run.

## Operator controls

Only operators listed in `RUNNER_CONTROL_OPERATORS` are honoured; controls from anyone else are rejected and audited. `*` (any operator) is refused in production. Role-based authorization and recent-authentication checks arrive with the admin API (Phase 21).

Operators queue controls in `civ.runner_controls`. Each control is idempotent by request key, requires an operator actor and a reason, and is audited (`runner.control.requested`). The lease holder applies controls in order and records each decision exactly once (`runner.control.applied` or `runner.control.rejected`). A trigger makes decisions final.

```
pnpm --filter @civ/simulation runner:control <worldId> <action> [amount] --operator <opr_…> --reason "<text>" --key <request key>
```

| Action | Effect |
|---|---|
| `pause` | Commits `world.pause` (actor: the operator). The season becomes `paused` with the status note `Paused: <reason>`. The runner stops advancing after the current transaction. |
| `resume` | Commits `world.resume`; the season becomes `live`. A backlog within the ceiling is caught up in bounded batches; a backlog above it holds the world. |
| `step <ticks>` | Only when `RUNNER_ALLOW_STEP=true`, which the environment refuses in production, and only on a paused world. Commits resume, advance and pause, all under one control. Otherwise the control is rejected. |
| `approve_catch_up` | Allows automatic catch-up up to the ticks due at approval time despite the ceiling. |
| `extend <minutes>` | At most `RUNNER_MAX_EXTENSION_MINUTES` per control (default 7 days; the database allows at most 30 days). Audited schedule extension: re-anchors at the current clock and time, and moves the season end and the public status note (`Schedule extended by … h: <reason>`). The audit action is `season.schedule_extended`, with the previous and new end. |

Each kernel command of a control uses the key `ctl:<id>:<step>`. A step already in the log is not sent again, so a crash part-way through a control resumes it without duplicating any command.

## Maintenance procedure

1. `pause` with a reason. The status note is public.
2. Do the maintenance.
3. `resume`.
   - **Short outage** (backlog within the ceiling, default 2,000 ticks ≈ 2 h): the runner catches up automatically at up to `RUNNER_MAX_TICKS_PER_BATCH` ticks per cycle (default 365 per second).
   - **Long outage:** the world is held (`runner_backlog_held`). Choose one:
     - `approve_catch_up`: the history is played quickly to rejoin the schedule; or
     - `extend <minutes>`: the public end moves later by about the lag (`lagMs`), so the season keeps its pace.

   Either decision is audited.

## Metrics, alerts and health

| Signal | Where | Action |
|---|---|---|
| Runner state, backlog in ticks, last cycle and last error per world | `civ.world_runners` | Query it during an incident. |
| `runner_backlog` (warn) | logs, with world, backlog, due and clock | The world is behind by more than about 6 minutes. Check the runner and database. |
| `runner_backlog_held` (error) | logs | An operator must approve catch-up or extend the schedule (procedure above). |
| `runner lost the world lease` (warn) | logs | Another runner took over; expected on failover. |
| `runner cycle failed` (error) | logs and `last_error` | Investigate. `EngineMismatchError` means this build cannot run the world's launch versions. |
| Readiness `runner` probe | `/health/ready` | Fails while the last cycle failed for any world, or when no cycle has completed for 5 intervals plus the lease TTL. |
| Prometheus metrics | `GET /metrics` on the simulation health port | Per world: `civ_runner_backlog_ticks`, `civ_runner_lease_held`, `civ_runner_world_state{state}`. Per process: `civ_runner_ticks_advanced_total`, `civ_runner_cycles_total`, `civ_runner_cycle_duration_ms`, `civ_runner_last_success_age_ms`. Alert rules: backlog above the alert threshold for 5 minutes; `state="held"`; last success older than 1 minute. |

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RUNNER_ENABLED` | `true` | Run the runner loop. |
| `RUNNER_INTERVAL_MS` | 1,000 | Cycle interval. |
| `RUNNER_LEASE_TTL_MS` | 15,000 | Lease lifetime; renewed every cycle. |
| `RUNNER_MAX_TICKS_PER_BATCH` | 365 | Largest advance per cycle (≤ engine limit of 3,650). |
| `RUNNER_CATCH_UP_CEILING_TICKS` | 2,000 | Backlog above which the world is held. |
| `RUNNER_BACKLOG_ALERT_TICKS` | 100 | Backlog that raises `runner_backlog`. |
| `RUNNER_ALLOW_STEP` | `false` | Single-step controls; rejected at startup with `NODE_ENV=production`. |
| `RUNNER_CONTROL_OPERATORS` | empty (no controls) | Comma-separated operator IDs whose controls are honoured; `*` allowed only outside production. |
| `RUNNER_MAX_EXTENSION_MINUTES` | 10,080 | Largest extension per control. |

## Migration 0006

| Content | Lock/rewrite risk | Rollback |
|---|---|---|
| `world_runners` with a forward-only trigger, and `runner_controls` with a decide-once trigger | New tables only. | `down` drops both (operational state). It refuses (55000) once a schedule extension was applied, because the re-anchored schedule would be lost; roll forward instead. |
