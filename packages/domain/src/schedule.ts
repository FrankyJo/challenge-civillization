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
