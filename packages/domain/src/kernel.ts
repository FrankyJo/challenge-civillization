import {
  checkpointSchema,
  eventRegistry,
  parseContract,
  worldIdSchema,
  worldSeedSchema,
  type Checkpoint,
  type Command,
  type Digest,
  type DomainEvent,
  type VersionStamp,
} from "@civ/contracts";
import {
  assertCalendarSpan,
  CALENDAR_ID,
  endTick,
  instantAt,
  isConsistentInstant,
  type CalendarSpan,
} from "./calendar.js";
import { canonicalHash } from "./hash.js";
import { freezeWorldData } from "./data-guard.js";
import { deriveId } from "./ids.js";
import { RandomRoot } from "./random.js";
import { runsAt, type EventDraft, type SystemSchedule } from "./systems.js";
import { ENGINE_VERSION } from "./version.js";

export const WORLD_STATE_SCHEMA_VERSION = 1 as const;

/**
 * Authoritative world state. Plain JSON data only, so its canonical hash is
 * well defined. `data` belongs to the simulation systems.
 */
export interface WorldState<S> {
  readonly schemaVersion: typeof WORLD_STATE_SCHEMA_VERSION;
  readonly worldId: string;
  /** Clock position: number of completed ticks. */
  readonly clock: number;
  readonly status: "running" | "paused";
  /** Number of accepted commands; compared with `expectedVersion`. */
  readonly version: number;
  /** Number of events recorded; the next event's ledger sequence. */
  readonly eventPosition: number;
  readonly data: S;
}

export type RejectionCode =
  | "wrong_world"
  | "version_mismatch"
  | "stale_version"
  | "inconsistent_instant"
  | "already_paused"
  | "not_paused"
  | "world_paused"
  | "clock_mismatch"
  | "beyond_end"
  | "too_many_ticks";

export interface Rejection {
  readonly code: RejectionCode;
  readonly message: string;
}

export type Transition<S> =
  | { readonly accepted: true; readonly state: WorldState<S>; readonly events: readonly DomainEvent[] }
  | { readonly accepted: false; readonly rejection: Rejection };

export interface EngineOptions<S> {
  readonly worldId: string;
  /** World seed (hex); root of every PRNG stream. */
  readonly seed: string;
  readonly span: CalendarSpan;
  /** Digest of the content pack set in use. */
  readonly contentVersion: Digest;
  readonly schedule: SystemSchedule<S>;
  /**
   * Largest tick range one `world.advance` may run (default 3,650 = ten
   * years). Bounds the work and memory of one transition; the runner splits
   * catch-up into several commands.
   */
  readonly maxTicksPerAdvance?: number;
}

export const DEFAULT_MAX_TICKS_PER_ADVANCE = 3_650;

/** Event types the kernel itself emits; systems may not emit them. */
const KERNEL_EVENT_PREFIX = "world.";

/** Everything that, with the seed, commands and content, determines a run. Hashed into `configVersion`. */
export interface EngineConfigDocument {
  readonly calendar: { readonly id: string; readonly startYear: number; readonly endYear: number };
  readonly systems: SystemSchedule<unknown>["descriptor"];
  readonly maxTicksPerAdvance: number;
}

export interface Engine<S> {
  readonly worldId: string;
  readonly span: CalendarSpan;
  readonly endTick: number;
  readonly versions: VersionStamp;
  readonly config: EngineConfigDocument;
  initialState(data: S): WorldState<S>;
  /**
   * Pure transition: the same state and command always yield the same
   * result. Invalid commands are rejected without effects. A defective
   * system (mutating/non-JSON data, reserved or unregistered event types,
   * or a thrown error) makes `apply` throw; the input state is unchanged
   * because world data is frozen.
   *
   * Idempotency: the kernel applies the ordered command log it is given.
   * Duplicate delivery is removed before that, by the command log's unique
   * (world, idempotencyKey) constraint (Phase 03). `world.advance` is
   * additionally self-guarding through `fromTick`.
   */
  apply(state: WorldState<S>, command: Command): Transition<S>;
  checkpoint(state: WorldState<S>): Checkpoint;
}

const reject = <S>(code: RejectionCode, message: string): Transition<S> => ({
  accepted: false,
  rejection: { code, message },
});

