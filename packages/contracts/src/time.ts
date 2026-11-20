import { z } from "zod";

/**
 * Wall-clock instant as an ISO 8601 UTC timestamp with a `Z` suffix. Used
 * only for operational metadata (schedules, audit, when a command arrived),
 * never as an input to simulation transitions.
 */
export const utcTimestampSchema = z.iso
  .datetime({ offset: false, local: false })
  .refine((value) => isRealCalendarDate(value), "must be a real calendar date");
export type UtcTimestamp = z.output<typeof utcTimestampSchema>;

function isRealCalendarDate(value: string): boolean {
  const millis = Date.parse(value);
  return !Number.isNaN(millis) && new Date(millis).toISOString().slice(0, 10) === value.slice(0, 10);
}

/** Season 1 runs within CE years; there is no year 0 and no BCE. */
export const CE_YEAR_MIN = 1;
export const CE_YEAR_MAX = 9999;
export const ceYearSchema = z.number().int().min(CE_YEAR_MIN).max(CE_YEAR_MAX);

/**
 * A point on the simulation clock. `tick` is the authoritative integer
 * position; `year`/`dayOfYear` are the derived CE calendar values recorded
 * alongside it for audit and display. The tick→calendar mapping is defined
 * by the engine clock (Phase 02), which also validates consistency.
 */
export const simulationInstantSchema = z.strictObject({
  tick: z.number().int().nonnegative(),
  year: ceYearSchema,
  dayOfYear: z.number().int().min(1).max(366),
});
export type SimulationInstant = z.output<typeof simulationInstantSchema>;
