import { BIOMES, CELL_FLAGS, TERRAIN_TYPES, type Biome, type TerrainType, type WorldMap } from "@civ/contracts";
import { assertCell, axialOf, topologyFor } from "./grid.js";
import { CellHeap } from "./heap.js";

/**
 * Travel profiles: how long a traveller takes to cross terrain. All costs are
 * integer minutes. Profiles are data, so technology phases can add new ones
 * (roads, pack animals, ships) without changing the search.
 */
export interface TravelProfile {
  readonly id: string;
  /** Minutes per km by terrain; null means impassable for this profile. */
  readonly terrainMinutesPerKm: Readonly<Record<TerrainType, number | null>>;
  /** Percentage multiplier by biome (100 = unchanged); missing biomes are 100. */
  readonly biomePercent: Readonly<Partial<Record<Biome, number>>>;
  /** Fording a river cell: half is paid entering it, half leaving it. */
  readonly riverCrossingMinutes: number;
  /** Changing between a land and a water cell (embark/disembark). */
  readonly transferMinutes: number;
}

/**
 * Walking with light loads (12 min/km ≈ 5 km/h on open plains). Uncalibrated
 * defaults; calibrated with sources in Phase 11 (generator/profile version).
 */
export const FOOT_TRAVEL: TravelProfile = Object.freeze({
  id: "foot",
  terrainMinutesPerKm: Object.freeze({
    deep_ocean: null,
    shelf_sea: null,
    lake: null,
    plains: 12,
    hills: 20,
    mountains: 36,
    high_mountains: 90,
  }),
  biomePercent: Object.freeze({
    boreal_forest: 140,
    temperate_forest: 130,
    mediterranean_woodland: 115,
    wetland: 200,
    desert: 120,
    glacier: 250,
    alpine_tundra: 110,
  }),
  riverCrossingMinutes: 60,
  transferMinutes: 0,
});

/** Walking plus small craft on lakes and coastal seas (8 min/km ≈ 7.5 km/h). Uncalibrated defaults. */
export const FOOT_AND_BOAT_TRAVEL: TravelProfile = Object.freeze({
  id: "foot_and_boat",
  terrainMinutesPerKm: Object.freeze({
    deep_ocean: 12,
    shelf_sea: 8,
    lake: 8,
    plains: 12,
    hills: 20,
    mountains: 36,
    high_mountains: 90,
  }),
  biomePercent: FOOT_TRAVEL.biomePercent,
  riverCrossingMinutes: 60,
  transferMinutes: 120,
});

export const TRAVEL_PROFILES = Object.freeze([FOOT_TRAVEL, FOOT_AND_BOAT_TRAVEL]);

export function assertTravelProfile(profile: TravelProfile): void {
  const ok = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000;
  for (const terrain of TERRAIN_TYPES) {
    const cost = profile.terrainMinutesPerKm[terrain];
    if (cost !== null && (!ok(cost) || cost === 0)) throw new RangeError(`${profile.id}: bad cost for ${terrain}`);
  }
  for (const [biome, percent] of Object.entries(profile.biomePercent)) {
    if (!(BIOMES as readonly string[]).includes(biome) || percent === undefined || !ok(percent) || percent === 0) {
      throw new RangeError(`${profile.id}: bad biome multiplier for ${biome}`);
    }
  }
  if (!ok(profile.riverCrossingMinutes) || !ok(profile.transferMinutes)) {
    throw new RangeError(`${profile.id}: crossing and transfer minutes must be integers in [0, 100000]`);
  }
}

/** Per-cell inputs to the edge cost; −1 minutes per km = impassable. */
export interface CostField {
  readonly width: number;
  readonly height: number;
  readonly cellSpacingM: number;
  readonly minutesPerKm: Int32Array;
  readonly crossing: Int32Array;
  readonly water: Uint8Array;
  readonly transferMinutes: number;
  /** Smallest passable minutes per km (for the A* bound). */
  readonly minMinutesPerKm: number;
}

export function costFieldFromLayers(
  shape: { width: number; height: number; cellSpacingM: number },
  layers: { terrain: ArrayLike<number>; biome: ArrayLike<number>; flags: ArrayLike<number> },
  profile: TravelProfile,
): CostField {
  assertTravelProfile(profile);
  const count = shape.width * shape.height;
  const minutesPerKm = new Int32Array(count);
  const crossing = new Int32Array(count);
  const water = new Uint8Array(count);
  let minMinutesPerKm = Number.MAX_SAFE_INTEGER;
  for (let cell = 0; cell < count; cell += 1) {
    const terrain = TERRAIN_TYPES[layers.terrain[cell] as number] as TerrainType;
    const biome = BIOMES[layers.biome[cell] as number] as Biome;
    const flags = layers.flags[cell] as number;
    const base = profile.terrainMinutesPerKm[terrain];
    water[cell] = (flags & CELL_FLAGS.water) !== 0 ? 1 : 0;
    if (base === null) {
      minutesPerKm[cell] = -1;
      continue;
    }
    const percent = profile.biomePercent[biome] ?? 100;
    const cost = Math.max(1, Math.floor((base * percent + 50) / 100));
    minutesPerKm[cell] = cost;
    if (cost < minMinutesPerKm) minMinutesPerKm = cost;
    if ((flags & CELL_FLAGS.river) !== 0) crossing[cell] = profile.riverCrossingMinutes;
  }
  return {
    width: shape.width,
    height: shape.height,
    cellSpacingM: shape.cellSpacingM,
    minutesPerKm,
    crossing,
    water,
    transferMinutes: profile.transferMinutes,
    minMinutesPerKm: minMinutesPerKm === Number.MAX_SAFE_INTEGER ? 0 : minMinutesPerKm,
  };
}

