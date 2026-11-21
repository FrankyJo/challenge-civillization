# Deterministic kernel specification

Executable source: `packages/domain/src`. Decision record: `docs/adr/0004-deterministic-kernel.md`. Contract rules: `docs/CONTRACTS.md`.

## Determinism rules (enforced)

Domain production code (`packages/domain/src`, non-test) may not use any of the following. ESLint enforces each ban, and `tests/tooling.test.mjs` proves each one fails.

- **Ambient randomness:** `Math.random`, `crypto`.
- **Wall clock and timers:** `Date`, `performance`, timers, `process`.
- **Network or DB I/O:** `fetch`, Node built-ins, infrastructure packages.
- **Locale-dependent APIs:** `Intl`, `localeCompare`, `toLocale*`.
- **Implementation-approximated `Math` functions:** `exp`, `log`, `pow`, trigonometric functions, `cbrt`, `hypot`, and similar.
- **The `**` operator.**
- **Bypass routes:** `globalThis`/`global`/`window`/`self`, GC-timing APIs (`WeakRef`, `FinalizationRegistry`), `queueMicrotask`/`setImmediate`, `require`, dynamic `import()`, computed `Math[...]` access, aliasing or destructuring `Math`, and every Node built-in module name.

The dependency policy (`pnpm arch:check`) limits production imports to `@civ/contracts` and `zod`.

Sorting uses explicit comparators (numeric, or UTF-16 code units). All hashing goes through RFC 8785 canonical JSON (`canonicalHash`), so key insertion order never matters.

## Calendar `civ365-daily-v1`

- One tick is one simulated day, and every year has exactly 365 days. This is a computational calendar, not Julian or Gregorian: leap days carry no simulation meaning.
- **Clock position** is the number of completed ticks. Tick `t` simulates year `startYear + ⌊t/365⌋`, day `t mod 365 + 1`.
- **Season 1 (1–2026 CE):**
  - `endTick = 2026 × 365 = 739,490`;
  - year 1 starts at position 0;
  - year *y* starts at `(y − 1) × 365`;
  - year 2026's last day is tick 739,489;
  - position 739,490 means the season is complete. Its instant is `{ year: 2027, dayOfYear: 1 }`.
- **Instant validation:** an instant is consistent when its year and day equal those derived from its tick. The kernel rejects commands whose `instant` is inconsistent.
- **Not calendar-validated:** the contracts layer cannot validate calendars, and Phase 01's frozen fixtures predate the calendar. Their instants, such as tick 1024 with day 290, are contract-valid but not calendar-consistent. Fixtures added from Phase 02 on are consistent.

## Real-time schedule

For a season `[startsAtMs, endsAtMs)` of `totalTicks` ticks:

- `ticksDueAt(now) = ⌊(now − start) · totalTicks / duration⌋`, clamped to `[0, totalTicks]`;
- `dueAtMs(k) = start + ⌈k · duration / totalTicks⌉`, the first instant at which `k` ticks are due.

Both are computed from the origin with BigInt, so there is no accumulated drift, and all ticks are due exactly at `endsAtMs`. A 30 × 24 h season (`SEASON_DURATION_MS`) runs at about 1,027 ticks/hour on average, which is the product's ≈2.8139 years/hour.

Pauses, catch-up ceilings and extensions are runner policy (Phase 06). They change the schedule; they never change this arithmetic.

## Random streams

Every stream is named by a label path, for example `["system", "births", tick]`, and keyed by `SHA-256(canonical(["civ.prng.v1", seed, ...path]))`.

- **Generator:** xoshiro128** 1.1, verified against the reference outputs.
- **Isolation:** a stream's output depends only on the seed and its path. Draws in one stream never perturb another, and `split(...labels)` children do not depend on how much the parent drew.
- **Labels** are non-empty strings or safe integers. `1` and `"1"` are different labels, and canonical array encoding makes `["ab","c"]` ≠ `["a","bc"]`.
- **Integer-only API:**
  - `nextUint32`;
  - `nextInt(min, max)`, unbiased by rejection sampling, for ranges up to 2^53;
  - `chance(n, d)`, with exact probability `n/d`;
  - `weightedIndex(integerWeights)`;
  - `pick`;
  - `shuffled`, which uses Fisher–Yates and does not mutate its input.
- There is no float draw.

## Stable IDs

`deriveId(kind, ...scope)` returns `<prefix>_<16 base-36 chars>`, built from the first 80 bits of `SHA-256(canonical(["civ.id.v1", kind, ...scope]))`.

- IDs are the same on every platform and do not depend on creation order.
- The collision probability is about 4·10⁻¹³ per 10⁶ IDs of one kind.
- The kernel derives event IDs from `(worldId, sequence)` and checkpoint IDs from `(worldId, eventPosition, clock)`.

## Units and fixed point

Every amount is a safe integer in its unit's smallest step.

