import {
  BIOMES,
  CELL_FLAGS,
  CELL_LAYER_UNITS,
  CLIMATE_BANDS,
  CLIMATE_CLASSES,
  DEPOSIT_UNIT,
  MAP_GRID_LAYOUT,
  MAP_PROJECTION_KIND,
  mapParamsSchema,
  METRES_PER_DEGREE_LATITUDE,
  MINERALS,
  parseContract,
  TERRAIN_TYPES,
  worldIdSchema,
  worldSeedSchema,
  type Biome,
  type ClimateClass,
  type Digest,
  type MapParams,
  type Mineral,
  type TerrainType,
  type UnhashedWorldMap,
  type WorldMap,
} from "@civ/contracts";
import { canonicalHash } from "../hash.js";
import { deriveId } from "../ids.js";
import { RandomRoot } from "../random.js";
import { allocate, divide, mulDiv } from "../units.js";
import { cellAreaFor, cellColRow, cellsWithin, rowSpacingFor, topologyFor } from "./grid.js";
import { CellHeap } from "./heap.js";
import { climateBandOf, FISH_KG_PER_HA, landformOf, RIVER_FISH_M3_PER_KG } from "./classify.js";
import { floorDiv, fractalNoise, hash3, valueNoise } from "./noise.js";
import { costFieldFromLayers, FOOT_TRAVEL, travelField } from "./routes.js";
import { assertValidWorldMap } from "./validate.js";

/**
 * Deterministic world map generator `civ-hexgen`.
 *
 * Input: world ID, world seed and `MapParams`. Output: a complete, validated
 * `WorldMap` document. Every random choice comes from streams
 * `["map", "civ-hexgen", <layer>]` of the world seed, and all arithmetic is
 * integer, so the same inputs give a byte-identical document (and hash) on
 * every platform.
 *
 * Bump `MAP_GENERATOR.version` for any change that can alter output for the
 * same inputs; the version is part of `mapVersion` and of the document hash.
 * Pipeline and abstraction limits: docs/GEOGRAPHY.md.
 */
export const MAP_GENERATOR = Object.freeze({ id: "civ-hexgen" as const, version: "1.0.0" });

/** Season 1 default: an 80 × 60 hex region (5 km cells, ≈104,000 km²) at mid-northern latitudes. */
export const DEFAULT_MAP_PARAMS: MapParams = Object.freeze({
  width: 80,
  height: 60,
  cellSpacingM: 5_000,
  topLatitudeMicroDeg: 43_000_000,
  seaLevelTemperatureTopDeciC: 115,
  seaLevelTemperatureBottomDeciC: 150,
  landFractionPpm: 550_000,
  maxElevationM: 3_200,
  maxDepthM: 2_500,
  regionTargetCells: 60,
  minLandmassCells: 6,
  riverMinDischargeM3PerYear: 150_000_000,
});

/** The map's algorithm/configuration version: digest of generator identity and params. */
export function mapVersionOf(params: MapParams, generator: { id: string; version: string } = MAP_GENERATOR): Digest {
  return canonicalHash({ generator: { id: generator.id, version: generator.version }, params });
}

const terrainCode = (value: TerrainType) => TERRAIN_TYPES.indexOf(value);
const biomeCode = (value: Biome) => BIOMES.indexOf(value);
const climateCode = (value: ClimateClass) => CLIMATE_CLASSES.indexOf(value);

const T = {
  deepOcean: terrainCode("deep_ocean"),
  shelfSea: terrainCode("shelf_sea"),
  lake: terrainCode("lake"),
  plains: terrainCode("plains"),
  hills: terrainCode("hills"),
  mountains: terrainCode("mountains"),
  highMountains: terrainCode("high_mountains"),
};

/** Land cover shares by biome: [forest, grassland, wetland, barren] weights. */
const COVER_WEIGHTS: Readonly<Record<Biome, readonly [number, number, number, number]>> = {
  ocean: [0, 0, 0, 1],
  lake: [0, 0, 0, 1],
  glacier: [0, 0, 0, 100],
  alpine_tundra: [5, 50, 5, 40],
  boreal_forest: [75, 15, 6, 4],
  temperate_forest: [80, 15, 3, 2],
  mediterranean_woodland: [40, 48, 2, 10],
  temperate_grassland: [8, 85, 3, 4],
  semi_desert: [3, 55, 1, 41],
  desert: [1, 9, 0, 90],
  wetland: [20, 20, 60, 0],
};

/** Extra barren weight by landform. */
const TERRAIN_BARREN: readonly number[] = TERRAIN_TYPES.map((terrain) =>
  terrain === "hills" ? 5 : terrain === "mountains" ? 25 : terrain === "high_mountains" ? 60 : 0,
);

