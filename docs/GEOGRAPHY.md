# Geography specification

Executable source:

- `packages/domain/src/geography/`:
  - `generate.ts` (generator `civ-hexgen`);
  - `validate.ts`;
  - `grid.ts` (coordinates and spatial queries);
  - `routes.ts`;
  - `capacity.ts`;
  - `snapshot.ts`.
- `packages/contracts/src/geography.ts`: the contracts `map-params`, `world-map` and `public-map-snapshot`.
- `packages/db/src/maps.ts` and `packages/db/migrations/0004_world_maps.*.sql`: storage.
- `apps/simulation/src/geography.ts`: preparing a map at launch and loading it for the engine.

Decision record: `docs/adr/0006-generated-hex-geography.md`. Kernel rules: `docs/KERNEL.md`.

## What a map is

A world map is generated **once**, when the world is created. Its inputs are:
- the world ID and seed;
- the generator identity (`civ-hexgen`, `MAP_GENERATOR.version`);
- the `MapParams`.

It uses no external geodata, so it has no licensing or provenance dependencies; its provenance is the algorithm and its version, which are recorded in every document. The map is immutable for the whole season. Environmental change (erosion, deforestation, irrigation, climate drift) belongs to later systems, which record it as state and events on top of the map, never as edits to it.

| Identity | Definition | Changes when |
|---|---|---|
| `mapVersion` | `canonicalHash({ generator: { id, version }, params })` | the algorithm version or any parameter changes |
| `mapHash` | canonical hash of the whole document except `mapHash` | anything in the document changes, including seed, world ID and version |

The engine records `{ mapVersion, mapHash }` in its config document (`createEngine({ geography })`). A different map therefore always yields a different `configVersion`, and replay under the wrong map is rejected as `version_mismatch`. Map-less engines keep their previous config digest.

**Versioning rule:** any code change that can alter generator output for the same inputs must bump `MAP_GENERATOR.version`. The golden test (`generate.test.ts`) freezes the default map's hash, version and snapshot hash, and it fails under `CI=true` if output changes without an update. Stored maps keep the document they were launched with. `loadGeography` regenerates a stored map only when it was made by the running generator version. A mismatch is a `LedgerIntegrityError`, meaning nondeterminism or an unversioned change.

## Coordinates, projection and scale

**Grid.** The grid uses pointy-top hexagons in the "odd-r" layout: odd rows are shifted right by half a cell.
- Cell index is `row × width + col`.
- Neighbours are listed in the fixed order E, NE, NW, W, SW, SE.
- Distances use axial coordinates `q = col − (row − (row & 1)) / 2` and `r = row`.

**Planar coordinates** are integer metres from the north-west corner:
- `x = col × spacing + (row odd ? ⌊spacing/2⌋ : 0)`;
- `y = row × rowSpacing`;
- `rowSpacing = round(spacing × √3/2)`, where √3/2 is fixed at 866,025,404 ppb;
- `cellAreaM2 = round(spacing² × √3/2)`.

**Projection** (`local-equirectangular`): a fictional regional map, not a place on Earth.
- Row latitude is `topLatitudeMicroDeg − row × rowSpacing × 10⁶ / 111,195`, using the mean meridian degree.
- Longitude is not modelled. East–west position is only `x`.
- A map that would cross a pole is rejected.

**Default (season 1).** The default map is 80 × 60 cells with 5 km spacing:

| Quantity | Value |
|---|---|
| Row spacing | 4,330 m |
| Cell area | 21.65 km² (2,165 ha) |
| Extent | about 398 × 255 km |
| Total area | about 104,000 km² |
| Top-row latitude | 43° N |
| Sea-level mean temperature | 11.5 °C at the top row, 15.0 °C at the bottom row |

**Spatial IDs.** A cell ID is `cel_<col><row>`, with four base-36 digits each.
- It is reversible (`cellIdOf` / `cellIndexOfId`), stable and world-scoped by context.
- Region IDs (`rgn_…`) and water body IDs (`wbd_…`) are derived with `deriveId` from the world ID and their anchor cell.

Every coordinate entry point throws `ImpossibleCoordinateError` for out-of-map or non-integer input. These are `cellIndex`, `cellIdOf`, `cellIndexOfId`, `neighboursOf`, `hexDistance`, `cellsWithin`, `cellAtPoint`, `findRoute`, `travelField` and `capacityInputs`.

## Generation pipeline (`civ-hexgen` 1.0.0)

Every random choice comes from the world-seed streams `["map", "civ-hexgen", <layer>]`. All arithmetic is integer: value noise uses 16-bit fixed point, exact divisions and `Math.imul` mixing. The same inputs therefore produce byte-identical output on every platform.

