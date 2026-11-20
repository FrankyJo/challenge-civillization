# Phase 01 — executable contracts and architecture boundaries

Read `prompts/PHASE-CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, and use `/data-contracts`.

Implement versioned Zod schemas and TypeScript types for world/season metadata, simulation instant, command envelope, domain-event envelope, content/config versions, cursor/checkpoint, API error, and proposal/source/review states. Establish package public APIs and architecture tests that prevent UI/API/DB adapters from being imported into the pure domain package.

Define canonical serialization rules, stable IDs, tagged unions, compatibility fixtures, and explicit public DTO allowlists. Add schema documentation generated or checked from code. Provide test builders without weakening production validation.

Acceptance: invalid/unknown boundary data is rejected; every envelope contains required audit/version fields; persisted fixture versions remain readable; public DTO tests exclude internal/admin fields; dependency-boundary tests fail on forbidden imports; all workspace gates pass. Do not invent domain event variants that later phases have not specified—create extensible envelope mechanics with a small proven example.