/** Standing timber per forested hectare (m³/ha), order-of-magnitude defaults. */
const TIMBER_M3_PER_HA: Readonly<Record<Biome, number>> = {
  ocean: 0,
  lake: 0,
  glacier: 0,
  alpine_tundra: 60,
  boreal_forest: 120,
  temperate_forest: 250,
  mediterranean_woodland: 90,
  temperate_grassland: 60,
  semi_desert: 30,
  desert: 20,
  wetland: 110,
};

interface DepositRule {
  readonly mineral: Mineral;
  /** Noise wavelength as a fraction of map width (divisor). */
  readonly widthDivisor: number;
  /** Noise value (0–65535) above which a deposit exists. */
  readonly cutoff: number;
  readonly minT: number;
  readonly maxT: number;
  readonly eligible: (cell: CellFacts) => boolean;
}

interface CellFacts {
  readonly terrain: number;
  readonly biome: number;
  readonly climate: number;
  readonly flags: number;
  readonly nearFreshWater: boolean;
  readonly nearOcean: boolean;
}

const UPLAND = new Set([T.hills, T.mountains, T.highMountains]);
const MOUNTAIN = new Set([T.mountains, T.highMountains]);

const DEPOSIT_RULES: readonly DepositRule[] = [
  {
    mineral: "copper_ore",
    widthDivisor: 6,
    cutoff: 50_000,
    minT: 50_000,
    maxT: 2_000_000,
    eligible: (c) => UPLAND.has(c.terrain),
  },
  {
    mineral: "tin_ore",
    widthDivisor: 8,
    cutoff: 54_000,
    minT: 5_000,
    maxT: 200_000,
    eligible: (c) => UPLAND.has(c.terrain),
  },
  {
    mineral: "iron_ore",
    widthDivisor: 5,
    cutoff: 48_000,
    minT: 100_000,
    maxT: 5_000_000,
    eligible: (c) => c.biome !== biomeCode("glacier"),
  },
  {
    mineral: "precious_metal_ore",
    widthDivisor: 8,
    cutoff: 52_000,
    minT: 1_000,
    maxT: 50_000,
    eligible: (c) => MOUNTAIN.has(c.terrain),
  },
  {
    mineral: "salt",
    widthDivisor: 6,
    cutoff: 46_000,
    minT: 100_000,
    maxT: 10_000_000,
    eligible: (c) =>
      c.climate === climateCode("arid") ||
      c.climate === climateCode("semi_arid") ||
      (c.nearOcean && c.terrain === T.plains),
  },
  {
    mineral: "building_stone",
    widthDivisor: 10,
    cutoff: 40_000,
    minT: 1_000_000,
    maxT: 50_000_000,
    eligible: (c) => UPLAND.has(c.terrain),
  },
  {
    mineral: "clay",
    widthDivisor: 10,
    cutoff: 38_000,
    minT: 100_000,
    maxT: 5_000_000,
    eligible: (c) => (c.terrain === T.plains || c.terrain === T.hills) && c.nearFreshWater,
  },
];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

interface Components {
  readonly label: Int32Array;
  readonly sizes: number[];
  readonly first: number[];
}

/** Connected components of `member` cells, labelled in ascending index order of their first cell. */
function components(neighbours: Int32Array, member: Uint8Array): Components {
  const count = member.length;
  const label = new Int32Array(count).fill(-1);
  const sizes: number[] = [];
  const first: number[] = [];
  const queue = new Int32Array(count);
  for (let start = 0; start < count; start += 1) {
    if (member[start] !== 1 || label[start] !== -1) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const cell = queue[head++] as number;
      for (let direction = 0; direction < 6; direction += 1) {
        const next = neighbours[cell * 6 + direction] as number;
        if (next >= 0 && member[next] === 1 && label[next] === -1) {
          label[next] = id;
          queue[tail++] = next;
        }
      }
    }
    sizes.push(tail);
    first.push(start);
  }
  return { label, sizes, first };
}

/** Closed depressions at least this deep (m) hold a lake. */
const LAKE_MIN_DEPTH_M = 25;

/**
 * Priority flood (Barnes et al. 2014) from every ocean cell next to non-ocean
 * cells, keyed by raw height with index tie-breaks. Returns each non-ocean
 * cell's receiver, the discovery order (upstream cells come later) and the
 * filled surface in metres.
 */
