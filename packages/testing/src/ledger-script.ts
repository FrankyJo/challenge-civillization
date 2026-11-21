import { createHash } from "node:crypto";
import {
  canonicalBytes,
  commandRegistry,
  eventRegistry,
  type Actor,
  type Checkpoint,
  type Command,
  type DomainEvent,
  type SimulationInstant,
  type VersionStamp,
  type WorldRecord,
} from "@civ/contracts";
import { createContractBuilders, type ContractBuilders } from "./builders.js";

/** Plain persisted world state, structurally identical to the kernel's `WorldState`. */
export interface ScriptState {
  readonly schemaVersion: 1;
  readonly worldId: string;
  readonly clock: number;
  readonly status: "running" | "paused";
  readonly version: number;
  readonly eventPosition: number;
  readonly data: { readonly ticks: number; readonly note: string };
}

/** Shaped like `@civ/db`'s `CommitCommandInput` (testing cannot import db). */
export interface ScriptStep {
  readonly command: Command;
  readonly basedOn: { readonly version: number; readonly eventPosition: number };
  readonly outcome: {
    readonly accepted: true;
    readonly state: ScriptState;
    readonly stateHash: string;
    readonly events: readonly DomainEvent[];
    readonly checkpoint?: Checkpoint;
  };
}

export function digestOf(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalBytes(value)).digest("hex")}`;
}

/** 365-day calendar instant of a tick (matches the kernel's `civ365-daily-v1`). */
export function scriptInstant(tick: number): SimulationInstant {
  return { tick, year: 1 + Math.floor(tick / 365), dayOfYear: (tick % 365) + 1 };
}

/**
 * Deterministic stand-in for the engine in persistence tests: produces
 * contract-valid, hash-consistent world.pause/resume/advance transitions
 * without depending on the domain package. `commit(step)` must be called
 * after the store accepted a step so the script follows the stored state.
 */
export class LedgerScript {
  readonly builders: ContractBuilders;
  readonly world: WorldRecord;
  readonly versions: VersionStamp;
  private current: ScriptState;
  private commandCounter = 0;

  constructor(options: { readonly worldId?: string } = {}) {
    this.builders = createContractBuilders(options.worldId === undefined ? {} : { worldId: options.worldId });
    this.world = this.builders.world();
    this.versions = this.world.versions;
    this.current = {
      schemaVersion: 1,
      worldId: this.world.worldId,
      clock: 0,
      status: "running",
      version: 0,
      eventPosition: 0,
      data: { ticks: 0, note: "genesis" },
    };
  }

  get state(): ScriptState {
    return this.current;
  }

  get stateHash(): string {
    return digestOf(this.current);
  }

  /** Accept a step's outcome as the new current state. */
  commit(step: ScriptStep): void {
    this.current = step.outcome.state;
  }

  private command(type: Command["type"], payload: unknown, overrides: Readonly<Record<string, unknown>>): Command {
    this.commandCounter += 1;
    // Unique across worlds: command IDs are globally unique in the command log.
    const commandId = `cmd_${this.world.worldId.slice(4)}${this.commandCounter.toString(36).padStart(4, "0")}`.slice(
      0,
      68,
    );
    const actor = { kind: "operator", operatorId: "opr_00000000" } as Actor;
    return commandRegistry.parse({
      schemaVersion: 1,
      commandId,
      type,
      typeVersion: 1,
      worldId: this.world.worldId,
      instant: scriptInstant(this.current.clock),
      issuedAt: "2027-01-01T00:00:00.000Z",
      actor,
      idempotencyKey: `key-${commandId}`,
      expectedVersion: null,
      causationId: null,
      correlationId: `corr-${commandId}`,
      versions: this.versions,
      payload,
      ...overrides,
    });
  }

  private event(command: Command, sequence: number, tick: number, type: string, payload: unknown): DomainEvent {
    return eventRegistry.parse({
      schemaVersion: 1,
      eventId: `evt_${this.world.worldId.slice(4)}${sequence.toString(36).padStart(6, "0")}`.slice(0, 68),
      type,
      typeVersion: 1,
      worldId: this.world.worldId,
      sequence,
      instant: scriptInstant(tick),
      causationId: command.commandId,
      correlationId: command.correlationId,
      versions: this.versions,
      payload,
    });
  }

  private step(
    command: Command,
    next: Omit<ScriptState, "version" | "eventPosition" | "schemaVersion" | "worldId">,
    events: (seq: number) => DomainEvent[],
    checkpoint: boolean,
  ): ScriptStep {
    const base = this.current;
    const produced = events(base.eventPosition);
    const state: ScriptState = {
      schemaVersion: 1,
      worldId: base.worldId,
      ...next,
      version: base.version + 1,
      eventPosition: base.eventPosition + produced.length,
    };
    const stateHash = digestOf(state);
    return {
      command,
      basedOn: { version: base.version, eventPosition: base.eventPosition },
      outcome: {
        accepted: true,
        state,
        stateHash,
        events: produced,
        ...(checkpoint
          ? {
              checkpoint: {
                schemaVersion: 1,
                checkpointId: `chk_${digestOf([state.worldId, state.eventPosition]).slice(7, 23)}`,
                worldId: state.worldId,
                instant: scriptInstant(state.clock),
                eventPosition: state.eventPosition,
                stateHash,
                versions: this.versions,
              } as Checkpoint,
            }
          : {}),
      },
    };
  }

  pause(overrides: Readonly<Record<string, unknown>> = {}): ScriptStep {
    const command = this.command("world.pause", { reason: "maintenance" }, overrides);
    const base = this.current;
    return this.step(
      command,
      { clock: base.clock, status: "paused", data: base.data },
      (seq) => [this.event(command, seq, base.clock, "world.paused", { reason: "maintenance" })],
      false,
    );
  }

  resume(overrides: Readonly<Record<string, unknown>> = {}): ScriptStep {
    const command = this.command("world.resume", { reason: "done" }, overrides);
    const base = this.current;
    return this.step(
      command,
      { clock: base.clock, status: "running", data: base.data },
      (seq) => [this.event(command, seq, base.clock, "world.resumed", { reason: "done" })],
      false,
    );
  }

  advance(
    ticks: number,
    options: { readonly checkpoint?: boolean; readonly overrides?: Readonly<Record<string, unknown>> } = {},
  ): ScriptStep {
    const base = this.current;
    const toTick = base.clock + ticks;
    const command = this.command(
      "world.advance",
      { fromTick: base.clock, toTick },
      { actor: { kind: "system", component: "scheduler" }, ...options.overrides },
    );
    return this.step(
      command,
      { clock: toTick, status: base.status, data: { ticks: base.data.ticks + ticks, note: `t${toTick}` } },
      (seq) => [this.event(command, seq, toTick, "world.advanced", { fromTick: base.clock, toTick })],
      options.checkpoint ?? false,
    );
  }
}