1. **Raw height.** Five-octave fractal value noise forms continents. A ridged noise forms mountain belts, masked by a tectonic noise field. A radial falloff keeps the map edge at sea.
2. **Sea level.** The sea level is the `1 − landFractionPpm` quantile of interior cells. The outer ring of cells is always ocean.
3. **Elevation.** Land elevation follows `1 + maxElevation × t²`, so most land is low. Sea depth is linear, from −1 to `−maxDepth`. Sea level is 0 m.
4. **Lakes.** A priority flood finds closed depressions; cells at least 25 m below their spill level become lake.
5. **Connectedness.** Landmasses smaller than `minLandmassCells` are submerged, and so is land enclosed by a lake. Every remaining landmass borders the single ocean.
6. **Drainage.** A priority flood (Barnes et al. 2014) runs from the coast on the raw height, with ties broken by cell index. Each non-ocean cell gets one receiver; paths reach the ocean and never cycle. Lake cells take their spill level as their surface elevation.
7. **Climate.**
   - Temperature comes from the sea-level gradient by row, minus a lapse rate of 6.5 °C/km, plus noise of about ±1.5 °C.
   - Precipitation comes from a west-to-east moisture sweep: the ocean recharges moisture and land rains part of it out, with orographic uplift and recycling. Noise and one smoothing pass are applied afterwards.
   - Each row gets a latitude band (tropical < 23.44°, subtropical < 35°, temperate < 55°, subpolar < 66.56°, polar).
8. **Landform.**
   - **Terrain** comes from elevation and relief (the largest height difference to a neighbour): deep ocean below −200 m, shelf sea, lake, plains, hills (≥ 400 m or relief ≥ 200 m), mountains (≥ 1,300 m, or ≥ 800 m with relief ≥ 300 m) and high mountains (≥ 2,400 m).
   - **Runoff** is `P² / (P + PET)` (Budyko-type), with `PET = clamp(250 + 3 × T, 150, 1400)` mm/year. Lakes yield `max(0, P − PET)`.
   - **Discharge** accumulates downstream. Land cells whose discharge reaches `riverMinDischargeM3PerYear` are rivers.
9. **Climate class and biome.** These come from temperature, precipitation and elevation, plus a seeded wetland chance on flat, wet cells next to rivers or lakes.
10. **Resources and hazards** (next section).
11. **Regions.**
    - Seeds are drawn from a seeded shuffle of land cells and kept at least a target-hexagon radius apart.
    - Every landmass gets at least one seed.
    - Regions grow by multi-source Dijkstra over foot travel time, so mountains and wetlands become borders. Each region is contiguous by construction.
12. **Validation and hashing.** The generator validates its own output and throws `MapValidationError` on any defect.

## Layers and units

Every per-cell layer is a dense integer array. The document's `units` object states the unit of each layer, and the contract pins those values.

| Layer | Unit / meaning |
|---|---|
| `elevationM` | metres above sea level (for lake cells, the water surface) |
| `terrain`, `biome`, `climateClass` | index into the document's `legend` |
| `temperatureDeciC` | 0.1 °C, annual mean |
| `precipitationMm` | mm/year |
| `flags` | bitmask: water 1, coast 2, river 4 |
| `landmass`, `region`, `waterBody` | index, or −1 when not applicable |
| `flowTo` | receiver cell index, or −1 for ocean |
| `dischargeM3PerYear`, `runoffM3PerYear` | m³/year (outflow and locally generated) |
| `landAreaHa`, `forestHa`, `grasslandHa`, `wetlandHa`, `barrenHa` | ha. For land cells the land cover sums **exactly** to the land area (`allocate`). |
| `arablePotentialHa` | ha cultivable if cleared or drained; at most forest + grassland |
| `timberStockM3` | m³ of standing wood |
| `fishKgPerYear` | kg/year sustainable catch |
| `floodPpm`, `droughtPpm`, `seismicPpm`, `wildfirePpm` | annual probability of a damaging event in the cell, ppm |

**Deposits** form a sparse list `{ cell, mineral, amountT }`, measured in tonnes of ore or raw material in place. The minerals are copper ore, tin ore, iron ore, precious-metal ore, salt, building stone and clay.

**Calibration status.** The cover shares, timber densities, fish yields, deposit sizes and hazard rates are order-of-magnitude defaults, chosen so that magnitudes are plausible for a temperate pre-industrial region. They are **not** calibrated against sources yet. Phases 08 (health and hazards), 09 (production) and 11 (settlements) calibrate them with cited sources and a generator version bump. Until then they are inputs to be tuned, not claims about history.