function drain(
  neighbours: Int32Array,
  ocean: Uint8Array,
  key: Float64Array,
  seaKey: number,
  elevation: Int32Array,
): { flowTo: Int32Array; order: number[]; surface: Int32Array } {
  const count = ocean.length;
  const flowTo = new Int32Array(count).fill(-1);
  const surface = new Int32Array(count);
  const visited = new Uint8Array(count);
  const level = new Float64Array(count);
  const order: number[] = [];
  const heap = new CellHeap();
  for (let cell = 0; cell < count; cell += 1) {
    if (ocean[cell] !== 1) continue;
    visited[cell] = 1;
    level[cell] = seaKey;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && ocean[next] === 0) {
        heap.push(seaKey, cell);
        break;
      }
    }
  }
  while (heap.size > 0) {
    const [current, cell] = heap.pop();
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next < 0 || visited[next] === 1) continue;
      visited[next] = 1;
      level[next] = Math.max(key[next] as number, current);
      surface[next] = Math.max(elevation[next] as number, surface[cell] as number);
      flowTo[next] = cell;
      order.push(next);
      heap.push(level[next] as number, next);
    }
  }
  return { flowTo, order, surface };
}

export interface GenerateWorldMapInput {
  readonly worldId: string;
  readonly seed: string;
  readonly params?: MapParams;
}

