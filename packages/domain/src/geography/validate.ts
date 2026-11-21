import {
  BIOMES,
  CELL_FLAGS,
  CLIMATE_BANDS,
  CLIMATE_CLASSES,
  METRES_PER_DEGREE_LATITUDE,
  MINERALS,
  TERRAIN_TYPES,
  worldMapSchema,
  type Biome,
  type Mineral,
  type TerrainType,
  type WorldMap,
} from "@civ/contracts";
import { canonicalHash } from "../hash.js";
import { mulDiv } from "../units.js";
import { climateBandOf, FISH_KG_PER_HA, landformOf, RIVER_FISH_M3_PER_KG } from "./classify.js";
import { cellAreaFor, cellColRow, rowSpacingFor, topologyFor } from "./grid.js";

/**
 * Semantic map validation (docs/GEOGRAPHY.md § Validation). Checks
 * everything the generator promises: structure, hash and version, water/land
 * consistency, drainage, the connectedness policy, region partition and
 * resource/hazard bounds. Never trusts derived counts in the document.
 */
export interface MapStats {
  readonly cells: number;
  readonly landCells: number;
  readonly oceanCells: number;
  readonly lakeCells: number;
  readonly riverCells: number;
  readonly coastCells: number;
  readonly landFractionPpm: number;
  readonly landmasses: number;
  readonly largestLandmassPpm: number;
  readonly lakes: number;
  readonly regions: number;
  readonly minRegionCells: number;
  readonly maxRegionCells: number;
  readonly elevationMinM: number;
  readonly elevationMaxM: number;
  readonly terrainCells: Readonly<Record<TerrainType, number>>;
  readonly biomeCells: Readonly<Record<Biome, number>>;
  readonly deposits: Readonly<Record<Mineral, { readonly count: number; readonly totalT: number }>>;
}

export interface MapValidationReport {
  readonly ok: boolean;
  /** First issues found (at most 50) and the total count. */
  readonly issues: readonly string[];
  readonly issueCount: number;
  readonly stats: MapStats | null;
}

export class MapValidationError extends Error {
  readonly report: MapValidationReport;
  constructor(report: MapValidationReport) {
    super(`invalid world map (${report.issueCount} issues): ${report.issues.slice(0, 5).join("; ")}`);
    this.name = "MapValidationError";
    this.report = report;
  }
}

const WATER_TERRAIN = new Set(["deep_ocean", "shelf_sea", "lake"]);
const LAND_LAYERS = [
  "landAreaHa",
  "forestHa",
  "grasslandHa",
  "wetlandHa",
  "barrenHa",
  "arablePotentialHa",
  "timberStockM3",
  "floodPpm",
  "droughtPpm",
  "seismicPpm",
  "wildfirePpm",
] as const;
/** Layers bounded so that sums over a maximum-size map stay exact (< 2^53). */
const QUANTITY_LAYERS = ["dischargeM3PerYear", "runoffM3PerYear", "fishKgPerYear", "timberStockM3"] as const;
const MAX_QUANTITY = 1_000_000_000_000_000;
const HAZARD_LAYERS = ["floodPpm", "droughtPpm", "seismicPpm", "wildfirePpm"] as const;
const MAX_TIMBER_M3_PER_HA = 400;
/**
 * Allowed deviation of the land share from the requested interior fraction.
 * Empirical envelope: island submersion and depression lakes remove a few
 * per cent; the property test and the 340-map sweep (Phase 04 report) stay
 * well inside it. A larger deviation means the generator misbehaved.
 */
export const LAND_FRACTION_TOLERANCE_PPM = 150_000;

