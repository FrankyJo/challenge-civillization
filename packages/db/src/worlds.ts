import {
  actorSchema,
  checkpointSchema,
  correlationIdSchema,
  parseContract,
  seasonRecordSchema,
  versionStampSchema,
  worldIdSchema,
  worldRecordSchema,
  type Actor,
  type Checkpoint,
  type Digest,
  type SeasonRecord,
  type SeasonStatus,
  type VersionStamp,
  type WorldRecord,
} from "@civ/contracts";
import type pg from "pg";
import { z } from "zod";
import { canonicalDigest } from "./digest.js";
import {
  AlreadyExistsError,
  LedgerIntegrityError,
  NotFoundError,
  sqlState,
  StaleWriteError,
  UNIQUE_VIOLATION,
  UnknownWorldError,
} from "./errors.js";
import { insertWorldMap, verifyWorldMap, type StoredWorldMap } from "./maps.js";
import { toIso, toSafeInt, withTransaction, type Queryable } from "./transaction.js";

export const WORLD_STATE_SCHEMA_VERSION = 1 as const;

/**
 * The kernel's `WorldState` as persisted: plain JSON whose canonical hash is
 * the state hash. `data` belongs to the simulation systems and is opaque here.
 */
export const persistedWorldStateSchema = z.strictObject({
  schemaVersion: z.literal(WORLD_STATE_SCHEMA_VERSION),
  worldId: worldIdSchema,
  clock: z.number().int().nonnegative(),
  status: z.enum(["running", "paused"]),
  version: z.number().int().nonnegative(),
  eventPosition: z.number().int().nonnegative(),
  data: z.unknown(),
});
export interface PersistedWorldState {
  readonly schemaVersion: typeof WORLD_STATE_SCHEMA_VERSION;
  readonly worldId: string;
  readonly clock: number;
  readonly status: "running" | "paused";
  readonly version: number;
  readonly eventPosition: number;
  readonly data: unknown;
}

/** Current state of a world plus store bookkeeping. */
export interface CurrentWorldState {
  readonly state: PersistedWorldState;
  readonly stateHash: Digest;
  /** Number of commands recorded; the next command's log position. */
  readonly commandPosition: number;
  /** Versions the current state was produced under. */
  readonly versions: VersionStamp;
}

export interface AuditEntry {
  readonly actor: Actor;
  readonly action: string;
  readonly worldId: string | null;
  readonly subjectId: string | null;
  readonly correlationId: string;
  readonly reason: string | null;
  readonly details: Readonly<Record<string, unknown>>;
}

