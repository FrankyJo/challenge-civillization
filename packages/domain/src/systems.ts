import { type SimulationInstant } from "@civ/contracts";
import { type RandomStream } from "./random.js";

/** An event a system wants recorded; the kernel adds the envelope. */
export interface EventDraft {
  readonly type: string;
  readonly typeVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SystemContext {
  readonly worldId: string;
  /** The tick (day) being simulated. */
  readonly tick: number;
  readonly instant: SimulationInstant;
  /** This system's stream for this tick: `["system", id, tick]`. */
  readonly random: RandomStream;
}

export interface SystemResult<S> {
  /** New world data. Systems must not mutate their input; return new objects. */
  readonly data: S;
  readonly events: readonly EventDraft[];
}

/** Runs on ticks where `(tick - offset) % every === 0` and `tick ≥ offset`. */
export interface Cadence {
  readonly every: number;
  readonly offset: number;
}

export const DAILY: Cadence = Object.freeze({ every: 1, offset: 0 });
/** First day of every year (the calendar has 365-day years). */
export const YEARLY: Cadence = Object.freeze({ every: 365, offset: 0 });

export interface SimulationSystem<S> {
  /** Stable snake_case identifier; part of PRNG stream labels and the config digest. */
  readonly id: string;
  /** Position in the tick: lower runs first. Unique within a schedule. */
  readonly order: number;
  readonly cadence: Cadence;
  /** Short statement of resolution, inputs/outputs and invariants (documentation). */
  readonly description: string;
  run(data: S, context: SystemContext): SystemResult<S>;
}

export interface SystemSchedule<S> {
  /** Systems in execution order. */
  readonly systems: readonly SimulationSystem<S>[];
  /** Canonical description of the schedule; part of the engine config digest. */
  readonly descriptor: readonly { readonly id: string; readonly order: number; readonly cadence: Cadence }[];
}

/**
 * Validate and order systems. Order is explicit and stable: systems run by
 * ascending `order`, never by registration or object-key order.
 */
export function createSystemSchedule<S>(systems: readonly SimulationSystem<S>[]): SystemSchedule<S> {
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const system of systems) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(system.id)) throw new Error(`invalid system id: ${system.id}`);
    if (ids.has(system.id)) throw new Error(`duplicate system id: ${system.id}`);
    if (!Number.isSafeInteger(system.order)) throw new Error(`system ${system.id} order must be an integer`);
    if (orders.has(system.order)) throw new Error(`duplicate system order ${system.order} (${system.id})`);
    const { every, offset } = system.cadence;
    if (!Number.isSafeInteger(every) || every < 1 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new Error(`system ${system.id} has an invalid cadence`);
    }
    ids.add(system.id);
    orders.add(system.order);
  }
  const ordered = [...systems].sort((a, b) => a.order - b.order);
  return Object.freeze({
    systems: Object.freeze(ordered),
    descriptor: Object.freeze(
      ordered.map((system) => ({
        id: system.id,
        order: system.order,
        cadence: { every: system.cadence.every, offset: system.cadence.offset },
      })),
    ),
  });
}

export function runsAt(cadence: Cadence, tick: number): boolean {
  return tick >= cadence.offset && (tick - cadence.offset) % cadence.every === 0;
}
