import { publicMapSnapshotSchema, type MapParams, type WorldMap } from "@civ/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
import { canonicalHash } from "../hash.js";
import { createEngine } from "../kernel.js";
import { SEASON_ONE_SPAN } from "../calendar.js";
import { createSystemSchedule } from "../systems.js";
import { capacityInputs, regionCapacityInputs, regionCells } from "./capacity.js";
import { DEFAULT_MAP_PARAMS, generateWorldMap, MAP_GENERATOR, mapVersionOf } from "./generate.js";
import { decodeRegionRuns, mapSnapshot } from "./snapshot.js";
import { validateWorldMap } from "./validate.js";

const WORLD = "wld_golden0001";
const SEED = "9e3779b97f4a7c15";
const SMALL: MapParams = { ...DEFAULT_MAP_PARAMS, width: 24, height: 18, regionTargetCells: 20 };

// Frozen golden values: a change here means the generator's output changed,
// which requires a MAP_GENERATOR.version bump (docs/GEOGRAPHY.md).
const GOLDEN_MAP_HASH = "sha256:634ac22a42c479a5bde32cef009e7db47703324eb93156fa057d5769ce603bf7";
const GOLDEN_MAP_VERSION = "sha256:eb73b48a68ae6200a226f856d8e8d26d5ca97046287a15c5c2d3feac463754f0";
const GOLDEN_SNAPSHOT_HASH = "sha256:efa00c070f5c7b334ebf97fe9865162dbab16dbdd4ee2b4b4c00a6f26cbc7fe1";

const golden = generateWorldMap({ worldId: WORLD, seed: SEED });
const clone = (map: WorldMap): WorldMap => structuredClone(map);
/** Re-hash after a deliberate corruption so only the semantic check can fail. */
const rehash = (map: WorldMap): WorldMap => {
  const { mapHash: _ignored, ...rest } = map;
  return { ...rest, mapHash: canonicalHash(rest) };
};

describe("map generation", () => {
  it("reproduces the golden map for the default params", () => {
    expect(golden.mapHash).toBe(GOLDEN_MAP_HASH);
    expect(golden.mapVersion).toBe(GOLDEN_MAP_VERSION);
    expect(canonicalHash(mapSnapshot(golden))).toBe(GOLDEN_SNAPSHOT_HASH);
    // Frozen with the hashes: updating the golden values without bumping the
    // generator version fails here.
    expect(MAP_GENERATOR).toEqual({ id: "civ-hexgen", version: "1.0.0" });
    expect(golden.generator).toEqual(MAP_GENERATOR);
  });

  it("is a pure function of world, seed, params and generator version", () => {
    const again = generateWorldMap({ worldId: WORLD, seed: SEED });
    expect(again).toEqual(golden);
    const otherSeed = generateWorldMap({ worldId: WORLD, seed: "0123456789abcdef", params: SMALL });
    const sameSeed = generateWorldMap({ worldId: WORLD, seed: SEED, params: SMALL });
    expect(otherSeed.mapHash).not.toBe(sameSeed.mapHash);
    expect(otherSeed.mapVersion).toBe(sameSeed.mapVersion);
    const otherWorld = generateWorldMap({ worldId: "wld_golden0002", seed: SEED, params: SMALL });
    expect(otherWorld.mapHash).not.toBe(sameSeed.mapHash);
    expect(otherWorld.cells.elevationM).toEqual(sameSeed.cells.elevationM);
  });

  it("gives changed params or a changed algorithm a new version", () => {
    const changed = generateWorldMap({ worldId: WORLD, seed: SEED, params: { ...SMALL, landFractionPpm: 500_000 } });
    const base = generateWorldMap({ worldId: WORLD, seed: SEED, params: SMALL });
    expect(changed.mapVersion).not.toBe(base.mapVersion);
    expect(changed.mapHash).not.toBe(base.mapHash);
    expect(mapVersionOf(SMALL, { id: MAP_GENERATOR.id, version: "1.0.1" })).not.toBe(mapVersionOf(SMALL));
  });

  it("validates its own output and reports plausible statistics", () => {
    const report = validateWorldMap(golden);
    expect(report.issues).toEqual([]);
    const stats = report.stats;
    expect(stats).not.toBeNull();
    if (stats === null) return;
    expect(stats.cells).toBe(4_800);
    expect(Math.abs(stats.landFractionPpm - DEFAULT_MAP_PARAMS.landFractionPpm)).toBeLessThan(100_000);
    expect(stats.riverCells).toBeGreaterThan(50);
    expect(stats.regions).toBeGreaterThan(20);
    expect(stats.elevationMaxM).toBeGreaterThan(1_000);
    expect(stats.terrainCells.plains).toBeGreaterThan(stats.terrainCells.mountains);
    for (const mineral of ["copper_ore", "iron_ore", "building_stone", "clay"] as const) {
      expect(stats.deposits[mineral].count).toBeGreaterThan(0);
    }
  });

  it("produces valid maps for any seed and supported shape (property)", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 8, maxLength: 16 }),
        fc.integer({ min: 12, max: 40 }),
        fc.integer({ min: 12, max: 30 }),
        fc.integer({ min: 200_000, max: 850_000 }),
        fc.integer({ min: -70_000_000, max: 70_000_000 }),
        (bytes, width, height, landFractionPpm, topLatitudeMicroDeg) => {
          const seed = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
          const map = generateWorldMap({
            worldId: WORLD,
            seed,
            params: { ...SMALL, width, height, landFractionPpm, topLatitudeMicroDeg, minLandmassCells: 2 },
          });
          expect(validateWorldMap(map).ok).toBe(true);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("rejects invalid inputs at the boundary", () => {
    expect(() => generateWorldMap({ worldId: "nope", seed: SEED })).toThrow();
    expect(() => generateWorldMap({ worldId: WORLD, seed: "XYZ" })).toThrow();
    expect(() => generateWorldMap({ worldId: WORLD, seed: SEED, params: { ...SMALL, width: 4 } })).toThrow();
    expect(() =>
      generateWorldMap({ worldId: WORLD, seed: SEED, params: { ...SMALL, width: 512, height: 256 } }),
    ).toThrow(/65536/);
    expect(() =>
      generateWorldMap({
        worldId: WORLD,
        seed: SEED,
        params: { ...SMALL, height: 300, cellSpacingM: 50_000, topLatitudeMicroDeg: -70_000_000 },
      }),
    ).toThrow(/south pole/);
  });
});