## Abstraction limits

- **Scale.** One cell is about 21.65 km². Features smaller than a cell do not exist: individual fields, villages and small streams. Rivers are cell flags, not polylines.
- **Climate.** Climate is an annual mean with no seasons or interannual variability. Precipitation uses one prevailing westerly. There is no ocean-current or monsoon model.
- **Geology.** There are no tectonics, erosion or soil horizons. Soil quality is a noise factor.
- **Water.** Lake surfaces are flat spill levels. There are no wetlands as water bodies, no groundwater and no sea-level change.
- **Coasts.** The map edge is always ocean, so the world is an island region or continent.
- **Immutability.** The map is static within a season. Land use, deforestation and infrastructure are later state, not map edits.

## Validation (`validateWorldMap`)

The validator returns a report `{ ok, issues (first 50), issueCount, stats }` and never throws. `assertValidWorldMap` throws `MapValidationError`. It checks:

- **Structure:** the contract shape, layer lengths, code ranges and legends.
- **Hash and version:** `mapHash` and `mapVersion` are recomputed.
- **Grid and projection:** spacing, area and per-row latitude are recomputed. No latitude may lie beyond ±90°. Each row's climate band must match its latitude.
- **Water/land consistency:**
  - the water flag ⇔ water terrain ⇔ ocean or lake biome;
  - sea cells ≤ −1 m, with deep ocean below −200 m;
  - land and lake surfaces ≥ 1 m;
  - the border is ocean;
  - the coast flag is exact;
  - no river flag on water;
  - lake cells sit at their lake's surface.
- **Connectedness policy:**
  - exactly one ocean;
  - water bodies and landmasses are exactly the connected components, labelled in first-cell order;
  - every landmass is at least `minLandmassCells` and borders the ocean.
- **Regions:**
  - a partition of land into contiguous regions;
  - each region lies on one landmass;
  - counts and areas are recomputed;
  - IDs are unique;
  - every landmass has at least one region.
- **Drainage:**
  - receivers are neighbours;
  - every path reaches the ocean without a cycle;
  - discharge = own runoff + all inflow, exactly;
  - the river flag ⇔ land with discharge ≥ threshold.
- **Landform:** each land cell's terrain must equal `landformOf(elevation, relief)`, recomputed from its stored neighbours.
- **Resource and hazard bounds:**
  - no negative quantities;
  - discharge, runoff, fish and timber are each at most 10¹⁵, so every sum over a maximum-size map stays exact;
  - fish is at most the per-hectare yield of the water terrain, or `discharge / 1,000,000` on land;
  - each deposit is at most 10⁹ t (contract);
  - land area = cell area;
  - land cover sums exactly;
  - arable potential ≤ vegetated land;
  - timber ≤ 400 m³/ha of forest;
  - hazards ≤ 1,000,000 ppm;
  - water cells carry no land quantities;
  - deposits lie on land, with valid minerals, unique and ordered.
- **Land share:** within ±150,000 ppm of the requested interior land fraction. This tolerance is an empirical envelope: in the property test and the 340-map sweep, island submersion and depression lakes moved the share by a few per cent.

**Not checked beyond non-negativity and the cover sum:** how the four land-cover classes are split between each other, for example whether wetland cover matches the wetland biome. The split is a generator default that later phases calibrate.

## Spatial queries and routes

| Function | Purpose |
|---|---|
| `neighboursOf` | adjacent cells |
| `hexDistance` | grid steps between cells |
| `cellsWithin(centre, radius)` | cells within a radius |
| `cellAtPoint(x, y)` | nearest cell centre, with exact integer distance |
| `cellCentreM` | a cell's centre in metres |
| `cellIdOf` / `cellIndexOfId` | convert between index and spatial ID |
| `regionCells` | the cells of a region |

**Travel profiles** are data, so later technology phases add profiles (roads, pack animals, ships) without changing the search. A profile has:
- integer minutes per km by terrain (`null` means impassable);
- biome multipliers in percent;
- river fording minutes (half paid entering, half leaving);
- land↔water transfer minutes.

| Profile | Behaviour |
|---|---|
| `FOOT_TRAVEL` | 12 min/km on plains, up to 90 on high mountains; water impassable |
| `FOOT_AND_BOAT_TRAVEL` | adds small craft at 8–12 min/km on lakes and sea, with a 120-minute transfer |

**Edge cost** is `⌈((c(a) + c(b)) × spacing + (ford(a) + ford(b)) × 1000 + transfer × 2000) / 2000⌉` minutes, at least 1. It is symmetric by construction.

