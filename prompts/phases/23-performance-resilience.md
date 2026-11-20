# Phase 23 — performance, partitioning, soak, and failure testing

Read `prompts/PHASE-CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/TEST-STRATEGY.md`. Use the performance agent and `/quality-gates`.

Build realistic workload generators for 10k initial NPCs, growth bounds, full event history, live visitors, projection rebuilds, and archive queries. Profile tick systems, DB queries/indexes, event partitions, queues, serialization, API/WebSocket, Vue, and Phaser. Optimize measured bottlenecks only, preserving determinism/correctness.

Run accelerated 1–2026 CE simulation, long soak, runner/API/worker restarts, lease contention, queue duplication/outage, DB connection pressure, slow consumers, projection rebuild, and degraded AI provider. Establish capacity envelope, catch-up ceiling, storage forecast, and scaling/runbook thresholds.

Acceptance: full run completes within approved time/memory/storage budget with zero invariant violations and stable replay hash; p95/p99 service budgets hold under target load; no unbounded memory/queue/backlog; injected failures recover without event loss/duplication; benchmark artifacts and profiles are retained.