describe("map validation", () => {
  const land = golden.cells.flags.findIndex((flags) => flags === 0);
  const river = golden.cells.flags.findIndex(
    (flags, cell) => (flags & 4) !== 0 && (defined(golden.cells.flags[golden.cells.flowTo[cell] as number]) & 1) === 0,
  );
  const lakeBody = golden.waterBodies.findIndex((body) => body.kind === "lake");

  const corruptions: [string, (map: WorldMap) => void, RegExp][] = [
    ["hash", (map) => void (map.cells.elevationM[land] = 7), /mapHash/],
    ["land cell below sea level", (map) => void (map.cells.elevationM[land] = -3), /not above sea level/],
    [
      "terrain/water disagreement",
      (map) => void (map.cells.terrain[land] = 1),
      /water flag disagrees|biome .* disagrees/,
    ],
    [
      "drainage cycle",
      (map) => {
        const receiver = map.cells.flowTo[river] as number;
        map.cells.flowTo[receiver] = river;
      },
      /cycle|discharge/,
    ],
    ["discharge not conserved", (map) => void (map.cells.dischargeM3PerYear[river] = 1), /discharge is not runoff/],
    ["negative resource", (map) => void (map.cells.timberStockM3[land] = -1), /negative/],
    [
      "cover does not sum",
      (map) => void (map.cells.forestHa[land] = (map.cells.forestHa[land] as number) + 1),
      /land cover/,
    ],
    ["hazard above certainty", (map) => void (map.cells.floodPpm[land] = 1_000_001), /exceeds 1,000,000/],
    [
      "region not contiguous",
      (map) => {
        const far = map.cells.region.findIndex((region, cell) => region > 0 && cell > land + 200);
        map.cells.region[far] = 0;
      },
      /not contiguous|regionCount|cellCount/,
    ],
    ["deposit on water", (map) => void (map.deposits[0] = { ...defined(map.deposits[0]), cell: 0 }), /water cell 0/],
    [
      "impossible deposit cell",
      (map) => void (map.deposits[0] = { ...defined(map.deposits[0]), cell: 99_999 }),
      /impossible cell/,
    ],
    ["code out of range", (map) => void (map.cells.biome[land] = 99), /out of range/],
    [
      "land on the border",
      (map) => {
        map.cells.terrain[0] = 3;
      },
      /border must be ocean|disagrees/,
    ],
    [
      "terrain inconsistent with elevation",
      (map) => void (map.cells.terrain[land] = map.cells.terrain[land] === 3 ? 6 : 3),
      /disagrees with elevation/,
    ],
    ["climate band inconsistent with latitude", (map) => void (map.rows.climateBand[3] = 4), /climate band disagrees/],
    ["excessive fish yield", (map) => void (map.cells.fishKgPerYear[0] = 10_000_000), /fish yield/],
    ["wrong map version", (map) => void (map.params = { ...map.params, regionTargetCells: 61 }), /mapVersion/],
  ];
  if (lakeBody >= 0) {
    corruptions.push([
      "lake surface",
      (map) => void (map.waterBodies[lakeBody] = { ...defined(map.waterBodies[lakeBody]), surfaceElevationM: 9 }),
      /lake surface/,
    ]);
  }

  it.each(corruptions)("detects %s", (_name, corrupt, message) => {
    const map = clone(golden);
    corrupt(map);
    const report = validateWorldMap(_name === "hash" ? map : rehash(map));
    expect(report.ok).toBe(false);
    expect(report.issues.join("\n")).toMatch(message);
  });

  it("rejects structurally invalid documents without throwing", () => {
    const report = validateWorldMap({ ...golden, cells: { ...golden.cells, terrain: [1, 2] } });
    expect(report.ok).toBe(false);
    expect(report.stats).toBeNull();
    expect(validateWorldMap(null).ok).toBe(false);
  });
});

