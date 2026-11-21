import { CELL_FLAGS, type WorldMap } from "@civ/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
import { DEFAULT_MAP_PARAMS, generateWorldMap } from "./generate.js";
import {
  cellAtPoint,
  cellCentreM,
  cellIdOf,
  cellIndex,
  cellIndexOfId,
  cellsWithin,
  rowSpacingFor,
  hexDistance,
  ImpossibleCoordinateError,
  neighboursOf,
} from "./grid.js";
import { CellHeap } from "./heap.js";
import { floorDiv, fractalNoise, isqrt, valueNoise } from "./noise.js";
import {
  costFieldFor,
  costFieldFromLayers,
  edgeMinutes,
  findRoute,
  FOOT_AND_BOAT_TRAVEL,
  FOOT_TRAVEL,
  travelField,
  type TravelProfile,
} from "./routes.js";

const SHAPE = { width: 17, height: 13, cellSpacingM: 5_000 };
const cell = fc.integer({ min: 0, max: SHAPE.width * SHAPE.height - 1 });
const map = generateWorldMap({ worldId: "wld_spatial01", seed: "9e3779b97f4a7c15" });
const landCells = map.cells.flags.flatMap((flags, index) => ((flags & CELL_FLAGS.water) === 0 ? [index] : []));
const landCell = fc.constantFrom(...landCells);

describe("hex grid", () => {
  it("has symmetric adjacency at distance 1", () => {
    fc.assert(
      fc.property(cell, (a) => {
        for (const b of neighboursOf(SHAPE, a)) {
          expect(neighboursOf(SHAPE, b)).toContain(a);
          expect(hexDistance(SHAPE, a, b)).toBe(1);
        }
      }),
    );
  });

  it("measures distance as a metric", () => {
    fc.assert(
      fc.property(cell, cell, cell, (a, b, c) => {
        expect(hexDistance(SHAPE, a, b)).toBe(hexDistance(SHAPE, b, a));
        expect(hexDistance(SHAPE, a, a)).toBe(0);
        expect(hexDistance(SHAPE, a, c)).toBeLessThanOrEqual(hexDistance(SHAPE, a, b) + hexDistance(SHAPE, b, c));
      }),
    );
  });

  it("enumerates rings and finds the nearest cell to a point", () => {
    expect(cellsWithin(SHAPE, cellIndex(SHAPE, 8, 6), 1)).toHaveLength(7);
    expect(cellsWithin(SHAPE, cellIndex(SHAPE, 8, 6), 2)).toHaveLength(19);
    expect(cellsWithin(SHAPE, 0, 1)).toHaveLength(3);
    fc.assert(
      fc.property(cell, (a) => {
        const centre = cellCentreM(SHAPE, a);
        expect(cellAtPoint(SHAPE, centre.x, centre.y)).toBe(a);
        expect(cellAtPoint(SHAPE, centre.x + 2_000, centre.y + 1_000)).toSatisfy(
          (near: number) => near === a || neighboursOf(SHAPE, a).includes(near),
        );
      }),
    );
  });

  it("matches brute force for radius queries and nearest-cell lookup", () => {
    const all = Array.from({ length: SHAPE.width * SHAPE.height }, (_, index) => index);
    fc.assert(
      fc.property(cell, fc.integer({ min: 0, max: 6 }), (centre, radius) => {
        expect(cellsWithin(SHAPE, centre, radius)).toEqual(
          all.filter((other) => hexDistance(SHAPE, centre, other) <= radius),
        );
      }),
    );
    const maxX = (SHAPE.width - 1) * SHAPE.cellSpacingM + SHAPE.cellSpacingM / 2;
    const maxY = (SHAPE.height - 1) * rowSpacingFor(SHAPE.cellSpacingM);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: maxX }), fc.integer({ min: 0, max: maxY }), (x, y) => {
        let best = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const other of all) {
          const centre = cellCentreM(SHAPE, other);
          const distance = (centre.x - x) ** 2 + (centre.y - y) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = other;
          }
        }
        expect(cellAtPoint(SHAPE, x, y)).toBe(best);
      }),
      { numRuns: 500 },
    );
  });

  it("round-trips spatial IDs", () => {
    fc.assert(
      fc.property(cell, (a) => {
        const id = cellIdOf(SHAPE, a);
        expect(id).toMatch(/^cel_[0-9a-z]{8}$/);
        expect(cellIndexOfId(SHAPE, id)).toBe(a);
      }),
    );
    expect(cellIdOf(SHAPE, cellIndex(SHAPE, 16, 12))).toBe("cel_000g000c");
  });

  it("rejects impossible coordinates", () => {
    for (const bad of [-1, 221, 1.5, Number.NaN]) {
      expect(() => neighboursOf(SHAPE, bad)).toThrow(ImpossibleCoordinateError);
    }
    expect(() => cellIndex(SHAPE, 17, 0)).toThrow(ImpossibleCoordinateError);
    expect(() => cellIndex(SHAPE, 0, -1)).toThrow(ImpossibleCoordinateError);
    expect(() => cellIndexOfId(SHAPE, "cel_00zz0000")).toThrow(ImpossibleCoordinateError);
    expect(() => cellIndexOfId(SHAPE, "cell_1")).toThrow(ImpossibleCoordinateError);
    expect(() => cellAtPoint(SHAPE, -10_000, 0)).toThrow(ImpossibleCoordinateError);
    expect(() => cellAtPoint(SHAPE, 0, 10_000_000)).toThrow(ImpossibleCoordinateError);
    expect(() => cellsWithin(SHAPE, 0, -1)).toThrow(RangeError);
  });
});

