# Phase 06 — headless runner, leases, checkpoints, and season schedule

Read `prompts/PHASE-CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY-OPERATIONS.md`.

Implement the standalone simulation runner: real-time schedule mapping, due-tick calculation, PostgreSQL world lease/fencing, bounded batches, transactional tick commits, checkpoints, restart/resume, pause/resume/single-step for authorized environments, lag/backlog metrics, and catch-up ceiling. Browser/API uptime must not control advancement.

The configured 30-day window maps 1–2026 CE without drift. Maintenance behavior is explicit: bounded catch-up or an audited schedule extension decision. Simulated time never moves backward and a lease holder with an old fencing token cannot commit.

Acceptance: crash/restart at every commit boundary produces neither duplicate nor missed ticks; two runners cannot both advance; lease expiry/fencing tests pass; clock property tests cover schedule endpoints and pauses; backlog alerts/metrics exist; deterministic replay from checkpoint matches uninterrupted execution.