| Search | Method |
|---|---|
| `findRoute` | A* with the bound `steps × ⌈min cost × spacing / 1000⌉`, which is admissible and consistent. Ties break by cell index. Optional `maxMinutes`. |
| `travelField` | Multi-source Dijkstra returning minutes and owning source per cell; also used for region growth. A cell takes the owner of its first strictly cheaper relaxation. Relaxations follow heap order (cost, then cell index) and the fixed neighbour order, so ties resolve deterministically and every territory is contiguous (tested). |

Tests check that A* equals Dijkstra and that routes are valid, symmetric and never slower with boats. They also check that water blocks walking and that every land cell of a multi-landmass map is reachable by foot and boat.

## Carrying-capacity inputs

`capacityInputs(map, cells)` and `regionCapacityInputs(map, region)` sum integer quantities over a set of cells. The quantities are:
- land area, cover, arable potential, timber, runoff and fish;
- the maximum discharge (not summed, because rivers pass through);
- land-weighted mean temperature and precipitation (`null` without land);
- deposits by mineral.

These are inputs for later systems, not a population capacity. Regions partition land exactly, and a test checks this.

## Public snapshot

`mapSnapshot(map)` produces the `public-map-snapshot` contract.
- **Grid:** shape and spacing.
- **Legends:** terrain, biome and elevation bands (−200, 0, 200, 500, 1,000, 1,500, 2,000 and 3,000 m).
- **Per-cell layers,** as one-character-per-cell strings: terrain, biome, elevation band, and features (coast 1, river 2).
- **Regions:** run-length region membership plus region IDs, seed cells and sizes.

The snapshot excludes the seed and all quantities that later systems rely on:
- resources, deposits and hazards;
- temperature and precipitation;
- drainage.

It is renderer-agnostic, so the Phaser map (Phase 20) consumes it without any coupling to the domain. The default map's snapshot is 25 KiB, against a 461 KiB document; the test budget is ≤ 64 KiB and ≤ 1/10 of the document. The snapshot is stored with the map. `readMapSnapshot` reads only the snapshot column, so a public reader never loads the authoritative document. The public HTTP route, rate limiting and caching are added with the public API (Phase 18).

## Storage

`civ.world_maps` (migration 0004) holds one row per world.
- **Columns:** generator, version, `mapVersion`, `mapHash`, the full document (jsonb) and the snapshot (jsonb).
- **Constraints:** the row is append-only (SQLSTATE 23001), and CHECK constraints tie both JSON documents to `map_hash`.
- **Writing:** `createWorld({ map })` stores the map in the world's creation transaction. The map must be generated for that world and seed. The document hash is recomputed with `node:crypto`, and the snapshot must belong to the document. The `world.created` audit row records `mapHash` and `mapVersion`.
- **Reading:** `loadWorldMap` re-verifies the hash on every read. `loadGeography` (simulation) then:
  - runs semantic validation;
  - requires the engine's map reference (`engine.config.geography`), so a world cannot run on another map than the one its `configVersion` names;
  - checks that the stored snapshot is exactly `mapSnapshot(document)`;
  - checks that the map reproduces.
- **Database checks:** CHECK constraints tie the document's and snapshot's `mapHash` and `worldId` to the row.
- **Rollback:** `0004 down` refuses once any map is stored (SQLSTATE 55000); production rolls forward.

## Budget

Recorded by `pnpm --filter @civ/domain bench:map` (macOS arm64, Node 22). The script fails if the default map exceeds its budget.

| Map | Cells | Generate | Validate | Heap | Document | Snapshot |
|---|---:|---:|---:|---:|---:|---:|
| default 80×60 @5 km | 4,800 | ≈110 ms | ≈38 ms | ≈18 MB | 461 KiB | 25 KiB |
| 256×192 @2.5 km | 49,152 | ≈0.9 s | ≈0.37 s | ≈62 MB | 4.3 MiB | 215 KiB |
| 256×256 @2 km (maximum) | 65,536 | ≈1.0–1.1 s | ≈0.5 s | ≈80–89 MB | 5.7 MiB | 286 KiB |

The **budget for the default map** is ≤ 1,000 ms, ≤ 64 MB of heap growth, ≤ 1 MiB of document and ≤ 64 KiB of snapshot. `MAX_MAP_CELLS` = 65,536 bounds the worst case at about 1.1 s and 90 MB, because generation runs once per world launch. `pnpm --filter @civ/domain exec node bench/map-preview.mjs <seed> <out.png> [biome|terrain|elevation|precipitation|regions]` renders a map for visual review.