/** Append one immutable audit row (inside the caller's transaction). */
export async function appendAudit(client: Queryable, entry: AuditEntry): Promise<void> {
  const actor = parseContract("audit actor", actorSchema, entry.actor);
  parseContract("correlation id", correlationIdSchema, entry.correlationId);
  await client.query(
    `INSERT INTO civ.audit_log (actor, action, world_id, subject_id, correlation_id, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      JSON.stringify(actor),
      entry.action,
      entry.worldId,
      entry.subjectId,
      entry.correlationId,
      entry.reason,
      JSON.stringify(entry.details),
    ],
  );
}

/** Verify a state against its claimed hash; returns the parsed state. */
export function verifyState(state: unknown, stateHash: string, label: string): PersistedWorldState {
  const parsed = parseContract(label, persistedWorldStateSchema, state) as PersistedWorldState;
  const actual = canonicalDigest(state);
  if (actual !== stateHash) {
    throw new LedgerIntegrityError(`${label}: state hash ${stateHash} does not match its canonical digest ${actual}`);
  }
  return parsed;
}

export interface CreateWorldInput {
  readonly world: WorldRecord;
  /** The engine's initial state (clock 0, version 0, no events). */
  readonly initialState: PersistedWorldState;
  readonly stateHash: Digest;
  /** Optional checkpoint of the initial state. */
  readonly checkpoint?: Checkpoint;
  /** The world's generated map and public snapshot (Phase 04); stored in the same transaction. */
  readonly map?: StoredWorldMap;
  readonly correlationId: string;
}

/**
 * Create a world atomically: identity row, ledger partition, initial current
 * state, optional initial checkpoint and an audit row.
 */
export async function createWorld(pool: pg.Pool, input: CreateWorldInput): Promise<void> {
  const world = parseContract("world record", worldRecordSchema, input.world);
  const state = verifyState(input.initialState, input.stateHash, "initial state");
  if (state.worldId !== world.worldId || state.clock !== 0 || state.version !== 0 || state.eventPosition !== 0) {
    throw new LedgerIntegrityError("initial state must belong to the world and be at clock 0, version 0, position 0");
  }
  const checkpoint =
    input.checkpoint === undefined ? undefined : parseContract("checkpoint", checkpointSchema, input.checkpoint);
  if (checkpoint !== undefined && (checkpoint.worldId !== world.worldId || checkpoint.eventPosition !== 0)) {
    throw new LedgerIntegrityError("initial checkpoint must be of this world at position 0");
  }
  if (checkpoint !== undefined && checkpoint.stateHash !== input.stateHash) {
    throw new LedgerIntegrityError("initial checkpoint hash does not match the initial state");
  }
  const map = input.map === undefined ? undefined : verifyWorldMap(input.map, "world map");
  if (map !== undefined && (map.document.worldId !== world.worldId || map.document.seed !== world.seed)) {
    throw new LedgerIntegrityError("the map must be generated for this world and its seed");
  }

  try {
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO civ.worlds
           (world_id, schema_version, name, seed, start_year, end_year, versions, created_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          world.worldId,
          world.schemaVersion,
          world.name,
          world.seed,
          world.startYear,
          world.endYear,
          JSON.stringify(world.versions),
          world.createdAt,
          JSON.stringify(world.createdBy),
        ],
      );
      await client.query("SELECT civ.ensure_event_partition($1)", [world.worldId]);
      if (map !== undefined) await insertWorldMap(client, map);
      await client.query(
        `INSERT INTO civ.world_state
           (world_id, schema_version, clock, status, version, event_position, command_position, data, state_hash, versions)
         VALUES ($1, $2, 0, $3, 0, 0, 0, $4, $5, $6)`,
        [
          world.worldId,
          state.schemaVersion,
          state.status,
          JSON.stringify(state.data),
          input.stateHash,
          JSON.stringify(world.versions),
        ],
      );
      if (checkpoint !== undefined) await insertCheckpoint(client, checkpoint, state);
      await appendAudit(client, {
        actor: world.createdBy,
        action: "world.created",
        worldId: world.worldId,
        subjectId: world.worldId,
        correlationId: input.correlationId,
        reason: null,
        details: {
          stateHash: input.stateHash,
          versions: world.versions,
          ...(map === undefined ? {} : { mapHash: map.document.mapHash, mapVersion: map.document.mapVersion }),
        },
      });
    });
  } catch (error) {
    if (sqlState(error) === UNIQUE_VIOLATION) {
      throw new AlreadyExistsError(`world ${world.worldId} already exists`, { cause: error });
    }
    throw error;
  }
}

/** Insert a checkpoint with its full state snapshot (inside a transaction). */
export async function insertCheckpoint(
  client: Queryable,
  checkpoint: Checkpoint,
  state: PersistedWorldState,
): Promise<void> {
  await client.query(
    `INSERT INTO civ.checkpoints
       (checkpoint_id, world_id, schema_version, event_position, tick, year, day_of_year, state_hash, versions, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      checkpoint.checkpointId,
      checkpoint.worldId,
      checkpoint.schemaVersion,
      checkpoint.eventPosition,
      checkpoint.instant.tick,
      checkpoint.instant.year,
      checkpoint.instant.dayOfYear,
      checkpoint.stateHash,
      JSON.stringify(checkpoint.versions),
      JSON.stringify(state),
    ],
  );
}

interface WorldRow {
  world_id: string;
  schema_version: number;
  name: string;
  seed: string;
  start_year: number;
  end_year: number;
  versions: unknown;
  created_at: Date;
  created_by: unknown;
}

export async function getWorld(client: Queryable, worldId: string): Promise<WorldRecord | null> {
  const result = await client.query<WorldRow>("SELECT * FROM civ.worlds WHERE world_id = $1", [worldId]);
  const row = result.rows[0];
  if (row === undefined) return null;
  return parseContract("world record", worldRecordSchema, {
    schemaVersion: row.schema_version,
    worldId: row.world_id,
    name: row.name,
    seed: row.seed,
    startYear: row.start_year,
    endYear: row.end_year,
    versions: row.versions,
    createdAt: toIso(row.created_at, "created_at"),
    createdBy: row.created_by,
  });
}

