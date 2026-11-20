# Phase 20 — Phaser live and historical map

Read `prompts/PHASE-CONTRACT.md` and `docs/ANALYTICS-ARCHIVE.md`; use `/phaser-ui`.

Implement the Phaser map inside the Vue shell with typed adapter boundaries. Render terrain/environment, settlements, borders, routes, resource/public layers, population clusters, alerts, and sampled movement. Use zoom/viewport-dependent aggregation, object pooling/batching, capped animation, layer controls, selection/deep links, and snapshot+delta cursor synchronization.

Historical mode loads the nearest immutable snapshot and applies ordered deltas to a chosen year/cursor; live mode resumes after reconnect or triggers full resync on a gap. Provide keyboard/list alternatives, reduced motion, readable legends, and non-map access to all essential facts.

Acceptance: map state at historical cursor equals canonical spatial projection; reconnect/gap/out-of-order tests pass; low/mid target devices meet FPS/memory/payload budgets with 10k population; detail degrades gracefully; long replay has no unbounded object/memory growth; visual/regression fixtures are deterministic.
