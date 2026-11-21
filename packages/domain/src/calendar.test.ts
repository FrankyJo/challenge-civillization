import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CalendarRangeError,
  DAYS_PER_YEAR,
  endTick,
  firstTickOfYear,
  instantAt,
  isConsistentInstant,
  SEASON_ONE_SPAN,
} from "./calendar.js";

const span = SEASON_ONE_SPAN;

describe("calendar civ365-daily-v1 for 1–2026 CE", () => {
  it("has 739,490 ticks (2026 years × 365 days)", () => {
    expect(endTick(span)).toBe(739_490);
  });

  it("starts year 1 at tick 0", () => {
    expect(instantAt(span, 0)).toEqual({ tick: 0, year: 1, dayOfYear: 1 });
    expect(firstTickOfYear(span, 1)).toBe(0);
  });

  it("places year boundaries at multiples of 365", () => {
    expect(instantAt(span, 364)).toEqual({ tick: 364, year: 1, dayOfYear: 365 });
    expect(instantAt(span, 365)).toEqual({ tick: 365, year: 2, dayOfYear: 1 });
    expect(firstTickOfYear(span, 2026)).toBe(2025 * 365);
  });

  it("completes year 2026 at the end tick", () => {
    expect(instantAt(span, 739_489)).toEqual({ tick: 739_489, year: 2026, dayOfYear: 365 });
    expect(instantAt(span, 739_490)).toEqual({ tick: 739_490, year: 2027, dayOfYear: 1 });
    expect(firstTickOfYear(span, 2027)).toBe(endTick(span));
  });

  it("rejects positions outside the span", () => {
    for (const tick of [-1, 739_491, 1.5, Number.NaN]) {
      expect(() => instantAt(span, tick)).toThrow(CalendarRangeError);
    }
    expect(() => firstTickOfYear(span, 0)).toThrow(CalendarRangeError);
    expect(() => endTick({ startYear: 0, endYear: 5 })).toThrow(CalendarRangeError);
    expect(() => endTick({ startYear: 5, endYear: 4 })).toThrow(CalendarRangeError);
  });

  it("round-trips every tick: year/day determine the tick", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: endTick(span) }), (tick) => {
        const instant = instantAt(span, tick);
        expect((instant.year - 1) * DAYS_PER_YEAR + instant.dayOfYear - 1).toBe(tick);
        expect(isConsistentInstant(span, instant)).toBe(true);
        expect(isConsistentInstant(span, { ...instant, dayOfYear: (instant.dayOfYear % 365) + 1 })).toBe(false);
      }),
    );
    expect(isConsistentInstant(span, { tick: 0, year: 1, dayOfYear: 366 })).toBe(false);
  });
});
