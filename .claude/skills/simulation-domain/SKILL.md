---
name: simulation-domain
description: Apply deterministic simulation architecture, domain invariants, event semantics, clocks, randomness, units, and replay rules.
---

# Simulation domain

Read `docs/DOMAIN.md` and `docs/ARCHITECTURE.md`. Preserve these non-obvious rules:

- Domain transitions accept explicit state, command, simulation time, config/content versions, and named PRNG streams; they return new state/events/effects.
- Only the runner performs effects. Network, filesystem, queue, DB, locale, and wall time stay outside transitions.
- Assign stable system order. Derive random streams by stable labels rather than consumption order so adding a draw in one subsystem does not perturb unrelated systems.
- Use explicit units and fixed-point/integer quantities. Conservation checks include loss/waste.
- Events are past-tense facts with schema version, world/tick, causation/correlation, entity IDs, and enough data for projections/audit.
- Commands are idempotent and reject stale expected versions where concurrency matters.
- Checkpoints include canonical state/event cursor/config/content/engine versions and hash.

When adding a system, document its resolution (individual/cohort/aggregate), cadence, inputs/outputs, invariants, calibration sources, performance budget, and downgrade/fallback behavior.