describe("integer primitives", () => {
  it("noise stays in range and is deterministic", () => {
    fc.assert(
      fc.property(fc.nat(10_000_000), fc.nat(10_000_000), fc.integer({ min: 1, max: 100_000 }), (x, y, wave) => {
        const value = valueNoise(123, 0, x, y, wave);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(65_535);
        expect(valueNoise(123, 0, x, y, wave)).toBe(value);
        const fractal = fractalNoise(7, x, y, wave, 4);
        expect(fractal).toBeGreaterThanOrEqual(0);
        expect(fractal).toBeLessThanOrEqual(65_535);
      }),
    );
  });

  it("floorDiv and isqrt are exact", () => {
    expect([floorDiv(7, 2), floorDiv(-7, 2), floorDiv(-8, 2), floorDiv(7, -2)]).toEqual([3, -4, -4, -4]);
    fc.assert(
      fc.property(fc.nat(Number.MAX_SAFE_INTEGER), (n) => {
        const root = isqrt(n);
        expect(BigInt(root) * BigInt(root) <= BigInt(n)).toBe(true);
        expect(BigInt(root + 1) * BigInt(root + 1) > BigInt(n)).toBe(true);
      }),
    );
  });

  it("heap pops by key, then by cell index", () => {
    const heap = new CellHeap();
    for (const [key, value] of [
      [3, 1],
      [1, 9],
      [1, 2],
      [2, 0],
      [1, 5],
    ] as const)
      heap.push(key, value);
    const popped = Array.from({ length: 5 }, () => heap.pop());
    expect(popped).toEqual([
      [1, 2],
      [1, 5],
      [1, 9],
      [2, 0],
      [3, 1],
    ]);
    expect(() => heap.pop()).toThrow(RangeError);
  });
});

