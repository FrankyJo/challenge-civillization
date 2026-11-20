# Phase 03 — authoritative persistence and delivery

Read `prompts/PHASE-CONTRACT.md`, `docs/ARCHITECTURE.md`, and use `/data-contracts`.

Implement PostgreSQL schema/repositories for worlds, seasons, command log, checkpoints, current aggregate state, append-only partition-ready domain events, transactional outbox, consumer inbox/idempotency, and audit metadata. Implement transaction boundaries that atomically validate expected version, append events, update current state/checkpoint, and enqueue outbox work.

Add migrations with roll-forward/rollback notes, indexes justified by queries, local reset only for development, and integration tests using real PostgreSQL. Redis/BullMQ consumers must be retry-safe; Redis loss cannot lose authoritative facts.

Acceptance: duplicate commands/jobs have one effect; rollback leaves no partial state/event/outbox; event ordering/cursors are stable; concurrent stale writers are rejected; a projection consumer recovers after Redis restart; migrations apply to empty and previous fixture DBs; events cannot be updated/deleted through application repositories; gates pass.