export function generateWorldMap(input: GenerateWorldMapInput): WorldMap {
  const worldId = parseContract("world id", worldIdSchema, input.worldId) as string;
  const seed = parseContract("world seed", worldSeedSchema, input.seed);
  const params = parseContract("map params", mapParamsSchema, input.params ?? DEFAULT_MAP_PARAMS);
  const { width, height, cellSpacingM } = params;
  const count = width * height;
  const { neighbours } = topologyFor(params);
  const rowSpacingM = rowSpacingFor(cellSpacingM);
  const cellAreaM2 = cellAreaFor(cellSpacingM);
  const cellAreaHa = divide(cellAreaM2, 10_000, "half_even");
  const half = Math.floor(cellSpacingM / 2);
  const widthM = (width - 1) * cellSpacingM + half;
  const heightM = (height - 1) * rowSpacingM;

  // Projection: rows run north → south at the mean meridian degree length.
  const latitude = Array.from(
    { length: height },
    (_, row) =>
      params.topLatitudeMicroDeg - mulDiv(row * rowSpacingM, 1_000_000, METRES_PER_DEGREE_LATITUDE, "half_even"),
  );
  if ((latitude[height - 1] as number) < -90_000_000) {
    throw new RangeError("the map extends beyond the south pole; lower the height or the top latitude");
  }

  const root = new RandomRoot(seed);
  const word = (layer: string) => root.stream("map", MAP_GENERATOR.id, layer).nextUint32();
  const seeds = {
    continent: word("continent"),
    ridge: word("ridge"),
    tectonic: word("tectonic"),
    temperature: word("temperature"),
    precipitation: word("precipitation"),
    soil: word("soil"),
    wetland: word("wetland"),
    seismic: word("seismic"),
  };

  const xs = new Int32Array(count);
  const ys = new Int32Array(count);
  for (let cell = 0; cell < count; cell += 1) {
    const [col, row] = cellColRow(params, cell);
    xs[cell] = col * cellSpacingM + ((row & 1) === 1 ? half : 0);
    ys[cell] = row * rowSpacingM;
  }

  // 1. Raw height: fractal continent noise + ridged mountain belts − radial falloff.
  const raw = new Float64Array(count);
  const centreX = Math.max(1, Math.floor(widthM / 2));
  const centreY = Math.max(1, Math.floor(heightM / 2));
  const continentWave = Math.max(cellSpacingM * 4, Math.floor(widthM / 2));
  const ridgeWave = Math.max(cellSpacingM * 3, Math.floor(widthM / 4));
  const tectonicWave = Math.max(cellSpacingM * 4, Math.floor(widthM / 3));
  for (let cell = 0; cell < count; cell += 1) {
    const x = xs[cell] as number;
    const y = ys[cell] as number;
    const base = fractalNoise(seeds.continent, x, y, continentWave, 5);
    const ridgeValue = fractalNoise(seeds.ridge, x, y, ridgeWave, 2);
    const ridge = 65_535 - Math.abs(2 * ridgeValue - 65_535);
    const belt = valueNoise(seeds.tectonic, 0, x, y, tectonicWave);
    const mountains = floorDiv(Math.max(0, ridge - 50_000) * belt, 65_536) * 3;
    const dx = floorDiv((x - centreX) * 65_536, centreX);
    const dy = floorDiv((y - centreY) * 65_536, centreY);
    const distance = floorDiv(dx * dx + dy * dy, 65_536);
    raw[cell] = base * 3 + mountains - distance;
  }

  // 2. Sea level at the land-fraction quantile of the interior cells; the
  //    outer ring is always sea.
  const isBorder = (cell: number) => {
    const [col, row] = cellColRow(params, cell);
    return col === 0 || row === 0 || col === width - 1 || row === height - 1;
  };
  const interior: number[] = [];
  for (let cell = 0; cell < count; cell += 1) if (!isBorder(cell)) interior.push(raw[cell] as number);
  const sorted = Float64Array.from(interior).sort();
  const waterCount = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length * (1_000_000 - params.landFractionPpm)) / 1_000_000),
  );
  const seaRaw = sorted[waterCount] as number;
  const land = new Uint8Array(count);
  for (let cell = 0; cell < count; cell += 1) land[cell] = !isBorder(cell) && (raw[cell] as number) > seaRaw ? 1 : 0;

  // 3. Elevation in metres: squared hypsometric curve on land, linear depth
  //    at sea. Monotone in the raw height, which stays the drainage key.
  let rawMax = Number.NEGATIVE_INFINITY;
  let rawMin = Number.POSITIVE_INFINITY;
  for (let cell = 0; cell < count; cell += 1) {
    const value = raw[cell] as number;
    if (land[cell] === 1 && value > rawMax) rawMax = value;
    if (value < rawMin) rawMin = value;
  }
  const elevation = new Int32Array(count);
  const submerge = (cell: number) => {
    land[cell] = 0;
    raw[cell] = seaRaw - 1;
    elevation[cell] = -5;
  };
  for (let cell = 0; cell < count; cell += 1) {
    const value = raw[cell] as number;
    if (land[cell] === 1) {
      const t = clamp(floorDiv((value - seaRaw) * 65_536, Math.max(1, rawMax - seaRaw)), 0, 65_536);
      elevation[cell] = 1 + Math.floor((params.maxElevationM * t * t) / 4_294_967_296);
    } else if (value <= seaRaw) {
      const t = clamp(floorDiv((seaRaw - value) * 65_536, Math.max(1, seaRaw - rawMin)), 0, 65_536);
      elevation[cell] = -1 - Math.floor((params.maxDepthM * t) / 65_536);
    } else {
      submerge(cell);
    }
  }

  // 4. Lakes form in closed depressions at least LAKE_MIN_DEPTH_M deep.
  const oceanOf = () => {
    const parts = components(
      neighbours,
      land.map((value) => (value === 1 ? 0 : 1)),
    );
    return Uint8Array.from(parts.label, (label) => (label === parts.label[0] ? 1 : 0));
  };
  const firstPass = drain(neighbours, oceanOf(), raw, seaRaw, elevation);
  for (let cell = 0; cell < count; cell += 1) {
    if (land[cell] === 1 && (firstPass.surface[cell] as number) - (elevation[cell] as number) >= LAKE_MIN_DEPTH_M) {
      land[cell] = 0;
    }
  }

  // 5. Connectedness policy: submerge landmasses below the minimum size and
  //    land enclosed by a lake (every landmass must border the ocean).
  let landParts = components(neighbours, land);
  for (let cell = 0; cell < count; cell += 1) {
    const part = landParts.label[cell] as number;
    if (part >= 0 && (landParts.sizes[part] as number) < params.minLandmassCells) submerge(cell);
  }
  const oceanBeforeCleanup = oceanOf();
  landParts = components(neighbours, land);
  const bordersOcean = new Uint8Array(landParts.sizes.length);
  for (let cell = 0; cell < count; cell += 1) {
    const part = landParts.label[cell] as number;
    if (part < 0) continue;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && oceanBeforeCleanup[next] === 1) bordersOcean[part] = 1;
    }
  }
  for (let cell = 0; cell < count; cell += 1) {
    const part = landParts.label[cell] as number;
    if (part >= 0 && bordersOcean[part] === 0) submerge(cell);
  }
  landParts = components(neighbours, land);
  const waterParts = components(
    neighbours,
    land.map((value) => (value === 1 ? 0 : 1)),
  );
  const ocean = new Uint8Array(count);
  const lake = new Uint8Array(count);
  for (let cell = 0; cell < count; cell += 1) {
    if (land[cell] === 1) continue;
    if (waterParts.label[cell] === waterParts.label[0]) ocean[cell] = 1;
    else lake[cell] = 1;
  }

  // 6. Drainage: priority flood from the coast on the raw height. Every
  //    non-ocean cell gets a receiver on a non-decreasing filled surface
  //    towards the ocean, so there are no cycles or sinks. Lakes fill to
  //    their spill level, which becomes their surface elevation.
  const { flowTo, order, surface: filled } = drain(neighbours, ocean, raw, seaRaw, elevation);
  for (let cell = 0; cell < count; cell += 1) if (lake[cell] === 1) elevation[cell] = filled[cell] as number;

  // 6. Climate: latitude gradient and lapse rate; west-to-east moisture sweep
  //    with orographic rain and rain shadows.
  const temperature = new Int32Array(count);
  const precipitation = new Int32Array(count);
  const temperatureWave = Math.max(cellSpacingM * 4, Math.floor(widthM / 4));
  const precipitationWave = Math.max(cellSpacingM * 4, Math.floor(widthM / 3));
  for (let row = 0; row < height; row += 1) {
    const seaLevelTemperature =
      params.seaLevelTemperatureTopDeciC +
      mulDiv(
        params.seaLevelTemperatureBottomDeciC - params.seaLevelTemperatureTopDeciC,
        row,
        Math.max(1, height - 1),
        "half_even",
      );
    let moisture = 700;
    let previousElevation = 0;
    for (let col = 0; col < width; col += 1) {
      const cell = row * width + col;
      const x = xs[cell] as number;
      const y = ys[cell] as number;
      const temperatureNoise = fractalNoise(seeds.temperature, x, y, temperatureWave, 2);
      const adjust = floorDiv((temperatureNoise - 32_768) * 15, 32_768);
      if (ocean[cell] === 1) {
        temperature[cell] = seaLevelTemperature + adjust;
        moisture = Math.min(1_000, moisture + 250);
        precipitation[cell] = 500 + floorDiv(moisture * 400, 1_000);
        previousElevation = 0;
      } else {
        const height_ = elevation[cell] as number;
        temperature[cell] = seaLevelTemperature - floorDiv(height_ * 65, 1_000) + adjust;
        const uplift = clamp(height_ - previousElevation, 0, 1_500);
        const rain = Math.min(moisture, floorDiv(moisture * 30, 1_000) + floorDiv(moisture * uplift, 3_000));
        moisture = moisture - rain + floorDiv(rain * 450, 1_000);
        if (lake[cell] === 1) moisture = Math.min(1_000, moisture + 40);
        precipitation[cell] = 150 + rain * 22;
        previousElevation = height_;
      }
      const precipitationNoise = fractalNoise(seeds.precipitation, x, y, precipitationWave, 3);
      precipitation[cell] = clamp(
        floorDiv((precipitation[cell] as number) * (800 + floorDiv(precipitationNoise * 400, 65_536)), 1_000),
        60,
        4_000,
      );
    }
  }
  // One smoothing pass over land so the row sweep leaves no stripes.
  const sweep = Int32Array.from(precipitation);
  for (let cell = 0; cell < count; cell += 1) {
    if (ocean[cell] === 1) continue;
    let total = (sweep[cell] as number) * 2;
    let weight = 2;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && ocean[next] === 0) {
        total += sweep[next] as number;
        weight += 1;
      }
    }
    precipitation[cell] = Math.floor(total / weight);
  }
  const climateBandRow = latitude.map(climateBandOf);

  // 7. Landform, runoff (Budyko-style P²/(P+PET)) and accumulated discharge.
  const relief = new Int32Array(count);
  const terrain = new Int32Array(count);
  const runoff = new Float64Array(count);
  for (let cell = 0; cell < count; cell += 1) {
    const height_ = elevation[cell] as number;
    if (ocean[cell] === 1) {
      terrain[cell] = height_ < -200 ? T.deepOcean : T.shelfSea;
      continue;
    }
    let steepest = 0;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && ocean[next] === 0)
        steepest = Math.max(steepest, Math.abs(height_ - (elevation[next] as number)));
    }
    relief[cell] = steepest;
    const p = precipitation[cell] as number;
    const pet = clamp(250 + 3 * (temperature[cell] as number), 150, 1_400);
    if (lake[cell] === 1) {
      terrain[cell] = T.lake;
      runoff[cell] = mulDiv(Math.max(0, p - pet), cellAreaM2, 1_000, "floor");
      continue;
    }
    terrain[cell] = landformOf(height_, steepest);
    runoff[cell] = mulDiv(Math.floor((p * p) / (p + pet)), cellAreaM2, 1_000, "floor");
  }
  const discharge = Float64Array.from(runoff);
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const cell = order[index] as number;
    const receiver = flowTo[cell] as number;
    if (receiver >= 0 && ocean[receiver] === 0)
      discharge[receiver] = (discharge[receiver] as number) + (discharge[cell] as number);
  }

  const flags = new Int32Array(count);
  for (let cell = 0; cell < count; cell += 1) {
    if (land[cell] === 0) {
      flags[cell] = CELL_FLAGS.water;
      continue;
    }
    let value = 0;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && land[next] === 0) value |= CELL_FLAGS.coast;
    }
    if ((discharge[cell] as number) >= params.riverMinDischargeM3PerYear) value |= CELL_FLAGS.river;
    flags[cell] = value;
  }

  // 8. Climate class and biome.
  const climate = new Int32Array(count);
  const biome = new Int32Array(count);
  const nearFreshWater = new Uint8Array(count);
  const nearOcean = new Uint8Array(count);
  for (let cell = 0; cell < count; cell += 1) {
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next < 0) continue;
      if (lake[next] === 1 || ((flags[next] as number) & CELL_FLAGS.river) !== 0) nearFreshWater[cell] = 1;
      if (ocean[next] === 1) nearOcean[cell] = 1;
    }
    if (((flags[cell] as number) & CELL_FLAGS.river) !== 0) nearFreshWater[cell] = 1;
    const t = temperature[cell] as number;
    const p = precipitation[cell] as number;
    const height_ = elevation[cell] as number;
    if (ocean[cell] === 1) {
      climate[cell] = climateCode("marine");
      biome[cell] = biomeCode("ocean");
      continue;
    }
    const klass: ClimateClass =
      t < -60
        ? "polar_ice"
        : height_ >= 1_800 || t < 20
          ? "alpine"
          : p < 250
            ? "arid"
            : p < 450
              ? "semi_arid"
              : t >= 130 && p < 800
                ? "mediterranean"
                : t >= 80
                  ? "humid_temperate"
                  : "cool_temperate";
    climate[cell] = climateCode(klass);
    if (lake[cell] === 1) {
      biome[cell] = biomeCode("lake");
      continue;
    }
    const wetland =
      nearFreshWater[cell] === 1 &&
      (relief[cell] as number) < 40 &&
      height_ < 400 &&
      p >= 550 &&
      hash3(seeds.wetland, cell, 0, 0) % 100 < 35;
    let kind: Biome;
    switch (klass) {
      case "polar_ice":
        kind = "glacier";
        break;
      case "alpine":
        kind = t < -30 ? "glacier" : "alpine_tundra";
        break;
      case "arid":
        kind = "desert";
        break;
      case "semi_arid":
        kind = t >= 120 ? "semi_desert" : "temperate_grassland";
        break;
      case "mediterranean":
        kind = "mediterranean_woodland";
        break;
      case "humid_temperate":
        kind = p >= 650 ? "temperate_forest" : "temperate_grassland";
        break;
      case "cool_temperate":
        kind = p < 450 ? "temperate_grassland" : t < 60 ? "boreal_forest" : "temperate_forest";
        break;
    }
    if (wetland && kind !== "glacier" && kind !== "alpine_tundra" && kind !== "desert") kind = "wetland";
    biome[cell] = biomeCode(kind);
  }

  // 9. Land cover, arable potential, timber, fish and hazards.
  const landAreaHa = new Int32Array(count);
  const forestHa = new Int32Array(count);
  const grasslandHa = new Int32Array(count);
  const wetlandHa = new Int32Array(count);
  const barrenHa = new Int32Array(count);
  const arableHa = new Int32Array(count);
  const timber = new Float64Array(count);
  const fish = new Float64Array(count);
  const flood = new Int32Array(count);
  const drought = new Int32Array(count);
  const seismic = new Int32Array(count);
  const wildfire = new Int32Array(count);
  const seismicWave = Math.max(cellSpacingM * 4, Math.floor(widthM / 4));
  for (let cell = 0; cell < count; cell += 1) {
    const kind = BIOMES[biome[cell] as number] as Biome;
    if (land[cell] === 0) {
      const perHa = FISH_KG_PER_HA[TERRAIN_TYPES[terrain[cell] as number] as TerrainType] ?? 0;
      fish[cell] = cellAreaHa * perHa;
      continue;
    }
    const x = xs[cell] as number;
    const y = ys[cell] as number;
    const t = temperature[cell] as number;
    const p = precipitation[cell] as number;
    const height_ = elevation[cell] as number;
    const river = ((flags[cell] as number) & CELL_FLAGS.river) !== 0;
    landAreaHa[cell] = cellAreaHa;
    const weights = COVER_WEIGHTS[kind];
    const [forest, grass, wet, bare] = allocate(cellAreaHa, [
      weights[0],
      weights[1],
      weights[2],
      weights[3] + (TERRAIN_BARREN[terrain[cell] as number] as number),
    ]) as [number, number, number, number];
    forestHa[cell] = forest;
    grasslandHa[cell] = grass;
    wetlandHa[cell] = wet;
    barrenHa[cell] = bare;

    const landform =
      terrain[cell] === T.plains
        ? 1_000_000
        : terrain[cell] === T.hills
          ? 450_000
          : terrain[cell] === T.mountains
            ? 80_000
            : 0;
    const warmth =
      t < 40
        ? 0
        : t < 90
          ? floorDiv((t - 40) * 1_000_000, 50)
          : t <= 200
            ? 1_000_000
            : Math.max(400_000, 1_000_000 - (t - 200) * 20_000);
    const moistureFit = p < 250 ? 0 : p < 550 ? floorDiv((p - 250) * 1_000_000, 300) : p <= 1_400 ? 1_000_000 : 700_000;
    const biomeFit = kind === "wetland" ? 300_000 : kind === "glacier" || kind === "desert" ? 0 : 1_000_000;
    const soil =
      600_000 +
      floorDiv(valueNoise(seeds.soil, 0, x, y, Math.max(cellSpacingM * 3, Math.floor(widthM / 8))) * 400_000, 65_536);
    let arable = cellAreaHa;
    for (const factor of [landform, warmth, moistureFit, biomeFit, soil])
      arable = mulDiv(arable, factor, 1_000_000, "floor");
    arableHa[cell] = Math.min(arable, forest + grass);
    timber[cell] = forest * TIMBER_M3_PER_HA[kind];
    fish[cell] = river ? Math.floor((discharge[cell] as number) / RIVER_FISH_M3_PER_KG) : 0;

    let floodPpm = 0;
    if (river) floodPpm = 20_000 + Math.min(30_000, Math.floor((discharge[cell] as number) / 100_000_000) * 1_000);
    else if (((flags[cell] as number) & CELL_FLAGS.coast) !== 0 && height_ < 20) floodPpm = 8_000;
    else if (nearFreshWater[cell] === 1 && height_ < 300) floodPpm = 5_000;
    if (kind === "wetland") floodPpm += 15_000;
    flood[cell] = floodPpm;
    drought[cell] = p < 300 ? 150_000 : p < 700 ? 150_000 - (p - 300) * 300 : Math.max(5_000, 30_000 - (p - 700) * 25);
    const fault = valueNoise(seeds.seismic, 0, x, y, seismicWave);
    const faultLine = 65_535 - Math.abs(2 * fault - 65_535);
    seismic[cell] =
      floorDiv(Math.max(0, faultLine - 45_000) * 2_000, 20_536) + (MOUNTAIN.has(terrain[cell] as number) ? 300 : 0);
    const dryness = p < 1_200 ? 1_200 - p : 0;
    const fuelPpm = floorDiv((forest + floorDiv(grass, 2)) * 1_000_000, Math.max(1, cellAreaHa));
    const fire = mulDiv(dryness, fuelPpm, 30_000, "floor");
    wildfire[cell] = kind === "mediterranean_woodland" ? floorDiv(fire * 3, 2) : fire;
  }

  // 10. Mineral deposits (sparse list, tonnes in place).
  const deposits: { cell: number; mineral: number; amountT: number }[] = [];
  const depositSeeds = DEPOSIT_RULES.map((rule) => word(`deposit.${rule.mineral}`));
  for (let cell = 0; cell < count; cell += 1) {
    if (land[cell] === 0) continue;
    const facts: CellFacts = {
      terrain: terrain[cell] as number,
      biome: biome[cell] as number,
      climate: climate[cell] as number,
      flags: flags[cell] as number,
      nearFreshWater: nearFreshWater[cell] === 1,
      nearOcean: nearOcean[cell] === 1,
    };
    DEPOSIT_RULES.forEach((rule, index) => {
      if (!rule.eligible(facts)) return;
      const wave = Math.max(cellSpacingM * 2, Math.floor(widthM / rule.widthDivisor));
      const field = valueNoise(depositSeeds[index] as number, 0, xs[cell] as number, ys[cell] as number, wave);
      if (field < rule.cutoff) return;
      const amountT = rule.minT + floorDiv((rule.maxT - rule.minT) * (field - rule.cutoff), 65_536 - rule.cutoff);
      deposits.push({ cell, mineral: MINERALS.indexOf(rule.mineral), amountT });
    });
  }

  // 11. Regions: spaced seeds, grown by foot travel time (mountains and
  //     wetlands become borders). Every landmass has at least one region.
  const costField = costFieldFromLayers(params, { terrain, biome, flags }, FOOT_TRAVEL);
  const landCells: number[] = [];
  for (let cell = 0; cell < count; cell += 1) if (land[cell] === 1) landCells.push(cell);
  const wanted = Math.max(1, Math.ceil(landCells.length / params.regionTargetCells));
  let exclusion = 0;
  while (3 * exclusion * (exclusion + 1) + 1 < params.regionTargetCells) exclusion += 1;
  // Seeds closer than the radius of a target-sized hexagon are excluded.

  const blocked = new Uint8Array(count);
  const chosen: number[] = [];
  for (const cell of root.stream("map", MAP_GENERATOR.id, "regions").shuffled(landCells)) {
    if (chosen.length >= wanted) break;
    if (blocked[cell] === 1) continue;
    chosen.push(cell);
    for (const near of cellsWithin(params, cell, exclusion)) blocked[near] = 1;
  }
  const seeded = new Uint8Array(landParts.sizes.length);
  for (const cell of chosen) seeded[landParts.label[cell] as number] = 1;
  landParts.first.forEach((first, part) => {
    if (seeded[part] === 0) chosen.push(first);
  });
  chosen.sort((a, b) => a - b);
  const { owner } = travelField(costField, chosen);
  const regionOf = new Int32Array(count).fill(-1);
  const regionCells = new Array<number>(chosen.length).fill(0);
  const regionArea = new Array<number>(chosen.length).fill(0);
  for (const cell of landCells) {
    const region = owner[cell] as number;
    if (region < 0) throw new Error(`generator defect: land cell ${cell} was not assigned a region`);
    regionOf[cell] = region;
    regionCells[region] = (regionCells[region] as number) + 1;
    regionArea[region] = (regionArea[region] as number) + (landAreaHa[cell] as number);
  }

  const landmassOf = new Int32Array(count).fill(-1);
  for (const cell of landCells) landmassOf[cell] = landParts.label[cell] as number;
  const waterBodyOf = new Int32Array(count).fill(-1);
  for (let cell = 0; cell < count; cell += 1)
    if (land[cell] === 0) waterBodyOf[cell] = waterParts.label[cell] as number;
  const idScope = (cell: number) => cellColRow(params, cell);

  const document: UnhashedWorldMap = {
    schemaVersion: 1,
    worldId: worldId as WorldMap["worldId"],
    seed,
    generator: { id: MAP_GENERATOR.id, version: MAP_GENERATOR.version },
    params: { ...params },
    mapVersion: mapVersionOf(params),
    grid: { layout: MAP_GRID_LAYOUT, width, height, cellSpacingM, rowSpacingM, cellAreaM2 },
    projection: {
      kind: MAP_PROJECTION_KIND,
      topLatitudeMicroDeg: params.topLatitudeMicroDeg,
      metresPerDegreeLatitude: METRES_PER_DEGREE_LATITUDE,
    },
    legend: {
      terrain: [...TERRAIN_TYPES],
      biome: [...BIOMES],
      climateClass: [...CLIMATE_CLASSES],
      climateBand: [...CLIMATE_BANDS],
      mineral: [...MINERALS],
    },
    units: { ...CELL_LAYER_UNITS },
    depositUnit: DEPOSIT_UNIT,
    rows: { latitudeMicroDeg: latitude, climateBand: climateBandRow },
    cells: {
      elevationM: Array.from(elevation),
      terrain: Array.from(terrain),
      biome: Array.from(biome),
      climateClass: Array.from(climate),
      temperatureDeciC: Array.from(temperature),
      precipitationMm: Array.from(precipitation),
      flags: Array.from(flags),
      landmass: Array.from(landmassOf),
      region: Array.from(regionOf),
      waterBody: Array.from(waterBodyOf),
      flowTo: Array.from(flowTo),
      dischargeM3PerYear: Array.from(discharge, (value, cell) => (ocean[cell] === 1 ? 0 : value)),
      landAreaHa: Array.from(landAreaHa),
      forestHa: Array.from(forestHa),
      grasslandHa: Array.from(grasslandHa),
      wetlandHa: Array.from(wetlandHa),
      barrenHa: Array.from(barrenHa),
      arablePotentialHa: Array.from(arableHa),
      timberStockM3: Array.from(timber),
      runoffM3PerYear: Array.from(runoff),
      fishKgPerYear: Array.from(fish),
      floodPpm: Array.from(flood),
      droughtPpm: Array.from(drought),
      seismicPpm: Array.from(seismic),
      wildfirePpm: Array.from(wildfire),
    },
    deposits,
    landmasses: landParts.first.map((firstCell, part) => ({ firstCell, cellCount: landParts.sizes[part] as number })),
    regions: chosen.map((seedCell, region) => ({
      regionId: deriveId("region", worldId, ...idScope(seedCell)) as WorldMap["regions"][number]["regionId"],
      seedCell,
      landmass: landParts.label[seedCell] as number,
      cellCount: regionCells[region] as number,
      landAreaHa: regionArea[region] as number,
    })),
    waterBodies: waterParts.first.map((firstCell, body) => ({
      waterBodyId: deriveId(
        "waterBody",
        worldId,
        ...idScope(firstCell),
      ) as WorldMap["waterBodies"][number]["waterBodyId"],
      kind: body === waterParts.label[0] ? ("ocean" as const) : ("lake" as const),
      firstCell,
      cellCount: waterParts.sizes[body] as number,
      surfaceElevationM: body === waterParts.label[0] ? 0 : (filled[firstCell] as number),
    })),
  };
  const map: WorldMap = { ...document, mapHash: canonicalHash(document) };
  assertValidWorldMap(map);
  return map;
}