export function validateWorldMap(input: unknown): MapValidationReport {
  const issues: string[] = [];
  let issueCount = 0;
  const issue = (message: string) => {
    issueCount += 1;
    if (issues.length < 50) issues.push(message);
  };
  const parsed = worldMapSchema.safeParse(input);
  if (!parsed.success) {
    for (const problem of parsed.error.issues) issue(`${problem.path.join(".")}: ${problem.message}`);
    return { ok: false, issues, issueCount, stats: null };
  }
  const map = parsed.data;
  const { grid, params, cells } = map;
  const { width, height } = grid;
  const count = width * height;
  const { neighbours } = topologyFor(grid);

  // Hash and version.
  const { mapHash, ...unhashed } = map;
  if (canonicalHash(unhashed) !== mapHash) issue("mapHash does not match the document");
  if (canonicalHash({ generator: map.generator, params }) !== map.mapVersion) {
    issue("mapVersion does not match generator and params");
  }

  // Grid and projection.
  if (grid.cellSpacingM !== params.cellSpacingM) issue("grid spacing differs from params");
  if (grid.rowSpacingM !== rowSpacingFor(grid.cellSpacingM)) issue("rowSpacingM is not spacing × √3/2");
  if (grid.cellAreaM2 !== cellAreaFor(grid.cellSpacingM)) issue("cellAreaM2 is not spacing² × √3/2");
  if (map.projection.topLatitudeMicroDeg !== params.topLatitudeMicroDeg)
    issue("projection latitude differs from params");
  for (let row = 0; row < height; row += 1) {
    const expected =
      params.topLatitudeMicroDeg - mulDiv(row * grid.rowSpacingM, 1_000_000, METRES_PER_DEGREE_LATITUDE, "half_even");
    const latitude = map.rows.latitudeMicroDeg[row] as number;
    if (latitude !== expected) issue(`row ${row}: latitude ${latitude} ≠ ${expected}`);
    if (latitude < -90_000_000 || latitude > 90_000_000) issue(`row ${row}: impossible latitude ${latitude}`);
    const band = map.rows.climateBand[row] as number;
    if (band < 0 || band >= CLIMATE_BANDS.length) issue(`row ${row}: climate band ${band} out of range`);
    else if (band !== climateBandOf(latitude)) issue(`row ${row}: climate band disagrees with its latitude`);
  }

  // Codes.
  const codeCheck = (layer: "terrain" | "biome" | "climateClass", size: number) => {
    for (let cell = 0; cell < count; cell += 1) {
      const value = cells[layer][cell] as number;
      if (value < 0 || value >= size) issue(`cell ${cell}: ${layer} code ${value} out of range`);
    }
  };
  codeCheck("terrain", TERRAIN_TYPES.length);
  codeCheck("biome", BIOMES.length);
  codeCheck("climateClass", CLIMATE_CLASSES.length);
  if (issueCount > 0) return { ok: false, issues, issueCount, stats: null };

  const isWater = new Uint8Array(count);
  const isOcean = new Uint8Array(count);
  const cellAreaHa = mulDiv(grid.cellAreaM2, 1, 10_000, "half_even");
  let elevationMin = Number.POSITIVE_INFINITY;
  let elevationMax = Number.NEGATIVE_INFINITY;
  const terrainCells = Object.fromEntries(TERRAIN_TYPES.map((value) => [value, 0])) as Record<TerrainType, number>;
  const biomeCells = Object.fromEntries(BIOMES.map((value) => [value, 0])) as Record<Biome, number>;
  let riverCells = 0;
  let coastCells = 0;

  // Water/land consistency, value bounds and resources, cell by cell.
  for (let cell = 0; cell < count; cell += 1) {
    const terrain = TERRAIN_TYPES[cells.terrain[cell] as number] as TerrainType;
    const biome = BIOMES[cells.biome[cell] as number] as Biome;
    const flags = cells.flags[cell] as number;
    const elevation = cells.elevationM[cell] as number;
    terrainCells[terrain] += 1;
    biomeCells[biome] += 1;
    elevationMin = Math.min(elevationMin, elevation);
    elevationMax = Math.max(elevationMax, elevation);
    const water = WATER_TERRAIN.has(terrain);
    isWater[cell] = water ? 1 : 0;
    isOcean[cell] = terrain === "deep_ocean" || terrain === "shelf_sea" ? 1 : 0;
    if (flags < 0 || flags > 7) issue(`cell ${cell}: flags ${flags} out of range`);
    if (((flags & CELL_FLAGS.water) !== 0) !== water)
      issue(`cell ${cell}: water flag disagrees with terrain ${terrain}`);
    if ((biome === "ocean") !== (isOcean[cell] === 1) || (biome === "lake") !== (terrain === "lake")) {
      issue(`cell ${cell}: biome ${biome} disagrees with terrain ${terrain}`);
    }
    if (elevation < -params.maxDepthM - 1 || elevation > params.maxElevationM + 1) {
      issue(`cell ${cell}: elevation ${elevation} m outside the generator range`);
    }
    if (isOcean[cell] === 1 && elevation > -1) issue(`cell ${cell}: sea cell at ${elevation} m is not below sea level`);
    if (terrain === "deep_ocean" && elevation >= -200) issue(`cell ${cell}: deep ocean shallower than 200 m`);
    if (terrain === "shelf_sea" && elevation < -200) issue(`cell ${cell}: shelf sea deeper than 200 m`);
    if (!isOcean[cell] && elevation < 1)
      issue(`cell ${cell}: land or lake surface at ${elevation} m is not above sea level`);
    const [col, row] = cellColRow(grid, cell);
    if ((col === 0 || row === 0 || col === width - 1 || row === height - 1) && isOcean[cell] !== 1) {
      issue(`cell ${cell}: map border must be ocean`);
    }
    const temperature = cells.temperatureDeciC[cell] as number;
    const precipitation = cells.precipitationMm[cell] as number;
    if (temperature < -900 || temperature > 600) issue(`cell ${cell}: temperature ${temperature} out of bounds`);
    if (precipitation < 0 || precipitation > 20_000)
      issue(`cell ${cell}: precipitation ${precipitation} out of bounds`);
    for (const layer of QUANTITY_LAYERS) {
      const value = cells[layer][cell] as number;
      if (value < 0 || value > MAX_QUANTITY) issue(`cell ${cell}: ${layer} ${value} outside [0, ${MAX_QUANTITY}]`);
    }
    const fish = cells.fishKgPerYear[cell] as number;
    const fishBound = water
      ? cellAreaHa * (FISH_KG_PER_HA[terrain] ?? 0)
      : Math.floor((cells.dischargeM3PerYear[cell] as number) / RIVER_FISH_M3_PER_KG);
    if (fish > fishBound) issue(`cell ${cell}: fish yield ${fish} kg exceeds its bound ${fishBound} kg`);
    if ((flags & CELL_FLAGS.river) !== 0) {
      riverCells += 1;
      if (water) issue(`cell ${cell}: river flag on a water cell`);
    }
    let touchesWater = false;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && WATER_TERRAIN.has(TERRAIN_TYPES[cells.terrain[next] as number] as string)) touchesWater = true;
    }
    if (((flags & CELL_FLAGS.coast) !== 0) !== (!water && touchesWater)) issue(`cell ${cell}: coast flag is wrong`);
    if ((flags & CELL_FLAGS.coast) !== 0) coastCells += 1;
    if (water) {
      for (const layer of LAND_LAYERS) {
        if (cells[layer][cell] !== 0) issue(`cell ${cell}: water cell has non-zero ${layer}`);
      }
      continue;
    }
    for (const layer of LAND_LAYERS) {
      if ((cells[layer][cell] as number) < 0) issue(`cell ${cell}: ${layer} is negative`);
    }
    let relief = 0;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      const nextTerrain = next >= 0 ? (TERRAIN_TYPES[cells.terrain[next] as number] as string) : "deep_ocean";
      if (next >= 0 && nextTerrain !== "deep_ocean" && nextTerrain !== "shelf_sea") {
        relief = Math.max(relief, Math.abs(elevation - (cells.elevationM[next] as number)));
      }
    }
    if (cells.terrain[cell] !== landformOf(elevation, relief)) {
      issue(`cell ${cell}: terrain ${terrain} disagrees with elevation ${elevation} m and relief ${relief} m`);
    }
    const area = cells.landAreaHa[cell] as number;
    if (area !== cellAreaHa) issue(`cell ${cell}: land area ${area} ha ≠ cell area ${cellAreaHa} ha`);
    const forest = cells.forestHa[cell] as number;
    const grass = cells.grasslandHa[cell] as number;
    const cover = forest + grass + (cells.wetlandHa[cell] as number) + (cells.barrenHa[cell] as number);
    if (cover !== area) issue(`cell ${cell}: land cover sums to ${cover} ha, not ${area} ha`);
    if ((cells.arablePotentialHa[cell] as number) > forest + grass)
      issue(`cell ${cell}: arable potential exceeds vegetated land`);
    if ((cells.timberStockM3[cell] as number) > forest * MAX_TIMBER_M3_PER_HA)
      issue(`cell ${cell}: timber exceeds forest bound`);
    for (const layer of HAZARD_LAYERS) {
      if ((cells[layer][cell] as number) > 1_000_000) issue(`cell ${cell}: ${layer} exceeds 1,000,000 ppm`);
    }
  }

  // Water bodies: contiguous, one ocean containing the whole border, lakes elsewhere.
  const oceanBodies = map.waterBodies.filter((body) => body.kind === "ocean");
  if (oceanBodies.length !== 1) issue(`expected exactly one ocean, found ${oceanBodies.length}`);
  const bodyCells = labelCheck(
    "waterBody",
    cells.waterBody,
    isWater,
    map.waterBodies.length,
    neighbours,
    map.waterBodies.map((body) => body.firstCell),
    issue,
  );
  map.waterBodies.forEach((body, index) => {
    if (bodyCells[index] !== body.cellCount)
      issue(`water body ${index}: cellCount ${body.cellCount} ≠ ${bodyCells[index]}`);
    const kind = isOcean[body.firstCell] === 1 ? "ocean" : "lake";
    if (body.kind !== kind) issue(`water body ${index}: kind ${body.kind} disagrees with its terrain`);
    if (body.kind === "ocean" && body.surfaceElevationM !== 0) issue("the ocean surface must be at 0 m");
    if (body.kind === "lake" && body.surfaceElevationM !== cells.elevationM[body.firstCell]) {
      issue(`water body ${index}: lake surface disagrees with its cells`);
    }
  });
  for (let cell = 0; cell < count; cell += 1) {
    if (isWater[cell] !== 1) continue;
    const body = map.waterBodies[cells.waterBody[cell] as number];
    if (body !== undefined && body.kind === "lake" && cells.elevationM[cell] !== body.surfaceElevationM) {
      issue(`cell ${cell}: lake cell elevation is not the lake surface`);
    }
  }

  // Landmasses: connected land components in first-cell order, each above the
  // minimum size and bordering the ocean.
  const isLand = isWater.map((value) => (value === 1 ? 0 : 1));
  const landmassCells = labelCheck(
    "landmass",
    cells.landmass,
    isLand,
    map.landmasses.length,
    neighbours,
    map.landmasses.map((landmass) => landmass.firstCell),
    issue,
  );
  const bordersOcean = new Uint8Array(map.landmasses.length);
  for (let cell = 0; cell < count; cell += 1) {
    const landmass = cells.landmass[cell] as number;
    if (landmass < 0 || landmass >= map.landmasses.length) continue;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next >= 0 && isOcean[next] === 1) bordersOcean[landmass] = 1;
    }
  }
  map.landmasses.forEach((landmass, index) => {
    if (landmassCells[index] !== landmass.cellCount) issue(`landmass ${index}: cellCount is wrong`);
    if (landmass.cellCount < params.minLandmassCells) issue(`landmass ${index}: smaller than minLandmassCells`);
    if (bordersOcean[index] !== 1) issue(`landmass ${index}: does not border the ocean`);
  });

  // Regions: a partition of land into contiguous parts, each on one landmass.
  const regionCells = labelCheck(
    "region",
    cells.region,
    isLand,
    map.regions.length,
    neighbours,
    map.regions.map((region) => region.seedCell),
    issue,
    false,
  );
  const regionArea = new Array<number>(map.regions.length).fill(0);
  for (let cell = 0; cell < count; cell += 1) {
    const region = cells.region[cell] as number;
    if (region < 0 || region >= map.regions.length) continue;
    regionArea[region] = (regionArea[region] as number) + (cells.landAreaHa[cell] as number);
    if (cells.landmass[cell] !== map.regions[region]?.landmass) issue(`cell ${cell}: region spans another landmass`);
  }
  const regionIds = new Set<string>();
  const landmassHasRegion = new Uint8Array(map.landmasses.length);
  map.regions.forEach((region, index) => {
    if (regionIds.has(region.regionId)) issue(`region ${index}: duplicate ID ${region.regionId}`);
    regionIds.add(region.regionId);
    if (regionCells[index] !== region.cellCount)
      issue(`region ${index}: cellCount ${region.cellCount} ≠ ${regionCells[index]}`);
    if (regionArea[index] !== region.landAreaHa) issue(`region ${index}: landAreaHa is wrong`);
    if (region.landmass >= map.landmasses.length) issue(`region ${index}: landmass out of range`);
    else landmassHasRegion[region.landmass] = 1;
    if (index > 0 && region.seedCell <= (map.regions[index - 1]?.seedCell ?? -1))
      issue("regions must be ordered by seed cell");
  });
  landmassHasRegion.forEach((value, index) => {
    if (value !== 1) issue(`landmass ${index}: has no region`);
  });

  // Drainage: receivers are neighbours, every path reaches the ocean without
  // cycles, and discharge is conserved (own runoff + all inflow).
  const inflow = new Float64Array(count);
  const state = new Uint8Array(count);
  for (let cell = 0; cell < count; cell += 1) {
    const receiver = cells.flowTo[cell] as number;
    if (isOcean[cell] === 1) {
      if (receiver !== -1) issue(`cell ${cell}: ocean cell has a receiver`);
      if (cells.dischargeM3PerYear[cell] !== 0) issue(`cell ${cell}: ocean cell has discharge`);
      state[cell] = 2;
      continue;
    }
    let adjacent = false;
    for (let direction = 0; direction < 6; direction += 1) {
      if (neighbours[cell * 6 + direction] === receiver) adjacent = true;
    }
    if (!adjacent) {
      issue(`cell ${cell}: receiver ${receiver} is not a neighbour`);
      continue;
    }
    if (isOcean[receiver] !== 1)
      inflow[receiver] = (inflow[receiver] as number) + (cells.dischargeM3PerYear[cell] as number);
  }
  if (issueCount === 0) {
    for (let start = 0; start < count; start += 1) {
      if (state[start] === 2) continue;
      const path: number[] = [];
      let cell = start;
      while (state[cell] === 0) {
        state[cell] = 1;
        path.push(cell);
        cell = cells.flowTo[cell] as number;
      }
      if (state[cell] === 1) {
        issue(`cell ${start}: drainage cycle`);
        break;
      }
      for (const done of path) state[done] = 2;
    }
  }
  for (let cell = 0; cell < count; cell += 1) {
    if (isOcean[cell] === 1) continue;
    const expected = (cells.runoffM3PerYear[cell] as number) + (inflow[cell] as number);
    if (cells.dischargeM3PerYear[cell] !== expected) issue(`cell ${cell}: discharge is not runoff plus inflow`);
    const river = ((cells.flags[cell] as number) & CELL_FLAGS.river) !== 0;
    const shouldBe =
      isWater[cell] === 0 && (cells.dischargeM3PerYear[cell] as number) >= params.riverMinDischargeM3PerYear;
    if (river !== shouldBe) issue(`cell ${cell}: river flag disagrees with discharge`);
  }

  // Deposits: on land, valid mineral, unique and ordered.
  const deposits = Object.fromEntries(MINERALS.map((value) => [value, { count: 0, totalT: 0 }])) as Record<
    Mineral,
    { count: number; totalT: number }
  >;
  let previous = -1;
  for (const deposit of map.deposits) {
    const key = deposit.cell * MINERALS.length + deposit.mineral;
    if (deposit.cell >= count) issue(`deposit at impossible cell ${deposit.cell}`);
    else if (isWater[deposit.cell] === 1) issue(`deposit at water cell ${deposit.cell}`);
    if (deposit.mineral >= MINERALS.length) issue(`deposit mineral ${deposit.mineral} out of range`);
    if (key <= previous) issue("deposits must be unique and ordered by cell, then mineral");
    previous = key;
    const mineral = MINERALS[deposit.mineral];
    if (mineral !== undefined) {
      deposits[mineral].count += 1;
      deposits[mineral].totalT += deposit.amountT;
    }
  }

  const landCells = count - terrainCells.deep_ocean - terrainCells.shelf_sea - terrainCells.lake;
  const interiorCells = (width - 2) * (height - 2);
  const landFractionPpm = Math.floor((landCells * 1_000_000) / interiorCells);
  if (Math.abs(landFractionPpm - params.landFractionPpm) > LAND_FRACTION_TOLERANCE_PPM) {
    issue(`land fraction ${landFractionPpm} ppm is far from the requested ${params.landFractionPpm} ppm`);
  }
  if (landCells === 0) issue("the map has no land");
  const largest = map.landmasses.reduce((max, landmass) => Math.max(max, landmass.cellCount), 0);
  const stats: MapStats = {
    cells: count,
    landCells,
    oceanCells: terrainCells.deep_ocean + terrainCells.shelf_sea,
    lakeCells: terrainCells.lake,
    riverCells,
    coastCells,
    landFractionPpm,
    landmasses: map.landmasses.length,
    largestLandmassPpm: landCells === 0 ? 0 : Math.floor((largest * 1_000_000) / landCells),
    lakes: map.waterBodies.length - oceanBodies.length,
    regions: map.regions.length,
    minRegionCells: map.regions.reduce((min, region) => Math.min(min, region.cellCount), Number.MAX_SAFE_INTEGER),
    maxRegionCells: map.regions.reduce((max, region) => Math.max(max, region.cellCount), 0),
    elevationMinM: elevationMin,
    elevationMaxM: elevationMax,
    terrainCells,
    biomeCells,
    deposits,
  };
  return { ok: issueCount === 0, issues, issueCount, stats };
}

