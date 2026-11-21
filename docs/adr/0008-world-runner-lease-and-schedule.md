# ADR 0008: World runner, lease fencing and schedule segments

- Status: Accepted
- Date: 2026-11-21

## Context

Phase 06 needs a headless runner that advances worlds on a 30-day real-time schedule:
- without duplicate or missed ticks across crashes;
- with at most one advancing runner per world;
- with explicit maintenance behaviour (bounded catch-up or an audited extension);
- with pause, resume and single-step for authorized environments;
- with backlog metrics.

The kernel (Phase 02) and the command transaction (Phase 03) already make each advance idempotent and stale-safe.

## Decisions

1. **The lease and fencing token live in PostgreSQL, and the fence is checked inside the command transaction.**
   - The token increases on every acquisition.
   - `commitCommand` share-locks the lease row and requires the holder, the token and an unexpired lease.
   - Rejected alternatives:
     - **Advisory locks:** they are tied to one connection and give no fencing token for writes on other connections.
     - **Redis locks:** Redis is not authoritative (ADR 0005).
2. **The database clock decides lease expiry and due ticks.** Two runners can never both consider themselves holders because of skew, and a skewed host cannot advance early.
3. **The schedule is a piecewise-linear segment with an anchor.**
   - An audited extension re-anchors at (clock, now) with a later end.
   - Alternatives:
     - **Shifting the season's start and end:** this changes past mapping and the public start.
     - **Stretching the whole schedule:** this makes due ticks jump backwards.
   - Segments keep exact integer arithmetic from each anchor, so there is no drift.
4. **Bounded catch-up, then a decision.**
   - A backlog within a configured ceiling is caught up automatically, one bounded batch per cycle.
   - Above the ceiling, the world is **held** until an operator approves catch-up or extends the schedule; both decisions are audited.
   - History is never skipped.
5. **Operator controls are a queue in the database, applied by the lease holder.**
   - Controls go through the same fenced, idempotent command path as everything else.
   - Each control's kernel commands have deterministic keys, so partial application resumes safely after a crash.
   - The admin UI and API (Phase 21) will enqueue into the same table.
6. **Single-step** is resume, advance and pause as three ordinary kernel commands. It is honoured only with `RUNNER_ALLOW_STEP`, which the environment refuses in production. The kernel has no special step mode, so the engine version is unchanged.
7. **One advance per world per cycle,** with deterministic idempotency keys and command IDs (`adv:<commandPosition>:<from>:<to>`). A crash before `COMMIT` leaves nothing and reuses the key; a crash after it is continued from the stored clock. A rejection moves the command position, so the next attempt has a new key.
8. **Interim operator authorization.** Controls are honoured only from operators listed in configuration (`*` is refused in production), and extensions are capped. Full role-based authorization and recent authentication come with the admin API (Phase 21).
9. **Metrics** use a Prometheus text endpoint on the simulation health port, with gauges and counters for backlog, lease, state and cycles, alongside structured alert logs.

## Consequences

- Failover takes at most the lease TTL (default 15 s) plus one cycle, during which the backlog grows and is then caught up.
- Every runner write needs a live lease, so a database stall longer than the TTL makes the holder stand by instead of risking stale writes.
- The runner drives season status (scheduled → live → paused/completed). Public status notes are written for pauses and extensions.