export function createEngine<S>(options: EngineOptions<S>): Engine<S> {
  const worldId = parseContract("world id", worldIdSchema, options.worldId) as string;
  parseContract("world seed", worldSeedSchema, options.seed);
  assertCalendarSpan(options.span);
  const span = Object.freeze({ startYear: options.span.startYear, endYear: options.span.endYear });
  const lastTick = endTick(span);
  const root = new RandomRoot(options.seed);
  const maxTicksPerAdvance = options.maxTicksPerAdvance ?? DEFAULT_MAX_TICKS_PER_ADVANCE;
  if (!Number.isSafeInteger(maxTicksPerAdvance) || maxTicksPerAdvance < 1) {
    throw new RangeError("maxTicksPerAdvance must be a positive integer");
  }
  const config: EngineConfigDocument = Object.freeze({
    calendar: { id: CALENDAR_ID, startYear: span.startYear, endYear: span.endYear },
    systems: options.schedule.descriptor,
    maxTicksPerAdvance,
  });
  const versions: VersionStamp = Object.freeze({
    engineVersion: ENGINE_VERSION,
    contentVersion: options.contentVersion,
    configVersion: canonicalHash(config),
  });

  function envelope(state: { eventPosition: number }, command: Command, tick: number, draft: EventDraft): DomainEvent {
    const sequence = state.eventPosition;
    state.eventPosition += 1;
    return eventRegistry.parse({
      schemaVersion: 1,
      eventId: deriveId("event", worldId, sequence),
      type: draft.type,
      typeVersion: draft.typeVersion,
      worldId,
      sequence,
      instant: instantAt(span, tick),
      causationId: command.commandId,
      correlationId: command.correlationId,
      versions,
      payload: draft.payload,
    });
  }

  function apply(state: WorldState<S>, command: Command): Transition<S> {
    if (command.worldId !== state.worldId || state.worldId !== worldId) {
      return reject("wrong_world", `command targets ${command.worldId}, engine runs ${worldId}`);
    }
    if (canonicalHash(command.versions) !== canonicalHash(versions)) {
      return reject("version_mismatch", "command was issued under different engine/content/config versions");
    }
    if (command.expectedVersion !== null && command.expectedVersion !== state.version) {
      return reject("stale_version", `expected version ${command.expectedVersion}, world is at ${state.version}`);
    }
    if (!isConsistentInstant(span, command.instant)) {
      return reject("inconsistent_instant", "command instant does not match the calendar");
    }
    const cursor = { eventPosition: state.eventPosition };
    const next = (changes: Partial<Pick<WorldState<S>, "clock" | "status" | "data">>, events: DomainEvent[]) => ({
      accepted: true as const,
      state: { ...state, ...changes, version: state.version + 1, eventPosition: cursor.eventPosition },
      events,
    });

    switch (command.type) {
      case "world.pause": {
        if (state.status === "paused") return reject("already_paused", "world is already paused");
        const event = envelope(cursor, command, state.clock, {
          type: "world.paused",
          typeVersion: 1,
          payload: { reason: command.payload.reason },
        });
        return next({ status: "paused" }, [event]);
      }
      case "world.resume": {
        if (state.status !== "paused") return reject("not_paused", "world is not paused");
        const event = envelope(cursor, command, state.clock, {
          type: "world.resumed",
          typeVersion: 1,
          payload: { reason: command.payload.reason },
        });
        return next({ status: "running" }, [event]);
      }
      case "world.advance": {
        const { fromTick, toTick } = command.payload;
        if (state.status === "paused") return reject("world_paused", "world is paused");
        if (fromTick !== state.clock) {
          return reject("clock_mismatch", `advance starts at ${fromTick}, clock is at ${state.clock}`);
        }
        if (toTick > lastTick) return reject("beyond_end", `toTick ${toTick} is past the end tick ${lastTick}`);
        if (toTick - fromTick > maxTicksPerAdvance) {
          return reject(
            "too_many_ticks",
            `advance spans ${toTick - fromTick} ticks; the limit is ${maxTicksPerAdvance}`,
          );
        }
        const events: DomainEvent[] = [];
        let data = state.data;
        for (let tick = fromTick; tick < toTick; tick += 1) {
          const instant = instantAt(span, tick);
          for (const system of options.schedule.systems) {
            if (!runsAt(system.cadence, tick)) continue;
            const result = system.run(data, {
              worldId,
              tick,
              instant,
              random: root.stream("system", system.id, tick),
            });
            data = freezeWorldData(result.data);
            for (const draft of result.events) {
              if (draft.type.startsWith(KERNEL_EVENT_PREFIX)) {
                throw new Error(
                  `system ${system.id} emitted ${draft.type}; world.* events are reserved for the kernel`,
                );
              }
              events.push(envelope(cursor, command, tick, draft));
            }
          }
        }
        events.push(
          envelope(cursor, command, toTick, { type: "world.advanced", typeVersion: 1, payload: { fromTick, toTick } }),
        );
        return next({ clock: toTick, data }, events);
      }
    }
  }

  return Object.freeze({
    worldId,
    span,
    endTick: lastTick,
    versions,
    config,
    initialState: (data: S): WorldState<S> => ({
      schemaVersion: WORLD_STATE_SCHEMA_VERSION,
      worldId,
      clock: 0,
      status: "running",
      version: 0,
      eventPosition: 0,
      data: freezeWorldData(data),
    }),
    apply,
    checkpoint(state: WorldState<S>): Checkpoint {
      return parseContract("checkpoint", checkpointSchema, {
        schemaVersion: 1,
        checkpointId: deriveId("checkpoint", worldId, state.eventPosition, state.clock),
        worldId,
        instant: instantAt(span, state.clock),
        eventPosition: state.eventPosition,
        stateHash: canonicalHash(state),
        versions,
      });
    },
  });
}

export interface ReplayResult<S> {
  readonly state: WorldState<S>;
  readonly events: readonly DomainEvent[];
  readonly rejections: readonly { readonly commandId: string; readonly rejection: Rejection }[];
}

/** Fold an ordered command stream through the engine (replay and tests). */
export function replay<S>(engine: Engine<S>, initial: WorldState<S>, commands: readonly Command[]): ReplayResult<S> {
  let state = initial;
  const events: DomainEvent[] = [];
  const rejections: { commandId: string; rejection: Rejection }[] = [];
  for (const command of commands) {
    const result = engine.apply(state, command);
    if (result.accepted) {
      state = result.state;
      events.push(...result.events);
    } else {
      rejections.push({ commandId: command.commandId, rejection: result.rejection });
    }
  }
  return { state, events, rejections };
}
