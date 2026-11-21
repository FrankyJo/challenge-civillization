import { DAYS_PER_YEAR } from "../calendar.js";
import { floorDiv } from "../geography/noise.js";

export { DAYS_PER_YEAR };

/**
 * Astronomical year of a tick (tick 0 = first day of 1 CE). Ticks before the
 * season give years ≤ 0: year 0 is 1 BCE, year −99 is 100 BCE.
 */
export function yearOfTick(tick: number): number {
  return 1 + floorDiv(tick, DAYS_PER_YEAR);
}

/** Completed years of age at `atTick` for someone born at `birthTick`. */
export function ageInYears(birthTick: number, atTick: number): number {
  if (atTick < birthTick) throw new RangeError("age is undefined before birth");
  return floorDiv(atTick - birthTick, DAYS_PER_YEAR);
}
