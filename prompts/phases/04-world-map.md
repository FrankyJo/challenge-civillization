# Phase 04 — geography, environment, and resources

Read `prompts/PHASE-CONTRACT.md`, `docs/DOMAIN.md`, and use `/simulation-domain`.

Implement deterministic world generation or a versioned seeded map input with regions, terrain, elevation, water, climate bands, biomes, natural resources, hazards, traversability, and spatial IDs. Document projection/coordinate system, scale, units, and abstraction limits. Provide capabilities for route cost, carrying-capacity inputs, and map snapshots without coupling to Phaser.

Use open/licensed data only with provenance, or generated data with algorithm/version. Add map validation for connectedness policy, water/land consistency, resource bounds, deterministic hash, and impossible coordinates.

Acceptance: same seed/content version yields the same world hash; changing algorithm/content creates a new version; spatial queries and route costs are tested; resources/hazards have explicit units; headless generation meets a recorded performance/memory budget; a compact read projection can be served without exposing full authoritative state.
