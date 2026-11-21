import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CELL_LAYERS,
  CELL_LAYER_UNITS,
  cellIdSchema,
  mapParamsSchema,
  publicMapSnapshotSchema,
  regionIdSchema,
  worldMapSchema,
} from "./geography.js";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "fixtures", "v1", `${name}.json`), "utf8"));

describe("geography contracts", () => {
  const map = worldMapSchema.parse(fixture("world-map"));
  const snapshot = publicMapSnapshotSchema.parse(fixture("public-map-snapshot"));

  it("declares a unit for every per-cell layer", () => {
    expect(CELL_LAYERS.length).toBe(Object.keys(map.cells).length);
    for (const layer of CELL_LAYERS) expect(CELL_LAYER_UNITS[layer].length).toBeGreaterThan(0);
    expect(map.units).toEqual(CELL_LAYER_UNITS);
  });

  it("rejects layers of the wrong length, changed legends and changed units", () => {
    const short = { ...map, cells: { ...map.cells, elevationM: map.cells.elevationM.slice(1) } };
    expect(worldMapSchema.safeParse(short).success).toBe(false);
    const legend = { ...map, legend: { ...map.legend, biome: [...map.legend.biome].reverse() } };
    expect(worldMapSchema.safeParse(legend).success).toBe(false);
    const units = { ...map, units: { ...map.units, forestHa: "acre" } };
    expect(worldMapSchema.safeParse(units).success).toBe(false);
    const rows = { ...map, rows: { ...map.rows, climateBand: [0] } };
    expect(worldMapSchema.safeParse(rows).success).toBe(false);
    expect(worldMapSchema.safeParse({ ...map, extra: 1 }).success).toBe(false);
  });

  it("bounds generator params", () => {
    const params = mapParamsSchema.parse(fixture("map-params"));
    expect(mapParamsSchema.safeParse({ ...params, width: 1_024, height: 1_024 }).success).toBe(false);
    expect(mapParamsSchema.safeParse({ ...params, landFractionPpm: 950_000 }).success).toBe(false);
    expect(mapParamsSchema.safeParse({ ...params, cellSpacingM: 1.5 }).success).toBe(false);
  });

  it("validates snapshot encodings", () => {
    expect(publicMapSnapshotSchema.safeParse({ ...snapshot, terrain: snapshot.terrain.slice(1) }).success).toBe(false);
    expect(
      publicMapSnapshotSchema.safeParse({ ...snapshot, features: snapshot.features.replace("0", "9") }).success,
    ).toBe(false);
    expect(publicMapSnapshotSchema.safeParse({ ...snapshot, regionRuns: [...snapshot.regionRuns, 0] }).success).toBe(
      false,
    );
    expect(publicMapSnapshotSchema.safeParse({ ...snapshot, seed: "00" }).success).toBe(false);
    // Runs must be positive and region indices in range, even when the total matches.
    const cells = snapshot.grid.width * snapshot.grid.height;
    for (const regionRuns of [
      [0, cells + 100, -1, -100],
      [-1, cells - 1, 99, 1],
      [-1, cells, 0, 0],
    ]) {
      expect(publicMapSnapshotSchema.safeParse({ ...snapshot, regionRuns }).success).toBe(false);
    }
  });

  it("formats spatial and region IDs", () => {
    expect(cellIdSchema.safeParse("cel_0001000a").success).toBe(true);
    expect(cellIdSchema.safeParse("cel_1_2").success).toBe(false);
    expect(regionIdSchema.safeParse(map.regions[0]?.regionId).success).toBe(true);
    expect(regionIdSchema.safeParse("wld_0123456789").success).toBe(false);
  });
});
