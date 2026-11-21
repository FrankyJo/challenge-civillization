import { BIOMES, CELL_FLAGS, TERRAIN_TYPES, type ContentPack, type WorldMap } from "@civ/contracts";
import { hexDistance, topologyFor } from "../geography/grid.js";
import { allocate } from "../units.js";

/**
 * Where cultures live and where people settle at 1 CE.
 *
 * Homelands: each culture claims a seed region that best matches its
 * preferred environments, then cultures grow in turn over region adjacency
 * towards region counts proportional to their seed shares. Regions no
 * culture reaches (islands) join the culture whose seed region is nearest.
 *
 * Settlements: land cells are scored by arable potential, fresh water and
 * coast, minus flood and drought risk; each culture takes its best cells in
 * its own regions, keeping a minimum grid spacing between all settlements.
 */
const FOREST = new Set(
  ["boreal_forest", "temperate_forest", "mediterranean_woodland", "wetland"].map((b) => BIOMES.indexOf(b as never)),
);
const GRASS = new Set(["temperate_grassland", "semi_desert"].map((b) => BIOMES.indexOf(b as never)));
const UNINHABITABLE = new Set([TERRAIN_TYPES.indexOf("high_mountains")]);
const GLACIER = BIOMES.indexOf("glacier");

/** Per-region environment shares (ppm of the region's cells). */
function regionEnvironment(map: WorldMap): Record<string, number>[] {
  const counts = map.regions.map(() => ({
    cells: 0,
    coast: 0,
    river: 0,
    lowland: 0,
    upland: 0,
    grassland: 0,
    forest: 0,
  }));
  map.cells.region.forEach((region, cell) => {
    const entry = counts[region];
    if (entry === undefined) return;
    const flags = map.cells.flags[cell] as number;
    const elevation = map.cells.elevationM[cell] as number;
    const biome = map.cells.biome[cell] as number;
    entry.cells += 1;
    if ((flags & CELL_FLAGS.coast) !== 0) entry.coast += 1;
    if ((flags & CELL_FLAGS.river) !== 0) entry.river += 1;
    if (elevation < 400) entry.lowland += 1;
    else entry.upland += 1;
    if (GRASS.has(biome)) entry.grassland += 1;
    if (FOREST.has(biome)) entry.forest += 1;
  });
  return counts.map(({ cells, ...shares }) =>
    Object.fromEntries(
      Object.entries(shares).map(([key, value]) => [key, Math.floor((value * 1_000_000) / Math.max(1, cells))]),
    ),
  );
}

function regionAdjacency(map: WorldMap): number[][] {
  const { neighbours } = topologyFor(map.grid);
  const adjacent = map.regions.map(() => new Set<number>());
  map.cells.region.forEach((region, cell) => {
    if (region < 0) return;
    for (let direction = 0; direction < 6; direction += 1) {
      const next = neighbours[cell * 6 + direction] as number;
      const other = next >= 0 ? (map.cells.region[next] as number) : -1;
      if (other >= 0 && other !== region) adjacent[region]?.add(other);
    }
  });
  return adjacent.map((set) => [...set].sort((a, b) => a - b));
}

/** Culture index of every region. */
export function assignHomelands(map: WorldMap, pack: ContentPack): number[] {
  const environment = regionEnvironment(map);
  const adjacency = regionAdjacency(map);
  const cultures = pack.cultures;
  const score = (culture: number, region: number) =>
    (cultures[culture]?.prefers ?? []).reduce(
      (total, preference, rank) => total + (environment[region]?.[preference] ?? 0) * (4 - rank),
      0,
    );
  const owner = new Array<number>(map.regions.length).fill(-1);
  const targets = allocate(
    map.regions.length,
    cultures.map((culture) => culture.seedSharePpm),
  );
  const claimed = new Array<number>(cultures.length).fill(0);
  const best = (candidates: Iterable<number>, culture: number) => {
    let choice = -1;
    let choiceScore = -1;
    for (const region of candidates) {
      if (owner[region] !== -1) continue;
      const value = score(culture, region);
      if (value > choiceScore || (value === choiceScore && region < choice)) {
        choice = region;
        choiceScore = value;
      }
    }
    return choice;
  };
  // Seeds: larger cultures choose first; ties by pack order.
  const order = cultures
    .map((culture, index) => ({ index, share: culture.seedSharePpm }))
    .sort((a, b) => b.share - a.share || a.index - b.index)
    .map((entry) => entry.index);
  const all = map.regions.map((_, region) => region);
  for (const culture of order) {
    const seed = best(all, culture);
    if (seed < 0) break;
    owner[seed] = culture;
    claimed[culture] = 1;
  }
  // Growth in turns over adjacency.
  for (let progress = true; progress;) {
    progress = false;
    for (const culture of order) {
      if ((claimed[culture] as number) >= (targets[culture] as number)) continue;
      const frontier = new Set<number>();
      owner.forEach((value, region) => {
        if (value === culture) for (const next of adjacency[region] ?? []) frontier.add(next);
      });
      const next = best(
        [...frontier].sort((a, b) => a - b),
        culture,
      );
      if (next < 0) continue;
      owner[next] = culture;
      claimed[culture] = (claimed[culture] as number) + 1;
      progress = true;
    }
  }
  // Anything left (targets met everywhere, or unreachable islands): nearest owned region's culture.
  for (let region = 0; region < owner.length; region += 1) {
    if (owner[region] !== -1) continue;
    let nearest = -1;
    let distance = Number.MAX_SAFE_INTEGER;
    owner.forEach((value, other) => {
      if (value < 0) return;
      const d = hexDistance(map.grid, map.regions[region]?.seedCell ?? 0, map.regions[other]?.seedCell ?? 0);
      if (d < distance || (d === distance && other < nearest)) {
        distance = d;
        nearest = other;
      }
    });
    owner[region] = nearest >= 0 ? (owner[nearest] as number) : 0;
  }
  return owner;
}

