import { z } from "zod";
import { idPattern, worldIdSchema } from "./ids.js";
import { digestSchema, SEMVER_PATTERN } from "./versions.js";
import { worldSeedSchema } from "./world.js";

/**
 * World geography contracts (docs/GEOGRAPHY.md).
 *
 * A world map is generated once from the world seed and immutable generator
 * parameters. Its authoritative document (`world-map`) is internal: it holds
 * resource stocks and hazard rates that systems read. The public
 * `public-map-snapshot` is a compact, renderer-agnostic projection without
 * any of those quantities.
 *
 * Every per-cell layer is a dense integer array in cell index order
 * (`index = row × width + col`, hex grid "pointy-top, odd rows shifted
 * right"). Categorical layers store an index into the document's legend, so
 * a legend change is a contract change.
 */
export const WORLD_MAP_SCHEMA_VERSION = 1 as const;
export const PUBLIC_MAP_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const MAP_GRID_LAYOUT = "hex-pointy-odd-r" as const;
export const MAP_PROJECTION_KIND = "local-equirectangular" as const;
/** Mean length of one degree of latitude (m); fixes the projection scale. */
export const METRES_PER_DEGREE_LATITUDE = 111_195;
/** Largest supported grid, bounding generation time and document size. */
export const MAX_MAP_CELLS = 65_536;

export const TERRAIN_TYPES = Object.freeze([
  "deep_ocean",
  "shelf_sea",
  "lake",
  "plains",
  "hills",
  "mountains",
  "high_mountains",
] as const);
export type TerrainType = (typeof TERRAIN_TYPES)[number];

export const BIOMES = Object.freeze([
  "ocean",
  "lake",
  "glacier",
  "alpine_tundra",
  "boreal_forest",
  "temperate_forest",
  "mediterranean_woodland",
  "temperate_grassland",
  "semi_desert",
  "desert",
  "wetland",
] as const);
export type Biome = (typeof BIOMES)[number];

export const CLIMATE_CLASSES = Object.freeze([
  "marine",
  "polar_ice",
  "alpine",
  "arid",
  "semi_arid",
  "mediterranean",
  "humid_temperate",
  "cool_temperate",
] as const);
export type ClimateClass = (typeof CLIMATE_CLASSES)[number];

/** Latitude bands; boundaries in docs/GEOGRAPHY.md. */
export const CLIMATE_BANDS = Object.freeze(["tropical", "subtropical", "temperate", "subpolar", "polar"] as const);
export type ClimateBand = (typeof CLIMATE_BANDS)[number];

export const MINERALS = Object.freeze([
  "copper_ore",
  "tin_ore",
  "iron_ore",
  "precious_metal_ore",
  "salt",
  "building_stone",
  "clay",
] as const);
export type Mineral = (typeof MINERALS)[number];

/** Bits of the per-cell `flags` layer. */
export const CELL_FLAGS = Object.freeze({ water: 1, coast: 2, river: 4 } as const);

/**
 * Unit of every per-cell layer. Carried inside each document so a reader
 * never has to guess; the schema pins the values.
 */
export const CELL_LAYER_UNITS = Object.freeze({
  elevationM: "metre above sea level (lake cells: water surface)",
  terrain: "index into legend.terrain",
  biome: "index into legend.biome",
  climateClass: "index into legend.climateClass",
  temperatureDeciC: "0.1 °C, annual mean",
  precipitationMm: "millimetre per year",
  flags: "bitmask (CELL_FLAGS)",
  landmass: "index into landmasses, -1 for water",
  region: "index into regions, -1 for water",
  waterBody: "index into waterBodies, -1 for land",
  flowTo: "cell index of the downstream receiver, -1 for ocean",
  dischargeM3PerYear: "cubic metre per year flowing out of the cell",
  landAreaHa: "hectare",
  forestHa: "hectare",
  grasslandHa: "hectare",
  wetlandHa: "hectare",
  barrenHa: "hectare",
  arablePotentialHa: "hectare cultivable if cleared/drained",
  timberStockM3: "cubic metre standing wood",
  runoffM3PerYear: "cubic metre per year generated in the cell",
  fishKgPerYear: "kilogram per year sustainable catch",
  floodPpm: "parts per million: annual probability of a damaging flood",
  droughtPpm: "parts per million: annual probability of a severe drought",
  seismicPpm: "parts per million: annual probability of a damaging earthquake",
  wildfirePpm: "parts per million: annual probability of a damaging wildfire",
} as const);
export type CellLayer = keyof typeof CELL_LAYER_UNITS;
export const CELL_LAYERS = Object.freeze(Object.keys(CELL_LAYER_UNITS) as CellLayer[]);

export const DEPOSIT_UNIT = "tonne of ore or raw material in place" as const;
/** Largest single deposit (t); keeps per-mineral totals far below 2^53. */
export const MAX_DEPOSIT_T = 1_000_000_000;

/** Spatial ID of a cell: `cel_` + column and row, four base-36 digits each. Reversible and stable. */
export const cellIdSchema = z
  .string()
  .regex(/^cel_[0-9a-z]{8}$/, 'must be "cel_" followed by 4 base-36 column and 4 base-36 row digits')
  .brand<"CellId">();