interface WorldStateRow {
  world_id: string;
  schema_version: number;
  clock: string;
  status: string;
  version: string;
  event_position: string;
  command_position: string;
  data: unknown;
  state_hash: string;
  versions: unknown;
}

/** Map a `civ.world_state` row, verifying its hash. */
export function mapWorldState(row: WorldStateRow): CurrentWorldState {
  const state = {
    schemaVersion: row.schema_version,
    worldId: row.world_id,
    clock: toSafeInt(row.clock, "clock"),
    status: row.status,
    version: toSafeInt(row.version, "version"),
    eventPosition: toSafeInt(row.event_position, "event_position"),
    data: row.data,
  };
  return {
    state: verifyState(state, row.state_hash, `world ${row.world_id} state`),
    stateHash: row.state_hash,
    commandPosition: toSafeInt(row.command_position, "command_position"),
    versions: parseContract("state versions", versionStampSchema, row.versions),
  };
}

export const WORLD_STATE_COLUMNS =
  "world_id, schema_version, clock, status, version, event_position, command_position, data, state_hash, versions";

/** Current state of a world, hash-verified. */
export async function loadWorldState(client: Queryable, worldId: string): Promise<CurrentWorldState> {
  const result = await client.query<WorldStateRow>(
    `SELECT ${WORLD_STATE_COLUMNS} FROM civ.world_state WHERE world_id = $1`,
    [worldId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new UnknownWorldError(`world ${worldId} does not exist`);
  return mapWorldState(row);
}

export interface StoredCheckpoint {
  readonly checkpoint: Checkpoint;
  readonly state: PersistedWorldState;
}

interface CheckpointRow {
  checkpoint_id: string;
  world_id: string;
  schema_version: number;
  event_position: string;
  tick: string;
  year: number;
  day_of_year: number;
  state_hash: string;
  versions: unknown;
  state: unknown;
}

/** Latest checkpoint at or before `atOrBefore` (default: latest), hash-verified. */
export async function latestCheckpoint(
  client: Queryable,
  worldId: string,
  atOrBefore: number = Number.MAX_SAFE_INTEGER,
): Promise<StoredCheckpoint | null> {
  const result = await client.query<CheckpointRow>(
    `SELECT * FROM civ.checkpoints
      WHERE world_id = $1 AND event_position <= $2
      ORDER BY event_position DESC LIMIT 1`,
    [worldId, atOrBefore],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const checkpoint = parseContract("checkpoint", checkpointSchema, {
    schemaVersion: row.schema_version,
    checkpointId: row.checkpoint_id,
    worldId: row.world_id,
    instant: { tick: toSafeInt(row.tick, "tick"), year: row.year, dayOfYear: row.day_of_year },
    eventPosition: toSafeInt(row.event_position, "event_position"),
    stateHash: row.state_hash,
    versions: row.versions,
  });
  const state = verifyState(row.state, checkpoint.stateHash, `checkpoint ${checkpoint.checkpointId}`);
  if (state.eventPosition !== checkpoint.eventPosition || state.worldId !== worldId) {
    throw new LedgerIntegrityError(`checkpoint ${checkpoint.checkpointId} metadata does not match its state`);
  }
  return { checkpoint, state };
}

// ---------------------------------------------------------------- seasons

interface SeasonRow {
  season_id: string;
  world_id: string;
  number: number;
  status: string;
  starts_at: Date;
  ends_at: Date;
  status_note: string | null;
  updated_at: Date;
  updated_by: unknown;
  revision: number;
}

export interface StoredSeason {
  readonly season: SeasonRecord;
  /** Optimistic-concurrency revision; incremented by every update. */
  readonly revision: number;
}

function mapSeason(row: SeasonRow): StoredSeason {
  return {
    season: parseContract("season record", seasonRecordSchema, {
      schemaVersion: 1,
      seasonId: row.season_id,
      worldId: row.world_id,
      number: row.number,
      status: row.status,
      startsAt: toIso(row.starts_at, "starts_at"),
      endsAt: toIso(row.ends_at, "ends_at"),
      statusNote: row.status_note,
      updatedAt: toIso(row.updated_at, "updated_at"),
      updatedBy: row.updated_by,
    }),
    revision: row.revision,
  };
}

export async function createSeason(
  pool: pg.Pool,
  input: { readonly season: SeasonRecord; readonly correlationId: string; readonly reason: string | null },
): Promise<StoredSeason> {
  const season = parseContract("season record", seasonRecordSchema, input.season);
  try {
    return await withTransaction(pool, async (client) => {
      const result = await client.query<SeasonRow>(
        `INSERT INTO civ.seasons
           (season_id, world_id, number, status, starts_at, ends_at, status_note, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          season.seasonId,
          season.worldId,
          season.number,
          season.status,
          season.startsAt,
          season.endsAt,
          season.statusNote,
          season.updatedAt,
          JSON.stringify(season.updatedBy),
        ],
      );
      await appendAudit(client, {
        actor: season.updatedBy,
        action: "season.created",
        worldId: season.worldId,
        subjectId: season.seasonId,
        correlationId: input.correlationId,
        reason: input.reason,
        details: { number: season.number, status: season.status, startsAt: season.startsAt, endsAt: season.endsAt },
      });
      return mapSeason(result.rows[0] as SeasonRow);
    });
  } catch (error) {
    if (sqlState(error) === UNIQUE_VIOLATION) {
      throw new AlreadyExistsError(`season ${season.seasonId} or number ${season.number} already exists`, {
        cause: error,
      });
    }
    throw error;
  }
}

export async function getSeason(client: Queryable, seasonId: string): Promise<StoredSeason | null> {
  const result = await client.query<SeasonRow>("SELECT * FROM civ.seasons WHERE season_id = $1", [seasonId]);
  return result.rows[0] === undefined ? null : mapSeason(result.rows[0]);
}

export async function listSeasons(client: Queryable, worldId: string): Promise<StoredSeason[]> {
  const result = await client.query<SeasonRow>("SELECT * FROM civ.seasons WHERE world_id = $1 ORDER BY number", [
    worldId,
  ]);
  return result.rows.map(mapSeason);
}

export interface SeasonChanges {
  readonly status?: SeasonStatus;
  readonly statusNote?: string | null;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

/**
 * Revision-checked season update with an audit row recording before/after.
 * Lifecycle transition rules belong to the runner (Phase 06); this enforces
 * the record contract and concurrency only.
 */
export async function updateSeason(
  pool: pg.Pool,
  input: {
    readonly seasonId: string;
    readonly expectedRevision: number;
    readonly changes: SeasonChanges;
    readonly actor: Actor;
    /** Wall-clock time of the change, supplied by the caller's clock port. */
    readonly at: string;
    readonly correlationId: string;
    readonly reason: string;
  },
): Promise<StoredSeason> {
  return withTransaction(pool, async (client) => {
    const current = await client.query<SeasonRow>("SELECT * FROM civ.seasons WHERE season_id = $1 FOR UPDATE", [
      input.seasonId,
    ]);
    const row = current.rows[0];
    if (row === undefined) throw new NotFoundError(`season ${input.seasonId} does not exist`);
    if (row.revision !== input.expectedRevision) {
      throw new StaleWriteError(
        `season ${input.seasonId} is at revision ${row.revision}, not ${input.expectedRevision}`,
      );
    }
    const before = mapSeason(row).season;
    const after = parseContract("season record", seasonRecordSchema, {
      ...before,
      ...input.changes,
      updatedAt: input.at,
      updatedBy: input.actor,
    });
    const updated = await client.query<SeasonRow>(
      `UPDATE civ.seasons
          SET status = $2, status_note = $3, starts_at = $4, ends_at = $5, updated_at = $6, updated_by = $7,
              revision = revision + 1
        WHERE season_id = $1
        RETURNING *`,
      [
        input.seasonId,
        after.status,
        after.statusNote,
        after.startsAt,
        after.endsAt,
        after.updatedAt,
        JSON.stringify(after.updatedBy),
      ],
    );
    await appendAudit(client, {
      actor: input.actor,
      action: "season.updated",
      worldId: after.worldId,
      subjectId: after.seasonId,
      correlationId: input.correlationId,
      reason: input.reason,
      details: {
        revision: row.revision + 1,
        before: {
          status: before.status,
          statusNote: before.statusNote,
          startsAt: before.startsAt,
          endsAt: before.endsAt,
        },
        after: { status: after.status, statusNote: after.statusNote, startsAt: after.startsAt, endsAt: after.endsAt },
      },
    });
    return mapSeason(updated.rows[0] as SeasonRow);
  });
}