**Overflow:** any result outside ±(2^53 − 1) throws `UnitOverflowError`. Nothing wraps or saturates.

**Rounding:** division, rate (`applyPpm`, parts per million) and unit conversion compute the exact rational result with BigInt and round once, with a mode stated at every call site. There is no default mode.

| Mode | Rule | −1.5 | −0.5 | 0.5 | 1.5 |
|---|---|---|---|---|---|
| `floor` | toward −∞ | −2 | −1 | 0 | 1 |
| `ceil` | toward +∞ | −1 | 0 | 1 | 2 |
| `trunc` | toward 0 | −1 | 0 | 0 | 1 |
| `half_even` | nearest, ties to even | −2 | 0 | 0 | 2 |
| `half_up` | nearest, ties away from 0 | −2 | −1 | 1 | 2 |
| `exact` | throw `InexactResultError` unless the result is an integer | — | — | — | — |

**Allocation:** `allocate(total, weights)` splits a total exactly (parts always sum to the total) using largest remainder; ties go to the lower index.

**Quantities:** a `Quantity` is `{ unit, amount }`. Arithmetic requires equal units, and `convert` works only within a dimension. The standard units are:

| Dimension | Units |
|---|---|
| count | — |
| mass | g, kg, t |
| volume | ml, l, m³ |
| length | m, km |
| area | m², ha |
| food energy | kcal |
| time | day, year (365 days) |

## Systems and transitions

**Systems:**
- A `SimulationSystem` has an `id`, a unique integer `order`, a `cadence` (`every`/`offset` in ticks) and `run(data, context)`.
- `run` returns new data plus event drafts. It must not mutate its input.
- Systems run in ascending `order` within each tick, never in registration order.
- Each run gets the stream `["system", id, tick]`.
- The schedule descriptor and calendar are hashed into `configVersion`.

**World data guard:**
- World data must be plain JSON: finite numbers, strings, booleans, null, plain objects and dense arrays.
- The kernel deep-freezes it when a world is created and after every system run.
- The guard stops at already-frozen nodes, so its cost is proportional to what a system changed.
- A system that mutates its input throws `TypeError` (strict-mode write to a frozen object), and the input state stays intact.
- Non-JSON data throws `WorldDataError` with the offending path.

**Transitions:** `createEngine(options).apply(state, command)` is pure. It returns either:
- `{ accepted: true, state, events }`; or
- `{ accepted: false, rejection: { code, message } }`, which has no events and leaves state unchanged.

**Checks, in order:**

| Check | Rejection code |
|---|---|
| world matches | `wrong_world` |
| versions match the engine's (replay must use the original versions) | `version_mismatch` |
| `expectedVersion` (when not null) equals `state.version` | `stale_version` |
| command `instant` is calendar-consistent | `inconsistent_instant` |

**Commands:**

| Command | Rejected when (code) | Effect / events |
|---|---|---|
| `world.pause` | already paused (`already_paused`) | emits `world.paused` |
| `world.resume` | not paused (`not_paused`) | emits `world.resumed` |
| `world.advance { fromTick, toTick }` | paused (`world_paused`); `fromTick ≠ clock` (`clock_mismatch`); `toTick > endTick` (`beyond_end`); span greater than `maxTicksPerAdvance` (`too_many_ticks`; default 3,650 = ten years, part of the config digest) | runs systems for each tick in `[fromTick, toTick)`, then emits `world.advanced` |

**Events:**
- Each event gets sequence = `state.eventPosition`, a derived event ID, a calendar instant, causation = the command, the command's correlation ID and the engine's versions.
- Events are validated against the contract registry. A system emitting an unregistered event, or any `world.*` event (reserved for the kernel), is a programming error and throws.
- **When `apply` throws:** only on defects (system errors, invalid data or events). Invalid commands are rejections, not throws.

**Idempotency:** the kernel applies the ordered, deduplicated command log it is given.
- Duplicate delivery is removed before the kernel, by the command log's unique `(world, idempotencyKey)` constraint (Phase 03).
- `world.advance` is additionally self-guarding through `fromTick`.
- `expectedVersion` provides optimistic concurrency for operator commands.

**Replay:** `replay(engine, initial, commands)` folds an ordered command stream.

**Checkpoints:** `engine.checkpoint(state)` returns the `checkpoint` contract, built from the state's canonical hash, the event position, the instant and the versions.

## Evidence of determinism

- **Golden values** (frozen inline in `kernel.test.ts`, `random.test.ts`, `ids.test.ts`) cover:
  - the config, event and state hashes of a 4,397-tick scripted scenario;
  - its checkpoint;
  - the PRNG sequences;
  - a derived ID.
- CI runs with `CI=true`, so a golden value that differs on any platform fails instead of being rewritten.
- The Phase 02 report records the same full-season probe producing identical hashes on macOS arm64 (Node 22) and Linux arm64 (Node 22 and 24).