export type CellId = z.output<typeof cellIdSchema>;

export const regionIdSchema = z.string().regex(idPattern("region"), "must be a region ID").brand<"RegionId">();
export type RegionId = z.output<typeof regionIdSchema>;

export const waterBodyIdSchema = z
  .string()
  .regex(idPattern("waterBody"), "must be a water body ID")
  .brand<"WaterBodyId">();
export type WaterBodyId = z.output<typeof waterBodyIdSchema>;

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const nonNegative = z.number().int().nonnegative();

/** Generator parameters. Part of the map version: any change makes a new map. */
export const mapParamsSchema = z
  .strictObject({
    width: int(8, 1024),
    height: int(8, 1024),
    /** Centre-to-centre distance of horizontally adjacent cells. */
    cellSpacingM: int(500, 50_000),
    /** Latitude of the top row's cell centres (micro-degrees, north positive). */
    topLatitudeMicroDeg: int(-80_000_000, 80_000_000),
    /** Sea-level annual mean temperature at the top and bottom rows. */
    seaLevelTemperatureTopDeciC: int(-300, 350),
    seaLevelTemperatureBottomDeciC: int(-300, 350),
    /** Target share of land among interior (non-border) cells, before island and lake cleanup. */
    landFractionPpm: int(100_000, 900_000),
    maxElevationM: int(100, 9_000),
    maxDepthM: int(100, 11_000),
    /** Mean region size in land cells. */
    regionTargetCells: int(4, 10_000),
    /** Smaller landmasses are submerged by the generator. */
    minLandmassCells: int(1, 10_000),
    /** Cells whose outflow reaches this discharge carry a river. */
    riverMinDischargeM3PerYear: int(1, Number.MAX_SAFE_INTEGER),
  })
  .refine((params) => params.width * params.height <= MAX_MAP_CELLS, {
    path: ["width"],
    message: `width × height must not exceed ${MAX_MAP_CELLS} cells`,
  });
export type MapParams = z.output<typeof mapParamsSchema>;

const generatorSchema = z.strictObject({
  id: z.literal("civ-hexgen"),
  version: z.string().regex(SEMVER_PATTERN),
});

const gridSchema = z.strictObject({
  layout: z.literal(MAP_GRID_LAYOUT),
  width: int(8, 1024),
  height: int(8, 1024),
  cellSpacingM: int(500, 50_000),
  /** Vertical distance between row centres: spacing × √3/2, rounded. */
  rowSpacingM: int(1, 50_000),
  /** Area of one hexagonal cell: spacing² × √3/2, rounded. */
  cellAreaM2: int(1, Number.MAX_SAFE_INTEGER),
});

/** A list that must equal `values` exactly (legends are versioned with the contract). */
const sameList = (values: readonly (string | number)[]) => (list: readonly (string | number)[]) =>
  list.length === values.length && list.every((value, index) => value === values[index]);

function exactList<const T extends string>(values: readonly [T, ...T[]]) {
  return z.array(z.enum(values)).refine(sameList(values), { message: `must be exactly [${values.join(", ")}]` });
}

const legendSchema = z.strictObject({
  terrain: exactList(TERRAIN_TYPES),
  biome: exactList(BIOMES),
  climateClass: exactList(CLIMATE_CLASSES),
  climateBand: exactList(CLIMATE_BANDS),
  mineral: exactList(MINERALS),
});

const unitsSchema = z.strictObject(
  Object.fromEntries(CELL_LAYERS.map((layer) => [layer, z.literal(CELL_LAYER_UNITS[layer])])) as {
    [K in CellLayer]: z.ZodLiteral<(typeof CELL_LAYER_UNITS)[K]>;
  },
);

const layerArray = z.array(z.number().int());
const cellsSchema = z.strictObject(
  Object.fromEntries(CELL_LAYERS.map((layer) => [layer, layerArray])) as { [K in CellLayer]: typeof layerArray },
);

const worldMapShape = {
  schemaVersion: z.literal(WORLD_MAP_SCHEMA_VERSION),
  worldId: worldIdSchema,
  seed: worldSeedSchema,
  generator: generatorSchema,
  params: mapParamsSchema,
  /** Digest of generator and params: the map's algorithm/configuration version. */
  mapVersion: digestSchema,
  grid: gridSchema,
  projection: z.strictObject({
    kind: z.literal(MAP_PROJECTION_KIND),
    topLatitudeMicroDeg: int(-90_000_000, 90_000_000),
    metresPerDegreeLatitude: z.literal(METRES_PER_DEGREE_LATITUDE),
  }),
  legend: legendSchema,
  units: unitsSchema,
  depositUnit: z.literal(DEPOSIT_UNIT),
  /** Per-row latitude of cell centres (micro-degrees) and its climate band index. */
  rows: z.strictObject({ latitudeMicroDeg: layerArray, climateBand: layerArray }),
  cells: cellsSchema,
  deposits: z.array(z.strictObject({ cell: nonNegative, mineral: nonNegative, amountT: int(1, MAX_DEPOSIT_T) })),
  landmasses: z.array(z.strictObject({ firstCell: nonNegative, cellCount: int(1, MAX_MAP_CELLS) })),
  regions: z.array(
    z.strictObject({
      regionId: regionIdSchema,
      seedCell: nonNegative,
      landmass: nonNegative,
      cellCount: int(1, MAX_MAP_CELLS),
      landAreaHa: nonNegative,
    }),
  ),
  waterBodies: z.array(
    z.strictObject({
      waterBodyId: waterBodyIdSchema,
      kind: z.enum(["ocean", "lake"]),
      firstCell: nonNegative,
      cellCount: int(1, MAX_MAP_CELLS),
      surfaceElevationM: int(-1, 9_000),
    }),
  ),
  /** Canonical hash of the document without this field. */
  mapHash: digestSchema,
};

