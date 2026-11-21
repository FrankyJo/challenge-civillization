/**
 * Real-time → simulation-time mapping for a season.
 *
 * A season plays `totalTicks` ticks evenly over the real interval
 * `[startsAtMs, endsAtMs)`. Every value is computed from the origin with
 * exact integer (BigInt) arithmetic, never by accumulating increments, so
 * there is no drift: tick `k` is due exactly at
 * `startsAtMs + ceil(k · duration / totalTicks)` and all ticks are due at
 * `endsAtMs`.
 *
 * Times are integer milliseconds since the Unix epoch, supplied by the
 * caller (the runner reads the wall clock; this module never does). Pauses,
 * catch-up ceilings and schedule extensions are runner policy (Phase 06):
 * they are expressed by choosing a new schedule, not by mutating this one.
 */
export interface SeasonSchedule {
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  readonly totalTicks: number;
}

/** Thirty days of 24 hours in milliseconds: the product's season length. */
export const SEASON_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export class ScheduleError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

export function assertSchedule(schedule: SeasonSchedule): void {
  const { startsAtMs, endsAtMs, totalTicks } = schedule;
  if (!Number.isSafeInteger(startsAtMs) || !Number.isSafeInteger(endsAtMs)) {
    throw new ScheduleError("schedule bounds must be integer milliseconds");
  }
  if (endsAtMs <= startsAtMs) throw new ScheduleError("schedule must end after it starts");
  if (!Number.isSafeInteger(endsAtMs - startsAtMs)) throw new ScheduleError("schedule duration must be a safe integer");
  if (!Number.isSafeInteger(totalTicks) || totalTicks < 1) {
    throw new ScheduleError("totalTicks must be a positive integer");
  }
}

/** Number of ticks due (to have completed) at real time `nowMs`, in `[0, totalTicks]`. */
export function ticksDueAt(schedule: SeasonSchedule, nowMs: number): number {
  assertSchedule(schedule);
  if (!Number.isSafeInteger(nowMs)) throw new ScheduleError("nowMs must be integer milliseconds");
  if (nowMs <= schedule.startsAtMs) return 0;
  if (nowMs >= schedule.endsAtMs) return schedule.totalTicks;
  const elapsed = BigInt(nowMs) - BigInt(schedule.startsAtMs);
  const duration = BigInt(schedule.endsAtMs) - BigInt(schedule.startsAtMs);
  return Number((elapsed * BigInt(schedule.totalTicks)) / duration);
}

/** Earliest real time at which `tick` ticks are due (`tick` in `[0, totalTicks]`). */
export function dueAtMs(schedule: SeasonSchedule, tick: number): number {
  assertSchedule(schedule);
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > schedule.totalTicks) {
    throw new ScheduleError(`tick ${tick} is outside 0–${schedule.totalTicks}`);
  }
  const duration = BigInt(schedule.endsAtMs) - BigInt(schedule.startsAtMs);
  const numerator = BigInt(tick) * duration;
  const total = BigInt(schedule.totalTicks);
  const ceil = (numerator + total - 1n) / total;
  return schedule.startsAtMs + Number(ceil);
}

/**
 * A schedule segment: from real time `anchorAtMs`, ticks `anchorTick …
 * totalTicks` are spread evenly until `endsAtMs`. A season starts with the
 * segment (0, startsAt, endsAt). An audited schedule extension re-anchors at
 * the world's current clock and the current time with a later end, so
 * simulated time never jumps and the season still ends exactly at
 * `endsAtMs`. Each segment is computed from its own anchor with exact
 * integer arithmetic: no drift, however many segments a season has.
 */
export interface ScheduleSegment {
  readonly anchorTick: number;
  readonly anchorAtMs: number;
  readonly endsAtMs: number;
  readonly totalTicks: number;
}

export function seasonSegment(schedule: SeasonSchedule): ScheduleSegment {
  assertSchedule(schedule);
  return {
    anchorTick: 0,
    anchorAtMs: schedule.startsAtMs,
    endsAtMs: schedule.endsAtMs,
    totalTicks: schedule.totalTicks,
  };
}

