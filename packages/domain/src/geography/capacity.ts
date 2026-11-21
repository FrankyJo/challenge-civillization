import { MINERALS, type Mineral, type WorldMap } from "@civ/contracts";
import { checkedAdd, mulDiv } from "../units.js";
import { assertCell } from "./grid.js";

/**
 * Carrying-capacity inputs: integer environmental quantities summed over a
 * set of cells. They are inputs for the needs, production and settlement
 * systems (Phases 08–11), not a population capacity themselves.
 */
export interface CapacityInputs {
  readonly cellCount: number;
  readonly landCells: number;
  readonly landAreaHa: number;
  readonly forestHa: number;
  readonly grasslandHa: number;
  readonly wetlandHa: number;
  readonly barrenHa: number;
  readonly arablePotentialHa: number;
  readonly timberStockM3: number;
  /** Water generated inside the area. */
  readonly runoffM3PerYear: number;
  /** Largest river discharge leaving any cell of the area (not summed: rivers pass through). */
  readonly maxDischargeM3PerYear: number;
  readonly fishKgPerYear: number;
  /** Land-area-weighted means (water cells excluded); null without land. */
  readonly meanTemperatureDeciC: number | null;
  readonly meanPrecipitationMm: number | null;
  /** Tonnes in place by mineral. */
  readonly depositsT: Readonly<Record<Mineral, number>>;
}

export function capacityInputs(map: WorldMap, cells: Iterable<number>): CapacityInputs {
  const unique = [...new Set(cells)].sort((a, b) => a - b);
  const sums = {
    landCells: 0,
    landAreaHa: 0,
    forestHa: 0,
    grasslandHa: 0,
    wetlandHa: 0,
    barrenHa: 0,
    arablePotentialHa: 0,
    timberStockM3: 0,
    runoffM3PerYear: 0,
    fishKgPerYear: 0,
  };
  let maxDischarge = 0;
  let temperatureArea = 0;
  let precipitationArea = 0;
  const member = new Set(unique);
  for (const cell of unique) {
    assertCell(map.grid, cell);
    const c = map.cells;
    const area = c.landAreaHa[cell] as number;
    if (area > 0) sums.landCells += 1;
    for (const key of [
      "landAreaHa",
      "forestHa",
      "grasslandHa",
      "wetlandHa",
      "barrenHa",
      "arablePotentialHa",
      "timberStockM3",
      "runoffM3PerYear",
      "fishKgPerYear",
    ] as const) {
      sums[key] = checkedAdd(sums[key], c[key][cell] as number);
    }
    maxDischarge = Math.max(maxDischarge, c.dischargeM3PerYear[cell] as number);
    temperatureArea = checkedAdd(temperatureArea, area * (c.temperatureDeciC[cell] as number));
    precipitationArea = checkedAdd(precipitationArea, area * (c.precipitationMm[cell] as number));
  }
  const depositsT = Object.fromEntries(MINERALS.map((mineral) => [mineral, 0])) as Record<Mineral, number>;
  for (const deposit of map.deposits) {
    if (!member.has(deposit.cell)) continue;
    const mineral = MINERALS[deposit.mineral] as Mineral;
    depositsT[mineral] = checkedAdd(depositsT[mineral], deposit.amountT);
  }
  return {
    cellCount: unique.length,
    ...sums,
    maxDischargeM3PerYear: maxDischarge,
    meanTemperatureDeciC: sums.landAreaHa === 0 ? null : mulDiv(temperatureArea, 1, sums.landAreaHa, "half_even"),
    meanPrecipitationMm: sums.landAreaHa === 0 ? null : mulDiv(precipitationArea, 1, sums.landAreaHa, "half_even"),
    depositsT,
  };
}

/** Cells of a region, ascending. */
export function regionCells(map: WorldMap, region: number): number[] {
  if (!Number.isSafeInteger(region) || region < 0 || region >= map.regions.length) {
    throw new RangeError(`region ${region} does not exist`);
  }
  const result: number[] = [];
  map.cells.region.forEach((value, cell) => {
    if (value === region) result.push(cell);
  });
  return result;
}

export function regionCapacityInputs(map: WorldMap, region: number): CapacityInputs {
  return capacityInputs(map, regionCells(map, region));
}