/**
 * Authoritative world map (internal). Structural checks only; semantic
 * invariants (water/land consistency, drainage, connectedness, resource
 * bounds, hash) are verified by the domain's map validator.
 */
export const worldMapSchema = z.strictObject(worldMapShape).superRefine((map, ctx) => {
  const cellCount = map.grid.width * map.grid.height;
  if (map.grid.width !== map.params.width || map.grid.height !== map.params.height) {
    ctx.addIssue({ code: "custom", path: ["grid"], message: "grid size must match params" });
  }
  for (const layer of CELL_LAYERS) {
    if (map.cells[layer].length !== cellCount) {
      ctx.addIssue({ code: "custom", path: ["cells", layer], message: `must have ${cellCount} entries` });
    }
  }
  for (const key of ["latitudeMicroDeg", "climateBand"] as const) {
    if (map.rows[key].length !== map.grid.height) {
      ctx.addIssue({ code: "custom", path: ["rows", key], message: `must have ${map.grid.height} entries` });
    }
  }
});
export type WorldMap = z.output<typeof worldMapSchema>;
/** A map document before its hash is attached. */
export type UnhashedWorldMap = Omit<WorldMap, "mapHash">;

/** Elevation band boundaries (m) used by the public snapshot. */
export const ELEVATION_BANDS_M = Object.freeze([-200, 0, 200, 500, 1_000, 1_500, 2_000, 3_000] as const);

/** Bits of the public snapshot's `features` characters. */
export const SNAPSHOT_FEATURES = Object.freeze({ coast: 1, river: 2 } as const);

const codeString = (alphabet: string) => z.string().regex(new RegExp(`^[${alphabet}]*$`), `must use [${alphabet}]`);

/**
 * Compact public map projection for the web client. It carries terrain,
 * biome, elevation band, coast/river features and region membership, but no
 * resource stocks, hazard rates, climate values or drainage data.
 * Categorical layers are strings with one base-36 character per cell.
 */
export const publicMapSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(PUBLIC_MAP_SNAPSHOT_SCHEMA_VERSION),
    worldId: worldIdSchema,
    mapVersion: digestSchema,
    mapHash: digestSchema,
    grid: gridSchema.omit({ cellAreaM2: true }),
    legend: z.strictObject({
      terrain: legendSchema.shape.terrain,
      biome: legendSchema.shape.biome,
      elevationBandsM: z
        .array(z.number().int())
        .refine(sameList(ELEVATION_BANDS_M), { message: `must be exactly [${ELEVATION_BANDS_M.join(", ")}]` }),
    }),
    terrain: codeString("0-9a-z"),
    biome: codeString("0-9a-z"),
    elevationBand: codeString("0-9"),
    features: codeString("0-3"),
    /** Run-length region membership: [regionIndex or -1, runLength, …] in cell order. */
    regionRuns: z.array(z.number().int().min(-1).max(MAX_MAP_CELLS)).max(2 * MAX_MAP_CELLS),
    regions: z.array(
      z.strictObject({ regionId: regionIdSchema, seedCell: nonNegative, cellCount: int(1, MAX_MAP_CELLS) }),
    ),
  })
  .superRefine((snapshot, ctx) => {
    const cellCount = snapshot.grid.width * snapshot.grid.height;
    for (const key of ["terrain", "biome", "elevationBand", "features"] as const) {
      if (snapshot[key].length !== cellCount) {
        ctx.addIssue({ code: "custom", path: [key], message: `must have ${cellCount} characters` });
      }
    }
    let covered = 0;
    let wellFormed = snapshot.regionRuns.length % 2 === 0;
    for (let index = 0; index < snapshot.regionRuns.length; index += 2) {
      const region = snapshot.regionRuns[index] as number;
      const run = snapshot.regionRuns[index + 1] ?? 0;
      if (region >= snapshot.regions.length || run < 1) wellFormed = false;
      covered += run;
    }
    if (!wellFormed || covered !== cellCount) {
      ctx.addIssue({
        code: "custom",
        path: ["regionRuns"],
        message: `must be [region (−1 or a region index), run ≥ 1] pairs covering ${cellCount} cells`,
      });
    }
  });
export type PublicMapSnapshot = z.output<typeof publicMapSnapshotSchema>;