export function assertSegment(segment: ScheduleSegment): void {
  const { anchorTick, anchorAtMs, endsAtMs, totalTicks } = segment;
  if (!Number.isSafeInteger(anchorTick) || anchorTick < 0 || anchorTick > totalTicks) {
    throw new ScheduleError(`anchor tick ${anchorTick} is outside 0–${totalTicks}`);
  }
  assertSchedule({ startsAtMs: anchorAtMs, endsAtMs, totalTicks });
}

/** Ticks due at `nowMs` under a segment, in `[anchorTick, totalTicks]`. */
export function segmentTicksDueAt(segment: ScheduleSegment, nowMs: number): number {
  assertSegment(segment);
  if (!Number.isSafeInteger(nowMs)) throw new ScheduleError("nowMs must be integer milliseconds");
  if (nowMs <= segment.anchorAtMs) return segment.anchorTick;
  if (nowMs >= segment.endsAtMs) return segment.totalTicks;
  const elapsed = BigInt(nowMs) - BigInt(segment.anchorAtMs);
  const duration = BigInt(segment.endsAtMs) - BigInt(segment.anchorAtMs);
  const remaining = BigInt(segment.totalTicks - segment.anchorTick);
  return segment.anchorTick + Number((elapsed * remaining) / duration);
}

/** Earliest real time at which `tick` ticks are due under a segment (`tick` in `[anchorTick, totalTicks]`). */
export function segmentDueAtMs(segment: ScheduleSegment, tick: number): number {
  assertSegment(segment);
  if (!Number.isSafeInteger(tick) || tick < segment.anchorTick || tick > segment.totalTicks) {
    throw new ScheduleError(`tick ${tick} is outside ${segment.anchorTick}–${segment.totalTicks}`);
  }
  if (tick === segment.anchorTick) return segment.anchorAtMs;
  const duration = BigInt(segment.endsAtMs) - BigInt(segment.anchorAtMs);
  const remaining = BigInt(segment.totalTicks - segment.anchorTick);
  const numerator = BigInt(tick - segment.anchorTick) * duration;
  return segment.anchorAtMs + Number((numerator + remaining - 1n) / remaining);
}

/**
 * How far real time is ahead of the world: the time since the world's next
 * tick (`clock + 1`) fell due, or 0 when the world is not behind. This is the
 * extension that restores the segment's pace for the remaining ticks.
 */
export function lagMs(segment: ScheduleSegment, clock: number, nowMs: number): number {
  if (clock >= segment.totalTicks) return 0;
  const next = Math.max(clock + 1, segment.anchorTick);
  return Math.max(0, nowMs - segmentDueAtMs(segment, Math.min(next, segment.totalTicks)));
}

/**
 * Re-anchor a segment at the world's clock and the current time, ending
 * `extraMs` later than before. Right after the extension the due count
 * equals the clock (no jump forward or backward).
 */
export function extendSegment(
  segment: ScheduleSegment,
  extension: { readonly clock: number; readonly atMs: number; readonly extraMs: number },
): ScheduleSegment {
  assertSegment(segment);
  const { clock, atMs, extraMs } = extension;
  if (!Number.isSafeInteger(extraMs) || extraMs < 0) throw new ScheduleError("extraMs must be a non-negative integer");
  if (!Number.isSafeInteger(clock) || clock < segment.anchorTick || clock >= segment.totalTicks) {
    throw new ScheduleError(`cannot re-anchor at tick ${clock}`);
  }
  if (!Number.isSafeInteger(atMs) || atMs < segment.anchorAtMs) throw new ScheduleError("cannot re-anchor in the past");
  const endsAtMs = segment.endsAtMs + extraMs;
  if (endsAtMs <= atMs) throw new ScheduleError("the extended schedule must end after the re-anchoring time");
  const next = { anchorTick: clock, anchorAtMs: atMs, endsAtMs, totalTicks: segment.totalTicks };
  assertSegment(next);
  return next;
}