/** Settlement suitability of a land cell (higher is better); −1 if uninhabitable. */
export function settlementScore(map: WorldMap, cell: number): number {
  const c = map.cells;
  const flags = c.flags[cell] as number;
  if ((flags & CELL_FLAGS.water) !== 0 || UNINHABITABLE.has(c.terrain[cell] as number) || c.biome[cell] === GLACIER) {
    return -1;
  }
  const area = Math.max(1, c.landAreaHa[cell] as number);
  let score = Math.floor(((c.arablePotentialHa[cell] as number) * 1_000) / area);
  if ((flags & CELL_FLAGS.river) !== 0) score += 600;
  if ((flags & CELL_FLAGS.coast) !== 0) score += 300;
  score -= Math.floor((c.floodPpm[cell] as number) / 100) + Math.floor((c.droughtPpm[cell] as number) / 200);
  return Math.max(0, score);
}

export interface SettlementSite {
  readonly cell: number;
  readonly region: number;
  readonly culture: number;
  readonly score: number;
  /** Rank within its culture (1 = best site). */
  readonly rank: number;
}

/**
 * Choose settlement sites. Cultures without habitable land in their regions
 * (possible on tiny maps) are absent from the seed. `allocate` splits the
 * count among present cultures by seed share (each gets at least one), then each culture takes its best-scoring cells
 * at least `spacing` steps from every chosen site, relaxing the spacing only
 * if it runs out of room. Ties break by cell index.
 */
export function chooseSettlementSites(
  map: WorldMap,
  pack: ContentPack,
  regionCulture: readonly number[],
  count: number,
  spacing: number,
): SettlementSite[] {
  const cultures = pack.cultures;
  const candidates = cultures.map(() => [] as { cell: number; score: number }[]);
  map.cells.region.forEach((region, cell) => {
    if (region < 0) return;
    const score = settlementScore(map, cell);
    if (score < 0) return;
    candidates[regionCulture[region] as number]?.push({ cell, score });
  });
  for (const list of candidates) list.sort((a, b) => b.score - a.score || a.cell - b.cell);
  // Cultures with habitable land, largest share first; at most `count` of them.
  const present = cultures
    .map((culture, index) => ({ index, share: culture.seedSharePpm }))
    .filter((entry) => (candidates[entry.index]?.length ?? 0) > 0)
    .sort((a, b) => b.share - a.share || a.index - b.index)
    .slice(0, count);
  if (present.length === 0) throw new Error("no culture has habitable land for a settlement");
  const allotted = allocate(
    count,
    present.map((entry) => entry.share),
  );
  const perCulture = new Array<number>(cultures.length).fill(0);
  present.forEach((entry, position) => {
    perCulture[entry.index] = Math.max(1, allotted[position] as number);
  });
  // Every present culture got at least one site; take any excess from the largest allotments.
  let excess = perCulture.reduce((sum, value) => sum + value, 0) - count;
  while (excess > 0) {
    const donor = perCulture.indexOf(Math.max(...perCulture));
    perCulture[donor] = (perCulture[donor] as number) - 1;
    excess -= 1;
  }
  const sites: SettlementSite[] = [];
  cultures.forEach((_, culture) => {
    const list = candidates[culture] ?? [];
    const wanted = perCulture[culture] as number;
    const mine: SettlementSite[] = [];
    for (let gap = spacing; gap >= 1 && mine.length < wanted; gap -= 1) {
      for (const candidate of list) {
        if (mine.length >= wanted) break;
        if (sites.some((site) => hexDistance(map.grid, site.cell, candidate.cell) < gap)) continue;
        const site: SettlementSite = {
          cell: candidate.cell,
          region: map.cells.region[candidate.cell] as number,
          culture,
          score: candidate.score,
          rank: mine.length + 1,
        };
        mine.push(site);
        sites.push(site);
      }
    }
  });
  return sites;
}
