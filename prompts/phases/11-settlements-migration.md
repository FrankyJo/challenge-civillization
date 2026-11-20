# Phase 11 — settlements, buildings, infrastructure, transport, and migration

Read `prompts/PHASE-CONTRACT.md`, `docs/ARCHITECTURE.md`, and use `/simulation-domain`.

Implement settlement formation/growth/decline, land/use capacity, housing, buildings, water/sanitation, roads/routes, transport modes, construction/maintenance/decay, travel, migration decisions, and displacement. All capabilities depend on approved technology, materials, labor, environment, and institutions.

Use explicit spatial transitions and two-stage/idempotent cross-region movement. A route closure or destination capacity change must resolve travelers safely. Emit compact spatial deltas suitable for projections without UI coupling.

Acceptance: no person occupies two authoritative locations; capacity/maintenance constraints hold; construction conserves resources; retry/crash cannot duplicate travelers/assets; migration responds to push/pull factors within bounds; historical spatial replay matches canonical state; large-settlement/map query benchmarks pass.
