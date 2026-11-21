import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { endTick, SEASON_ONE_SPAN } from "./calendar.js";
import { dueAtMs, ScheduleError, SEASON_DURATION_MS, ticksDueAt, type SeasonSchedule } from "./schedule.js";

const start = Date.UTC(2027, 0, 1);
const season: SeasonSchedule = {
  startsAtMs: start,
  endsAtMs: start + SEASON_DURATION_MS,
  totalTicks: endTick(SEASON_ONE_SPAN),
};

describe("season schedule (30 days → 739,490 ticks)", () => {
  it("is exactly 720 hours long", () => {
    expect(SEASON_DURATION_MS).toBe(720 * 3_600_000);
  });

  it("has nothing due before the start and everything due at the end", () => {
    expect(ticksDueAt(season, start - 1)).toBe(0);
    expect(ticksDueAt(season, start)).toBe(0);
    expect(ticksDueAt(season, season.endsAtMs - 1)).toBe(season.totalTicks - 1);
    expect(ticksDueAt(season, season.endsAtMs)).toBe(season.totalTicks);
    expect(ticksDueAt(season, season.endsAtMs + 86_400_000)).toBe(season.totalTicks);
    expect(dueAtMs(season, season.totalTicks)).toBe(season.endsAtMs);
  });

  it("places each year boundary at an exact, drift-free instant", () => {
    // Year y completes after y·365 ticks: at start + ceil(y·365·D / 739490) ms.
    expect(dueAtMs(season, 365)).toBe(start + Math.ceil((365 * SEASON_DURATION_MS) / 739_490));
    expect(dueAtMs(season, 1013 * 365)).toBe(start + SEASON_DURATION_MS / 2);
    // The mean pace matches the product baseline of ≈2.8139 years/hour.
    expect(ticksDueAt(season, start + 3_600_000)).toBe(Math.floor(739_490 / 720));
  });

  it("dueAtMs is the first instant at which a tick is due", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: season.totalTicks }), (tick) => {
        const at = dueAtMs(season, tick);
        expect(ticksDueAt(season, at)).toBeGreaterThanOrEqual(tick);
        expect(ticksDueAt(season, at - 1)).toBeLessThan(tick);
      }),
    );
  });

  it("is monotonic and never skips more ticks than elapsed time allows, for any schedule", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 400 * 86_400_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (startsAtMs, duration, totalTicks, a, b) => {
          const schedule = { startsAtMs, endsAtMs: startsAtMs + duration, totalTicks };
          const t1 = startsAtMs + Math.min(a, b);
          const t2 = startsAtMs + Math.max(a, b);
          expect(ticksDueAt(schedule, t1)).toBeLessThanOrEqual(ticksDueAt(schedule, t2));
          expect(ticksDueAt(schedule, schedule.endsAtMs)).toBe(totalTicks);
        },
      ),
    );
  });

  it("rejects invalid schedules and non-integer times", () => {
    expect(() => ticksDueAt({ ...season, endsAtMs: start }, start)).toThrow(ScheduleError);
    expect(() => ticksDueAt({ ...season, totalTicks: 0 }, start)).toThrow(ScheduleError);
    expect(() => ticksDueAt(season, start + 0.5)).toThrow(ScheduleError);
    expect(() => dueAtMs(season, season.totalTicks + 1)).toThrow(ScheduleError);
  });
});
