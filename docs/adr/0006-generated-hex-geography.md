# ADR 0006: Generated hex geography

- Status: Accepted
- Date: 2026-11-21

## Context

Phase 04 needs reproducible world geography: regions, terrain, elevation, water, climate, biomes, resources, hazards, traversability and spatial IDs. It also needs route costs, carrying-capacity inputs and a map snapshot that does not couple to Phaser. The constraints:

- Same seed and versions must give the same map hash on every platform.
- A changed algorithm or content must yield a new version.
- Data must be open or licensed with provenance, or generated with a recorded algorithm and version.
- Headless generation must meet a recorded budget.

## Decisions

1. **Generated, not imported, geography.**
   - The world is a fictional region generated from the world seed by a versioned algorithm (`civ-hexgen`).
   - This avoids licensing and provenance work for real geodata and fits the product: the civilization is not a reproduction of real history (PRODUCT.md).
   - Real-world geodata can become a separate "seeded map input" generator later, under a new generator ID.
2. **Hex grid, odd-r layout, integer metres.**
   - Hexes give six equidistant neighbours, so route costs and region growth have no diagonal artefacts.
   - The grid is cheap to index (`row × width + col`) and simple to render.
   - Planar coordinates are integer metres. The projection is a documented local equirectangular one (latitude per row, no longitude).
3. **Integer-only generation.**
   - All noise is integer value noise with exact arithmetic. The banned transcendental `Math` functions are not needed.
   - Ordering ties (priority flood, Dijkstra) break by cell index.
   - The only random source is named streams of the world seed. The map hash is therefore platform-independent; a golden test freezes it.
4. **Map identity.**
   - `mapVersion` = hash(generator ID, generator version, params). `mapHash` = hash of the whole document.
   - Both enter the engine config, and through it `configVersion`, when the engine is given a map.
   - Changing the algorithm requires a generator version bump, enforced by the golden test.
5. **Columnar document with explicit units.**
   - Per-cell layers are dense integer arrays, and each document carries its legend and a unit for every layer, pinned by the contract.
   - Deposits are a sparse list in tonnes.
   - This gives a compact document (461 KiB for the default map) that reads unambiguously without code.
6. **The map is stored once per world, immutable** (`civ.world_maps`, append-only), in the world's creation transaction.
   - Regeneration is possible but not relied on. The stored document is the launch record, even after the generator changes.
   - On load, the map is re-verified by hash and semantically. If it was made by the running generator version, it is also regenerated and compared.
7. **Systems receive the map by construction, not in world state.**
   - The mutable `world_state.data` is rewritten on every command. Copying a 0.5 MiB immutable map into it would multiply write volume for no benefit.
   - Systems built for a world close over its loaded `WorldMap`. The engine records only the map's identity.
8. **Public projection.** The public map is a separate compact contract (`public-map-snapshot`), stored next to the document. It holds only rendering data: terrain, biome, elevation band, coast/river and regions.
9. **Uncalibrated environmental constants are labelled as such.**
   - Cover shares, timber, fish, deposit sizes and hazard rates are order-of-magnitude defaults.
   - The phases that consume them (08, 09, 11) calibrate them with sources and a generator version bump.

## Alternatives rejected

- **Square grid:** diagonal moves need √2 costs and give anisotropic regions.
- **Voronoi or irregular polygons:** a heavier geometry and harder indexing for no simulation benefit at this scale.
- **Floating-point noise (Perlin/simplex):** cross-engine bit-identity is not guaranteed for the functions involved.
- **Storing the map inside world state:** it would be rewritten with every command and every checkpoint.
- **Regenerating on every load without storing:** the launch record would silently change if the generator code changed.

## Consequences

- One world launch costs about 0.1 s and 16 MB for the default map. `MAX_MAP_CELLS` = 65,536 bounds the worst case at about 1.1 s and 90 MB.
- Later systems add environmental state on top of the map. They never edit the map document.
- The phases that calibrate resource and hazard constants must bump `MAP_GENERATOR.version`. Existing worlds keep their stored map.
