import {
  BIOMES,
  CELL_FLAGS,
  ELEVATION_BANDS_M,
  PUBLIC_MAP_SNAPSHOT_SCHEMA_VERSION,
  publicMapSnapshotSchema,
  SNAPSHOT_FEATURES,
  TERRAIN_TYPES,
  type PublicMapSnapshot,
  type WorldMap,
} from "@civ/contracts";

/** Elevation band index: the number of band boundaries at or below the elevation. */
export function elevationBand(elevationM: number): number {
  let band = 0;
  for (const boundary of ELEVATION_BANDS_M) if (elevationM >= boundary) band += 1;
  return band;
}

/**
 * Compact public projection of a map (docs/GEOGRAPHY.md § Public snapshot).
 * Carries only what a renderer needs; resource stocks, hazards, climate
 * values, drainage, deposits and the seed stay internal.
 */
export function mapSnapshot(map: WorldMap): PublicMapSnapshot {
  const { cells } = map;
  const count = map.grid.width * map.grid.height;
  let terrain = "";
  let biome = "";
  let band = "";
  let features = "";
  const runs: number[] = [];
  for (let cell = 0; cell < count; cell += 1) {
    terrain += (cells.terrain[cell] as number).toString(36);
    biome += (cells.biome[cell] as number).toString(36);
    band += elevationBand(cells.elevationM[cell] as number).toString(10);
    const flags = cells.flags[cell] as number;
    features += (
      ((flags & CELL_FLAGS.coast) !== 0 ? SNAPSHOT_FEATURES.coast : 0) |
      ((flags & CELL_FLAGS.river) !== 0 ? SNAPSHOT_FEATURES.river : 0)
    ).toString(10);
    const region = cells.region[cell] as number;
    if (runs.length > 0 && runs[runs.length - 2] === region)
      runs[runs.length - 1] = (runs[runs.length - 1] as number) + 1;
    else runs.push(region, 1);
  }
  return publicMapSnapshotSchema.parse({
    schemaVersion: PUBLIC_MAP_SNAPSHOT_SCHEMA_VERSION,
    worldId: map.worldId,
    mapVersion: map.mapVersion,
    mapHash: map.mapHash,
    grid: {
      layout: map.grid.layout,
      width: map.grid.width,
      height: map.grid.height,
      cellSpacingM: map.grid.cellSpacingM,
      rowSpacingM: map.grid.rowSpacingM,
    },
    legend: { terrain: [...TERRAIN_TYPES], biome: [...BIOMES], elevationBandsM: [...ELEVATION_BANDS_M] },
    terrain,
    biome,
    elevationBand: band,
    features,
    regionRuns: runs,
    regions: map.regions.map((region) => ({
      regionId: region.regionId,
      seedCell: region.seedCell,
      cellCount: region.cellCount,
    })),
  });
}

/** Region index of every cell, decoded from a snapshot's run-length encoding. */
export function decodeRegionRuns(snapshot: PublicMapSnapshot): number[] {
  const cellCount = snapshot.grid.width * snapshot.grid.height;
  let covered = 0;
  for (let index = 1; index < snapshot.regionRuns.length; index += 2) {
    const run = snapshot.regionRuns[index] as number;
    if (!Number.isSafeInteger(run) || run < 1) throw new RangeError("region runs must be positive integers");
    covered += run;
  }
  if (covered !== cellCount) throw new RangeError(`region runs cover ${covered} cells, not ${cellCount}`);
  const result: number[] = [];
  for (let index = 0; index < snapshot.regionRuns.length; index += 2) {
    const region = snapshot.regionRuns[index] as number;
    const run = snapshot.regionRuns[index + 1] as number;
    for (let step = 0; step < run; step += 1) result.push(region);
  }
  return result;
}
