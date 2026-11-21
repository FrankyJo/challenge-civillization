import { type SimulationInstant } from "@civ/contracts";

/**
 * Simulation calendar `civ365-daily-v1`.
 *
 * - One tick is one simulated day.
 * - Every year has exactly 365 days. This is a computational calendar, not
 *   Julian/Gregorian: leap days carry no simulation meaning, and uniform
 *   years keep year boundaries at exact multiples of 365 ticks.
 * - Tick `t` is the day being simulated: year `⌊t/365⌋ + startYear`,
 *   day of year `t mod 365 + 1`.
 * - The clock position is the number of completed ticks. Position `0` is
 *   the start of 1 January of the start year; position `endTick` means the
 *   last day of the end year has completed (the run is finished).
 *
 * The calendar is part of the engine config (and therefore of the config
 * digest). Changing it is a new calendar id, never an edit.
 */
export const CALENDAR_ID = "civ365-daily-v1";
export const DAYS_PER_YEAR = 365;

export interface CalendarSpan {
  /** First simulated CE year (≥ 1; there is no year 0). */
  readonly startYear: number;
  /** Last simulated CE year, completed when the run ends. */
  readonly endYear: number;
}

/** Season 1: from the start of 1 CE through the end of 2026 CE. */
export const SEASON_ONE_SPAN: CalendarSpan = Object.freeze({ startYear: 1, endYear: 2026 });

export class CalendarRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "CalendarRangeError";
  }
}

export function assertCalendarSpan(span: CalendarSpan): void {
  if (!Number.isSafeInteger(span.startYear) || span.startYear < 1) {
    throw new CalendarRangeError(`startYear must be an integer ≥ 1, got ${span.startYear}`);
  }
  if (!Number.isSafeInteger(span.endYear) || span.endYear < span.startYear || span.endYear > 9998) {
    throw new CalendarRangeError(`endYear must be an integer in [startYear, 9998], got ${span.endYear}`);
  }
}

/** Number of ticks (days) in the span: the clock position at completion. */
export function endTick(span: CalendarSpan): number {
  assertCalendarSpan(span);
  return (span.endYear - span.startYear + 1) * DAYS_PER_YEAR;
}

/** First tick of a CE year within the span. */
export function firstTickOfYear(span: CalendarSpan, year: number): number {
  assertCalendarSpan(span);
  if (!Number.isSafeInteger(year) || year < span.startYear || year > span.endYear + 1) {
    throw new CalendarRangeError(`year ${year} is outside ${span.startYear}–${span.endYear + 1}`);
  }
  return (year - span.startYear) * DAYS_PER_YEAR;
}

/**
 * Calendar instant of a clock position in `[0, endTick]`. The completion
 * position maps to 1 January of the year after `endYear`.
 */
export function instantAt(span: CalendarSpan, tick: number): SimulationInstant {
  const last = endTick(span);
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > last) {
    throw new CalendarRangeError(`tick ${tick} is outside 0–${last}`);
  }
  return {
    tick,
    year: span.startYear + Math.floor(tick / DAYS_PER_YEAR),
    dayOfYear: (tick % DAYS_PER_YEAR) + 1,
  };
}

/** True when the instant's year/day are the ones this calendar derives from its tick. */
export function isConsistentInstant(span: CalendarSpan, instant: SimulationInstant): boolean {
  try {
    const expected = instantAt(span, instant.tick);
    return expected.year === instant.year && expected.dayOfYear === instant.dayOfYear;
  } catch {
    return false;
  }
}
