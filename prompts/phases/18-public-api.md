# Phase 18 — public API and live delivery

Read `prompts/PHASE-CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY-OPERATIONS.md`. Use `/data-contracts`.

Implement versioned read-only public endpoints for world/season status, current/historical map snapshots/deltas, timeline/events, entities, analytics, metric definitions, and methodology metadata. Add cursor pagination, filtering limits, ETags/cache policy, rate limits, compression, error contracts, and OpenAPI.

Implement WebSocket/SSE live updates with monotonic projection cursors, bounded buffers, heartbeats, authorization where needed, reconnect/resume, gap detection, and HTTP snapshot fallback. Never expose authoritative/admin/private/raw prompt fields.

Acceptance: contract tests and generated docs agree; pagination is stable; cache invalidation follows projection cursor/content version; reconnect/gap scenarios pass; abusive size/rate/filter requests are bounded; public DTO allowlists hold; load test meets recorded p95/error/bandwidth targets; simulation remains independent of client load.
