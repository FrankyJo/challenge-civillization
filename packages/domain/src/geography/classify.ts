import { CLIMATE_BANDS, TERRAIN_TYPES, type ClimateBand, type TerrainType } from "@civ/contracts";

/**
 * Classification rules shared by the generator and the validator, so the
 * validator recomputes them instead of trusting the document.
 */

/** Latitude band of a row (micro-degrees, absolute value against band limits). */
export function climateBandOf(latitudeMicroDeg: number): number {
  const magnitude = Math.abs(latitudeMicroDeg);
  const band: ClimateBand =
    magnitude < 23_440_000
      ? "tropical"
      : magnitude < 35_000_000
        ? "subtropical"
        : magnitude < 55_000_000
          ? "temperate"
          : magnitude < 66_560_000
            ? "subpolar"
            : "polar";
  return CLIMATE_BANDS.indexOf(band);
}

/** Landform of a land cell from its elevation (m) and relief (largest height difference to a non-ocean neighbour, m). */
export function landformOf(elevationM: number, reliefM: number): number {
  const terrain: TerrainType =
    elevationM >= 2_400
      ? "high_mountains"
      : elevationM >= 1_300 || (elevationM >= 800 && reliefM >= 300)
        ? "mountains"
        : elevationM >= 400 || reliefM >= 200
          ? "hills"
          : "plains";
  return TERRAIN_TYPES.indexOf(terrain);
}

/** Sustainable fish yield per hectare of water by terrain (kg/ha/year; uncalibrated defaults). */
export const FISH_KG_PER_HA: Readonly<Partial<Record<TerrainType, number>>> = Object.freeze({
  deep_ocean: 1,
  shelf_sea: 10,
  lake: 15,
});
/** River fish: one kilogram per year per this many m³/year of discharge (uncalibrated default). */
export const RIVER_FISH_M3_PER_KG = 1_000_000;