/**
 * Check a label layer: members carry a valid label, others −1; each label's
 * cells are contiguous and include its anchor. With `componentLabels`, labels
 * must also be whole connected components in anchor (first cell) order.
 * Returns the cell count per label.
 */
function labelCheck(
  name: string,
  labels: readonly number[],
  member: Uint8Array,
  size: number,
  neighbours: Int32Array,
  anchors: readonly number[],
  issue: (message: string) => void,
  componentLabels = true,
): number[] {
  const counts = new Array<number>(size).fill(0);
  const count = labels.length;
  for (let cell = 0; cell < count; cell += 1) {
    const label = labels[cell] as number;
    if (member[cell] === 1) {
      if (label < 0 || label >= size) issue(`cell ${cell}: ${name} ${label} out of range`);
      else counts[label] = (counts[label] as number) + 1;
    } else if (label !== -1) issue(`cell ${cell}: ${name} must be -1`);
  }
  const reached = new Uint8Array(count);
  const queue = new Int32Array(count);
  anchors.forEach((anchor, label) => {
    if (anchor < 0 || anchor >= count || labels[anchor] !== label) {
      issue(`${name} ${label}: anchor cell ${anchor} does not carry the label`);
      return;
    }
    if (componentLabels) {
      for (let cell = 0; cell < anchor; cell += 1) {
        if (labels[cell] === label) {
          issue(`${name} ${label}: anchor is not its first cell`);
          break;
        }
      }
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = anchor;
    reached[anchor] = 1;
    while (head < tail) {
      const cell = queue[head++] as number;
      for (let direction = 0; direction < 6; direction += 1) {
        const next = neighbours[cell * 6 + direction] as number;
        if (next < 0 || reached[next] === 1 || member[next] !== 1) continue;
        if (labels[next] === label) {
          reached[next] = 1;
          queue[tail++] = next;
        } else if (componentLabels) {
          issue(`${name} ${label}: touches ${name} ${labels[next]} (not a whole component)`);
        }
      }
    }
    if (tail !== counts[label]) issue(`${name} ${label}: not contiguous`);
  });
  return counts;
}

export function assertValidWorldMap(map: unknown): asserts map is WorldMap {
  const report = validateWorldMap(map);
  if (!report.ok) throw new MapValidationError(report);
}