describe("routes", () => {
  const foot = costFieldFor(map, FOOT_TRAVEL);
  const boat = costFieldFor(map, FOOT_AND_BOAT_TRAVEL);

  it("finds the same cost as a full Dijkstra field, along a valid path", () => {
    fc.assert(
      fc.property(landCell, landCell, (from, to) => {
        const route = findRoute(foot, from, to);
        const field = travelField(foot, [from]).minutes[to] as number;
        if (route === null) {
          expect(field).toBe(-1);
          return;
        }
        expect(route.costMinutes).toBe(field);
        expect(route.path[0]).toBe(from);
        expect(route.path.at(-1)).toBe(to);
        let total = 0;
        for (let step = 1; step < route.path.length; step += 1) {
          expect(hexDistance(map.grid, defined(route.path[step - 1]), defined(route.path[step]))).toBe(1);
          total += edgeMinutes(foot, defined(route.path[step - 1]), defined(route.path[step]));
        }
        expect(total).toBe(route.costMinutes);
        expect(route.distanceM).toBe((route.path.length - 1) * map.grid.cellSpacingM);
      }),
      { numRuns: 60 },
    );
  });

  it("is symmetric and at least as fast with boats", () => {
    fc.assert(
      fc.property(landCell, landCell, (from, to) => {
        const there = findRoute(foot, from, to);
        const back = findRoute(foot, to, from);
        expect(there?.costMinutes).toBe(back?.costMinutes);
        const sailing = findRoute(boat, from, to);
        expect(sailing).not.toBeNull();
        if (there !== null) expect(defined(sailing).costMinutes).toBeLessThanOrEqual(there.costMinutes);
      }),
      { numRuns: 40 },
    );
  });

  it("charges terrain, rivers and transfers in integer minutes", () => {
    const plainsProfile: TravelProfile = { ...FOOT_TRAVEL, id: "flat", biomePercent: {}, riverCrossingMinutes: 0 };
    const flat = costFieldFor(map, plainsProfile);
    const plain = defined(
      landCells.find(
        (index) =>
          map.cells.terrain[index] === 3 && neighboursOf(map.grid, index).some((n) => map.cells.terrain[n] === 3),
      ),
    );
    const next = defined(neighboursOf(map.grid, plain).find((n) => map.cells.terrain[n] === 3));
    // 12 min/km over 5 km.
    expect(edgeMinutes(flat, plain, next)).toBe(60);
    const riverCell = defined(
      landCells.find(
        (index) =>
          map.cells.flags[index] === CELL_FLAGS.river &&
          neighboursOf(map.grid, index).some((n) => map.cells.flags[n] === 0),
      ),
    );
    const besideRiver = defined(neighboursOf(map.grid, riverCell).find((n) => map.cells.flags[n] === 0));
    const withCrossing = costFieldFor(map, { ...plainsProfile, riverCrossingMinutes: 100 });
    expect(edgeMinutes(withCrossing, riverCell, besideRiver) - edgeMinutes(flat, riverCell, besideRiver)).toBe(50);
    const coast = defined(landCells.find((index) => (defined(map.cells.flags[index]) & CELL_FLAGS.coast) !== 0));
    const sea = defined(
      neighboursOf(map.grid, coast).find((n) => (defined(map.cells.flags[n]) & CELL_FLAGS.water) !== 0),
    );
    expect(edgeMinutes(foot, coast, sea)).toBe(-1);
    expect(edgeMinutes(boat, coast, sea)).toBeGreaterThanOrEqual(FOOT_AND_BOAT_TRAVEL.transferMinutes);
  });

  it("respects water barriers and cost limits", () => {
    expect(findRoute(foot, defined(landCells[0]), 0)).toBeNull();
    expect(findRoute(boat, defined(landCells[0]), 0)).not.toBeNull();
    const from = defined(landCells[0]);
    const to = defined(landCells.at(-1));
    const full = defined(findRoute(boat, from, to));
    expect(findRoute(boat, from, to, { maxMinutes: full.costMinutes - 1 })).toBeNull();
    expect(findRoute(boat, from, to, { maxMinutes: full.costMinutes })?.costMinutes).toBe(full.costMinutes);
    expect(findRoute(foot, from, from)).toEqual({ costMinutes: 0, path: [from], distanceM: 0 });
    expect(() => findRoute(foot, from, map.cells.flags.length)).toThrow(ImpossibleCoordinateError);
  });

  it("connects every land cell by foot and boat on a multi-landmass map", () => {
    let islands: WorldMap | undefined;
    for (let attempt = 0; attempt < 40 && islands === undefined; attempt += 1) {
      const candidate = generateWorldMap({
        worldId: "wld_spatial01",
        seed: `${attempt.toString(16).padStart(2, "0")}9e3779b97f4a7c15`,
        params: { ...DEFAULT_MAP_PARAMS, width: 40, height: 30, landFractionPpm: 300_000, minLandmassCells: 2 },
      });
      if (candidate.landmasses.length > 1) islands = candidate;
    }
    expect(islands).toBeDefined();
    const field = costFieldFor(defined(islands), FOOT_AND_BOAT_TRAVEL);
    const start = defined(defined(islands).landmasses[0]).firstCell;
    const reach = travelField(field, [start]).minutes;
    defined(islands).cells.landmass.forEach((landmass, index) => {
      if (landmass >= 0) expect(reach[index]).toBeGreaterThanOrEqual(0);
    });
    const walking = travelField(costFieldFor(defined(islands), FOOT_TRAVEL), [start]).minutes;
    const other = defined(defined(islands).landmasses[1]).firstCell;
    expect(walking[other]).toBe(-1);
  });

  it("grows contiguous, nearest-source territories deterministically on ties", () => {
    const count = SHAPE.width * SHAPE.height;
    const flat = costFieldFromLayers(
      SHAPE,
      {
        terrain: new Array<number>(count).fill(3),
        biome: new Array<number>(count).fill(7),
        flags: new Array<number>(count).fill(0),
      },
      FOOT_TRAVEL,
    );
    fc.assert(
      fc.property(fc.uniqueArray(cell, { minLength: 1, maxLength: 6 }), (sources) => {
        const first = travelField(flat, sources);
        const again = travelField(flat, sources);
        expect(Array.from(again.owner)).toEqual(Array.from(first.owner));
        for (let index = 0; index < count; index += 1) {
          const nearest = Math.min(...sources.map((source) => defined(findRoute(flat, source, index)).costMinutes));
          expect(first.minutes[index]).toBe(nearest);
        }
        sources.forEach((source, owner) => {
          const members = new Set(Array.from(first.owner).flatMap((value, index) => (value === owner ? [index] : [])));
          const seen = new Set([source]);
          const queue = [source];
          while (queue.length > 0) {
            for (const next of neighboursOf(SHAPE, defined(queue.pop()))) {
              if (members.has(next) && !seen.has(next)) {
                seen.add(next);
                queue.push(next);
              }
            }
          }
          expect(seen.size).toBe(members.size);
        });
      }),
      { numRuns: 30 },
    );
  });

  it("validates travel profiles", () => {
    expect(() => costFieldFor(map, { ...FOOT_TRAVEL, riverCrossingMinutes: -1 })).toThrow(RangeError);
    expect(() =>
      costFieldFor(map, { ...FOOT_TRAVEL, terrainMinutesPerKm: { ...FOOT_TRAVEL.terrainMinutesPerKm, plains: 0 } }),
    ).toThrow(RangeError);
    expect(() => costFieldFor(map, { ...FOOT_TRAVEL, biomePercent: { jungle: 120 } as never })).toThrow(RangeError);
  });
});
