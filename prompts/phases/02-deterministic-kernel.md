# Phase 02 — deterministic kernel

Read `prompts/PHASE-CONTRACT.md` and use `/simulation-domain`.

Implement integer simulation time/calendar mapping for 1–2026 CE, stable ID derivation, named splittable PRNG streams, fixed-point/unit helpers, canonical serialization/hash, system ordering, and pure command→event/state transition scaffolding. Make clock mapping use rational/integer arithmetic so 30-day scheduling cannot drift.

Ban ambient `Math.random()`, wall clock, locale sorting, and network/DB access inside domain code with tests/lint boundaries. Add deterministic fixtures covering same seed/input equality, stream isolation, different-seed divergence, calendar boundaries, serialization ordering, and checkpoint hash stability.

Acceptance: repeated runs on supported platforms produce identical canonical event/state hashes; adding random draws in one named stream does not perturb another; year 1 starts and year 2026 completes at defined boundaries; unit overflow/rounding behavior is specified and tested; gates pass.