describe("carrying-capacity inputs", () => {
  it("partitions land exactly across regions", () => {
    const whole = capacityInputs(
      golden,
      golden.cells.region.map((_, cell) => cell),
    );
    const regions = golden.regions.map((_, region) => regionCapacityInputs(golden, region));
    const sum = (key: "landAreaHa" | "arablePotentialHa" | "timberStockM3" | "runoffM3PerYear") =>
      regions.reduce((total, region) => total + region[key], 0);
    expect(sum("landAreaHa")).toBe(whole.landAreaHa);
    expect(sum("arablePotentialHa")).toBe(whole.arablePotentialHa);
    expect(sum("timberStockM3")).toBe(whole.timberStockM3);
    expect(regions.map((region) => region.landAreaHa)).toEqual(golden.regions.map((region) => region.landAreaHa));
    const regionDeposits = regions.reduce((total, region) => total + region.depositsT.iron_ore, 0);
    expect(regionDeposits).toBe(whole.depositsT.iron_ore);
    expect(whole.landAreaHa).toBe(whole.forestHa + whole.grasslandHa + whole.wetlandHa + whole.barrenHa);
  });

  it("reports land-weighted climate means, none for open water, and rejects unknown regions", () => {
    const cells = regionCells(golden, 0);
    const inputs = capacityInputs(golden, [...cells, ...cells]);
    expect(inputs.cellCount).toBe(cells.length);
    expect(inputs.meanTemperatureDeciC).not.toBeNull();
    const ocean = capacityInputs(golden, [0, 1, 2]);
    expect(ocean.landAreaHa).toBe(0);
    expect(ocean.meanTemperatureDeciC).toBeNull();
    expect(ocean.fishKgPerYear).toBeGreaterThan(0);
    expect(() => regionCells(golden, golden.regions.length)).toThrow(RangeError);
    expect(() => capacityInputs(golden, [-1])).toThrow(/outside/);
  });
});

describe("public map snapshot", () => {
  const snapshot = mapSnapshot(golden);

  it("is a compact, schema-valid projection without authoritative quantities", () => {
    expect(publicMapSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    const documentBytes = new TextEncoder().encode(JSON.stringify(golden)).length;
    expect(bytes).toBeLessThan(64 * 1_024);
    expect(bytes * 10).toBeLessThan(documentBytes);
    const text = JSON.stringify(snapshot);
    for (const secret of ['"seed"', "deposits", "Ppm", "timber", "discharge", "precipitation", "arable", SEED]) {
      expect(text).not.toContain(secret);
    }
  });

  it("decodes back to the map's terrain, biome and regions", () => {
    expect([...snapshot.terrain].map((char) => Number.parseInt(char, 36))).toEqual(golden.cells.terrain);
    expect([...snapshot.biome].map((char) => Number.parseInt(char, 36))).toEqual(golden.cells.biome);
    expect(decodeRegionRuns(snapshot)).toEqual(golden.cells.region);
  });
});

describe("engine geography reference", () => {
  const options = {
    worldId: WORLD,
    seed: SEED,
    span: SEASON_ONE_SPAN,
    contentVersion: `sha256:${"c".repeat(64)}` as const,
    schedule: createSystemSchedule([]),
  };

  it("puts the map identity into the config version", () => {
    const without = createEngine(options);
    const withMap = createEngine({ ...options, geography: { mapVersion: golden.mapVersion, mapHash: golden.mapHash } });
    const other = generateWorldMap({ worldId: WORLD, seed: SEED, params: SMALL });
    const withOther = createEngine({ ...options, geography: { mapVersion: other.mapVersion, mapHash: other.mapHash } });
    expect("geography" in without.config).toBe(false);
    expect(withMap.versions.configVersion).not.toBe(without.versions.configVersion);
    expect(withOther.versions.configVersion).not.toBe(withMap.versions.configVersion);
    expect(() =>
      createEngine({ ...options, geography: { mapVersion: "x" as never, mapHash: golden.mapHash } }),
    ).toThrow();
  });
});
