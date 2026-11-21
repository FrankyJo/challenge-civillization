# ADR 0004: Deterministic kernel primitives

- Status: Accepted
- Date: 2026-11-21

## Context

Phase 02 requires:

- integer time and calendar for 1–2026 CE;
- a drift-free 30-day schedule;
- stable IDs;
- named, splittable PRNG streams;
- fixed-point units;
- canonical hashing;
- system ordering;
- a pure command → event/state transition.

All of this must produce identical hashes on every supported platform.

## Decisions

1. **One tick = one simulated day, in a 365-day computational year** (`civ365-daily-v1`).
   - Season 1 is 739,490 ticks, about 1,027 ticks/hour (one every ≈3.5 s).
   - Uniform years put boundaries at exact multiples of 365 and keep calendar arithmetic trivial.
   - Leap days carry no simulation meaning; display dating is a presentation concern.
   - Systems needing coarser cadence (yearly demography) use cadences, not a coarser tick.
   - Changing the calendar is a new calendar ID inside the config digest.
2. **The clock position is completed ticks.** Year 1 starts at 0, and completion is `endTick`; the completion instant is 1 January of `endYear + 1`.
3. **The schedule is computed from the origin with BigInt** (`ticksDueAt`, `dueAtMs`), never incrementally. Pause and catch-up policy belongs to the runner (Phase 06).
4. **Pure-TypeScript SHA-256 in the domain.** `node:crypto` is forbidden there (policy: browser-safe, no Node built-ins). It is verified against FIPS vectors and against `node:crypto` with property tests. Throughput is about 150 MiB/s on an M1 Pro, which is ample for checkpoints.
5. **PRNG: xoshiro128**, keyed per stream** by SHA-256 of a canonical label path.
   - It uses only exact 32-bit integer operations (`Math.imul`, shifts).
   - It runs at about 250M draws/s and passes standard test batteries.
   - Path-keyed derivation gives stream isolation by construction.
   - The API is integer-only.
   - Alternatives rejected:
     - **PCG32:** needs 64-bit multiplication, so BigInt, which is slow.
     - **Counter-based schemes such as SHA per draw:** too slow.
     - **Float APIs:** bit-identity across engines is not guaranteed for transcendental functions.
6. **Derived IDs use 80 bits of SHA-256 in base 36.** They depend on scope, not order, and are reproducible on replay. The contract allows bodies of 8–64 characters; derived bodies are always 16.
7. **Safe-integer quantities.** Exact BigInt intermediates, an explicit rounding mode per call, overflow throws.
   - Alternatives rejected: BigInt everywhere (slower and awkward in JSON); decimal libraries (a new dependency, unnecessary).
8. **Kernel transitions are pure functions** of state, command and engine options.
   - Rejections carry no events and leave state unchanged.
   - Systems run in explicit `order`, each with a `["system", id, tick]` stream.
   - Event and state hashes use canonical JSON.
   - Engine versions are bound into every event; commands carrying other versions are rejected, so replay must use the original versions.
9. **New contract variants: `world.advance` (command) and `world.advanced` (event).**
   - `docs/ARCHITECTURE.md` specifies that the scheduler asks the engine to run due ticks.
   - `docs/SECURITY-OPERATIONS.md` allows operators to single-step and run bounded catch-up.
   - A `world.advance` command gives every tick-produced event a causing command, and the `world.advanced` event lets projections follow the clock.
10. **The domain lint guard is extended:** it now also bans `Intl`, locale methods, implementation-approximated `Math` functions, `**`, host-global and GC-timing APIs, dynamic `import()`, `Math` aliasing and computed access, and all Node built-in modules.
11. **World data is frozen and JSON-validated by the kernel**, incrementally (stopping at frozen nodes). Purity and "a failed transition leaves its input intact" are therefore enforced, not just documented.
12. **`world.advance` is bounded** by `maxTicksPerAdvance` (default 3,650 ticks), which is part of the config digest. `world.*` event types are reserved for the kernel.
13. **Command deduplication is not kernel state.** An unbounded set of applied keys would grow with every command. The command log's unique `(world, idempotencyKey)` constraint (Phase 03) removes duplicates before replay, and the kernel applies the log as given.

14. **`ENGINE_VERSION` goes to 0.2.0.** Golden hashes are frozen inline in tests; changing them requires a deliberate engine version bump.

## Consequences

- Season length and tick rate are fixed by the calendar. Choosing finer time (for example hours) later would be a new calendar and engine version, and existing worlds would keep replaying under the old one.
- One `world.advance` per batch makes all events of the batch share a causing command; batch size is runner policy.
- The cross-platform claim is evidenced for arm64 (macOS and Linux, Node 22 and 24) locally and for x64 by CI golden tests once CI runs.
