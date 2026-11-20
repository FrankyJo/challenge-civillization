import {
  commandRegistry,
  eventRegistry,
  ID_PREFIXES,
  parseContract,
  seasonRecordSchema,
  simulationInstantSchema,
  versionStampSchema,
  worldRecordSchema,
  type Command,
  type DomainEvent,
  type IdKind,
  type SeasonRecord,
  type SimulationInstant,
  type VersionStamp,
  type WorldRecord,
} from "@civ/contracts";

/**
 * Deterministic builders for contract values in tests.
 *
 * Every value is produced by the production parsers, so an override that
 * violates a contract throws instead of yielding an object production would
 * reject. IDs come from a per-builder counter (no randomness, no clock), so
 * the same sequence of calls always produces the same values.
 */
export interface ContractBuilders {
  /** Next ID of a kind: `<prefix>_` + zero-padded base-36 counter. */
  id(kind: IdKind): string;
  versions(overrides?: Partial<VersionStamp>): VersionStamp;
  instant(overrides?: Partial<SimulationInstant>): SimulationInstant;
  world(overrides?: Readonly<Record<string, unknown>>): WorldRecord;
  season(overrides?: Readonly<Record<string, unknown>>): SeasonRecord;
  /** A command envelope; `type`/`payload` default to a valid world.pause. */
  command(overrides?: Readonly<Record<string, unknown>>): Command;
  /** An event envelope; `type`/`payload` default to a valid world.paused. */
  event(overrides?: Readonly<Record<string, unknown>>): DomainEvent;
}

export const TEST_DIGEST_A = `sha256:${"a".repeat(64)}`;
export const TEST_DIGEST_B = `sha256:${"b".repeat(64)}`;
const FIXED_TIME = "2027-01-01T00:00:00.000Z";

export function createContractBuilders(options: { readonly worldId?: string } = {}): ContractBuilders {
  let counter = 0;
  const id = (kind: IdKind) => `${ID_PREFIXES[kind]}_${(++counter).toString(36).padStart(8, "0")}`;
  const worldId = options.worldId ?? id("world");
  const operator = { kind: "operator", operatorId: "opr_00000000" } as const;

  const versions = (overrides: Partial<VersionStamp> = {}) =>
    parseContract("version stamp", versionStampSchema, {
      engineVersion: "0.1.0",
      contentVersion: TEST_DIGEST_A,
      configVersion: TEST_DIGEST_B,
      ...overrides,
    });

  const instant = (overrides: Partial<SimulationInstant> = {}) =>
    parseContract("simulation instant", simulationInstantSchema, { tick: 0, year: 1, dayOfYear: 1, ...overrides });

  return {
    id,
    versions,
    instant,
    world: (overrides = {}) =>
      parseContract("world record", worldRecordSchema, {
        schemaVersion: 1,
        worldId,
        name: "Test World",
        seed: "0123456789abcdef",
        startYear: 1,
        endYear: 2026,
        versions: versions(),
        createdAt: FIXED_TIME,
        createdBy: operator,
        ...overrides,
      }),
    season: (overrides = {}) =>
      parseContract("season record", seasonRecordSchema, {
        schemaVersion: 1,
        seasonId: id("season"),
        worldId,
        number: 1,
        status: "scheduled",
        startsAt: FIXED_TIME,
        endsAt: "2027-01-31T00:00:00.000Z",
        statusNote: null,
        updatedAt: FIXED_TIME,
        updatedBy: operator,
        ...overrides,
      }),
    command: (overrides = {}) => {
      const commandId = id("command");
      return commandRegistry.parse({
        schemaVersion: 1,
        commandId,
        type: "world.pause",
        typeVersion: 1,
        worldId,
        instant: instant(),
        issuedAt: FIXED_TIME,
        actor: operator,
        idempotencyKey: `test-${commandId}`,
        expectedVersion: null,
        causationId: null,
        correlationId: `corr-${commandId}`,
        versions: versions(),
        payload: { reason: "test" },
        ...overrides,
      });
    },
    event: (overrides = {}) => {
      const eventId = id("event");
      return eventRegistry.parse({
        schemaVersion: 1,
        eventId,
        type: "world.paused",
        typeVersion: 1,
        worldId,
        sequence: 0,
        instant: instant(),
        causationId: "cmd_00000000",
        correlationId: `corr-${eventId}`,
        versions: versions(),
        payload: { reason: "test" },
        ...overrides,
      });
    },
  };
}
