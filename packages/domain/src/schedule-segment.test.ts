import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dueAtMs,
  extendSegment,
  lagMs,
  SEASON_DURATION_MS,
  seasonSegment,
  segmentDueAtMs,
  segmentTicksDueAt,
  ticksDueAt,
  type ScheduleSegment,
} from "./schedule.js";

const START = Date.UTC(2027, 0, 1);
const season = { startsAtMs: START, endsAtMs: START + SEASON_DURATION_MS, totalTicks: 739_490 };
const segment = seasonSegment(season);
const instant = fc.integer({ min: START - 10_000_000, max: season.endsAtMs + 10_000_000 });

describe("schedule segments", () => {
  it("equal the plain season schedule before any extension, at the endpoints and between", () => {
    expect(segmentTicksDueAt(segment, START)).toBe(0);
    expect(segmentTicksDueAt(segment, season.endsAtMs - 1)).toBe(739_489);
    expect(segmentTicksDueAt(segment, season.endsAtMs)).toBe(739_490);
    fc.assert(
      fc.property(instant, (now) => {
        expect(segmentTicksDueAt(segment, now)).toBe(ticksDueAt(season, now));
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 739_490 }), (tick) => {
        expect(segmentDueAtMs(segment, tick)).toBe(dueAtMs(season, tick));
      }),
    );
  });

  it("are monotone and invert exactly: tick k is due from dueAt(k), not a millisecond earlier", () => {
    fc.assert(
      fc.property(instant, instant, (a, b) => {
        const [early, late] = a <= b ? [a, b] : [b, a];
        expect(segmentTicksDueAt(segment, early)).toBeLessThanOrEqual(segmentTicksDueAt(segment, late));
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 739_490 }), (tick) => {
        const at = segmentDueAtMs(segment, tick);
        expect(segmentTicksDueAt(segment, at)).toBeGreaterThanOrEqual(tick);
        expect(segmentTicksDueAt(segment, at - 1)).toBeLessThan(tick);
      }),
    );
  });

  it("re-anchor after a pause without moving simulated time and still end on time", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SEASON_DURATION_MS - 2 }),
        fc.integer({ min: 0, max: 72 * 3_600_000 }),
        (pausedAt, pauseMs) => {
          const clock = segmentTicksDueAt(segment, START + pausedAt);
          if (clock >= season.totalTicks) return;
          const now = START + pausedAt + pauseMs;
          const extended = extendSegment(segment, { clock, atMs: now, extraMs: pauseMs });
          // No jump at the re-anchoring instant; never backwards; exact end.
          expect(segmentTicksDueAt(extended, now)).toBe(clock);
          expect(segmentTicksDueAt(extended, now + 1)).toBeGreaterThanOrEqual(clock);
          expect(segmentTicksDueAt(extended, season.endsAtMs + pauseMs)).toBe(season.totalTicks);
          expect(segmentTicksDueAt(extended, season.endsAtMs + pauseMs - 1)).toBeLessThan(season.totalTicks);
        },
      ),
    );
  });

  it("chain many extensions without drift", () => {
    let current: ScheduleSegment = segment;
    let now = START;
    let total = 0;
    for (let index = 0; index < 50; index += 1) {
      now += 9 * 3_600_000;
      const clock = segmentTicksDueAt(current, now);
      now += 1_800_000;
      current = extendSegment(current, { clock, atMs: now, extraMs: 1_800_000 });
      total += 1_800_000;
      expect(segmentTicksDueAt(current, now)).toBe(clock);
    }
    expect(current.endsAtMs).toBe(season.endsAtMs + total);
    expect(segmentTicksDueAt(current, current.endsAtMs)).toBe(season.totalTicks);
  });

  it("measure lag and reject impossible extensions", () => {
    const at = segmentDueAtMs(segment, 1_000);
    expect(lagMs(segment, 999, at)).toBe(0);
    expect(lagMs(segment, 900, at)).toBeGreaterThan(0);
    expect(lagMs(segment, season.totalTicks, season.endsAtMs + 5)).toBe(0);
    expect(() => extendSegment(segment, { clock: 10, atMs: START - 1, extraMs: 0 })).toThrow(/past/);
    expect(() => extendSegment(segment, { clock: 739_490, atMs: START, extraMs: 0 })).toThrow(/re-anchor/);
    expect(() => extendSegment(segment, { clock: 1, atMs: season.endsAtMs + 10, extraMs: 5 })).toThrow(/end after/);
    expect(() => extendSegment(segment, { clock: 1, atMs: START, extraMs: -1 })).toThrow(/non-negative/);
  });
});