export function costFieldFor(map: WorldMap, profile: TravelProfile): CostField {
  return costFieldFromLayers(map.grid, map.cells, profile);
}

/**
 * Minutes to move between adjacent cells: the mean of both cells' per-km
 * cost over the centre distance, half of each cell's river crossing, and a
 * transfer when one side is water. Symmetric by construction; −1 if either
 * cell is impassable.
 */
export function edgeMinutes(field: CostField, a: number, b: number): number {
  const ca = field.minutesPerKm[a] as number;
  const cb = field.minutesPerKm[b] as number;
  if (ca < 0 || cb < 0) return -1;
  const transfer = field.water[a] !== field.water[b] ? field.transferMinutes : 0;
  const numerator =
    (ca + cb) * field.cellSpacingM +
    ((field.crossing[a] as number) + (field.crossing[b] as number)) * 1_000 +
    transfer * 2_000;
  return Math.max(1, Math.ceil(numerator / 2_000));
}

export interface Route {
  readonly costMinutes: number;
  /** Cell indices from origin to destination inclusive. */
  readonly path: readonly number[];
  /** Centre-to-centre path length. */
  readonly distanceM: number;
}

/**
 * Cheapest route between two cells (A* with an admissible, consistent bound:
 * remaining grid steps × the cheapest possible step). Returns null when the
 * destination is unreachable or costs more than `maxMinutes`.
 */
export function findRoute(
  field: CostField,
  from: number,
  to: number,
  options: { readonly maxMinutes?: number } = {},
): Route | null {
  assertCell(field, from);
  assertCell(field, to);
  const limit = options.maxMinutes ?? Number.MAX_SAFE_INTEGER;
  if ((field.minutesPerKm[from] as number) < 0 || (field.minutesPerKm[to] as number) < 0) return null;
  if (from === to) return { costMinutes: 0, path: [from], distanceM: 0 };
  const { neighbours, cellCount } = topologyFor(field);
  const stepBound = Math.max(1, Math.ceil((field.minMinutesPerKm * field.cellSpacingM) / 1_000));
  const [tq, tr] = axialOf(field, to);
  const heuristic = (cell: number) => {
    const [q, r] = axialOf(field, cell);
    const dq = q - tq;
    const dr = r - tr;
    return ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2) * stepBound;
  };
  const best = new Float64Array(cellCount).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(cellCount).fill(-1);
  const closed = new Uint8Array(cellCount);
  const heap = new CellHeap();
  best[from] = 0;
  heap.push(heuristic(from), from);
  while (heap.size > 0) {
    const [, cell] = heap.pop();
    if (closed[cell] === 1) continue;
    closed[cell] = 1;
    const cost = best[cell] as number;
    if (cell === to) break;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next < 0 || closed[next] === 1) continue;
      const step = edgeMinutes(field, cell, next);
      if (step < 0) continue;
      const candidate = cost + step;
      if (candidate > limit || candidate >= (best[next] as number)) continue;
      best[next] = candidate;
      previous[next] = cell;
      heap.push(candidate + heuristic(next), next);
    }
  }
  if (closed[to] !== 1) return null;
  const path: number[] = [];
  for (let cell = to; cell !== -1; cell = previous[cell] as number) path.push(cell);
  path.reverse();
  return { costMinutes: best[to] as number, path, distanceM: (path.length - 1) * field.cellSpacingM };
}

/**
 * Travel time from the nearest of `sources` to every cell (multi-source
 * Dijkstra), −1 where unreachable or beyond `maxMinutes`. `owner` gives the
 * index into `sources` of the source each cell was reached from. A cell takes
 * the owner of the first strictly cheaper relaxation; relaxations happen in heap
 * pop order (cost, then cell index) and fixed neighbour order, so ties are
 * deterministic: the earlier-settled neighbour wins.
 */
export function travelField(
  field: CostField,
  sources: readonly number[],
  options: { readonly maxMinutes?: number } = {},
): { readonly minutes: Float64Array; readonly owner: Int32Array } {
  const limit = options.maxMinutes ?? Number.MAX_SAFE_INTEGER;
  const { neighbours, cellCount } = topologyFor(field);
  const best = new Float64Array(cellCount).fill(Number.POSITIVE_INFINITY);
  const owner = new Int32Array(cellCount).fill(-1);
  const closed = new Uint8Array(cellCount);
  const heap = new CellHeap();
  sources.forEach((source, index) => {
    assertCell(field, source);
    if ((field.minutesPerKm[source] as number) < 0 || best[source] === 0) return;
    best[source] = 0;
    owner[source] = index;
    heap.push(0, source);
  });
  while (heap.size > 0) {
    const [, cell] = heap.pop();
    if (closed[cell] === 1) continue;
    closed[cell] = 1;
    const cost = best[cell] as number;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      if (next < 0 || closed[next] === 1) continue;
      const step = edgeMinutes(field, cell, next);
      if (step < 0) continue;
      const candidate = cost + step;
      if (candidate > limit || candidate >= (best[next] as number)) continue;
      best[next] = candidate;
      owner[next] = owner[cell] as number;
      heap.push(candidate, next);
    }
  }
  const minutes = new Float64Array(cellCount);
  for (let cell = 0; cell < cellCount; cell += 1) minutes[cell] = closed[cell] === 1 ? (best[cell] as number) : -1;
  return { minutes, owner };
}
