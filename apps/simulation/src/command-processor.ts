import type { Command } from "@civ/contracts";
import {
  commitCommand,
  findCommandByKey,
  IdempotencyConflictError,
  loadWorldState,
  requestDigest,
  StaleWriteError,
  type CommandRecord,
  type Pool,
} from "@civ/db";
import { canonicalHash, freezeWorldData, type Engine, type Rejection, type WorldState } from "@civ/domain";

export interface ProcessCommandOptions<S> {
  readonly pool: Pool;
  readonly engine: Engine<S>;
  readonly command: Command;
  /**
   * Take a checkpoint when an accepted command moves the clock across a
   * multiple of this many ticks (default 3,650 = ten simulated years).
   */
  readonly checkpointIntervalTicks?: number;
  /**
   * Attempts when another writer commits first (default 5). Only accepted
   * commits make a computed outcome stale, so each retry is lost only to a
   * new accepted command; in production the world lease (Phase 06) makes the
   * runner the single writer. Exhaustion throws `StaleWriteError` and the
   * caller (job retry) tries again later.
   */
  readonly maxAttempts?: number;
}

export type ProcessResult =
  | { readonly status: "accepted"; readonly record: CommandRecord; readonly stateHash: string }
  | { readonly status: "rejected"; readonly record: CommandRecord; readonly rejection: Rejection }
  /** Same idempotency key already recorded: nothing was applied again. */
  | { readonly status: "duplicate"; readonly record: CommandRecord };

export const DEFAULT_CHECKPOINT_INTERVAL_TICKS = 3_650;

function crossesCheckpoint(fromClock: number, toClock: number, interval: number): boolean {
  return Math.floor(toClock / interval) > Math.floor(fromClock / interval);
}

/**
 * Load → apply → commit one command. The engine transition is pure and runs
 * outside the transaction; `commitCommand` then records it only if the world
 * is still at the version it was computed from. A concurrent writer makes the
 * commit fail as stale, and the command is recomputed on the fresh state.
 */
export async function processCommand<S>(options: ProcessCommandOptions<S>): Promise<ProcessResult> {
  const { pool, engine, command } = options;
  const interval = options.checkpointIntervalTicks ?? DEFAULT_CHECKPOINT_INTERVAL_TICKS;
  const maxAttempts = options.maxAttempts ?? 5;
  if (!Number.isSafeInteger(interval) || interval < 1) throw new RangeError("checkpointIntervalTicks must be >= 1");

  // Fast path: a redelivered command is answered from the log without
  // running the engine. `commitCommand` re-checks this under the world lock.
  const known = await findCommandByKey(pool, command.worldId, command.idempotencyKey);
  if (known !== null) {
    if (known.requestDigest !== requestDigest(command)) {
      throw new IdempotencyConflictError(
        `idempotency key ${command.idempotencyKey} was already used for a different request`,
      );
    }
    return { status: "duplicate", record: known };
  }

  for (let attempt = 1; ; attempt += 1) {
    const current = await loadWorldState(pool, command.worldId);
    const state = { ...current.state, data: freezeWorldData(current.state.data) } as WorldState<S>;
    const transition = engine.apply(state, command);
    const basedOn = { version: state.version, eventPosition: state.eventPosition };
    try {
      if (!transition.accepted) {
        const result = await commitCommand(pool, {
          command,
          basedOn,
          outcome: { accepted: false, rejection: transition.rejection },
        });
        return result.status === "duplicate"
          ? { status: "duplicate", record: result.record }
          : { status: "rejected", record: result.record, rejection: transition.rejection };
      }
      const stateHash = canonicalHash(transition.state);
      const checkpoint = crossesCheckpoint(state.clock, transition.state.clock, interval)
        ? engine.checkpoint(transition.state)
        : undefined;
      const result = await commitCommand(pool, {
        command,
        basedOn,
        outcome: {
          accepted: true,
          state: transition.state,
          stateHash,
          events: transition.events,
          ...(checkpoint === undefined ? {} : { checkpoint }),
        },
      });
      return result.status === "duplicate"
        ? { status: "duplicate", record: result.record }
        : { status: "accepted", record: result.record, stateHash };
    } catch (error) {
      if (error instanceof StaleWriteError && attempt < maxAttempts) continue;
      throw error;
    }
  }
}
