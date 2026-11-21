import {
  checkpointSchema,
  commandRegistry,
  eventRegistry,
  LEDGER_APPENDED_TOPIC,
  LEDGER_NOTIFICATION_SCHEMA_VERSION,
  parseContract,
  type Checkpoint,
  type Command,
  type Digest,
  type DomainEvent,
  type LedgerNotification,
} from "@civ/contracts";
import type pg from "pg";
import { canonicalDigest } from "./digest.js";
import {
  IdempotencyConflictError,
  LedgerIntegrityError,
  constraintOf,
  sqlState,
  StaleWriteError,
  UNIQUE_VIOLATION,
  UnknownWorldError,
} from "./errors.js";
import { toSafeInt, withTransaction, type Queryable } from "./transaction.js";
import {
  appendAudit,
  insertCheckpoint,
  mapWorldState,
  verifyState,
  WORLD_STATE_COLUMNS,
  type PersistedWorldState,
} from "./worlds.js";

export interface Rejection {
  readonly code: string;
  readonly message: string;
}

/** What the engine decided for a command, computed from `basedOn`. */
export type CommandOutcome =
  | {
      readonly accepted: true;
      readonly state: PersistedWorldState;
      readonly stateHash: Digest;
      readonly events: readonly DomainEvent[];
      /** Checkpoint of `state`, when the caller's policy takes one. */
      readonly checkpoint?: Checkpoint;
    }
  | { readonly accepted: false; readonly rejection: Rejection };

export interface CommitCommandInput {
  readonly command: Command;
  /** Version and ledger position of the state the outcome was computed from. */
  readonly basedOn: { readonly version: number; readonly eventPosition: number };
  readonly outcome: CommandOutcome;
}

/** One processed command as recorded in `civ.command_log`. */
export interface CommandRecord {
  readonly worldId: string;
  readonly position: number;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly requestDigest: Digest;
  readonly type: string;
  readonly outcome: "accepted" | "rejected";
  readonly rejection: Rejection | null;
  /** Ledger range `[eventFrom, eventTo)` the command produced. */
  readonly eventFrom: number;
  readonly eventTo: number;
}

export type CommitResult =
  /** This call recorded the command and its effects. */
  | { readonly status: "committed"; readonly record: CommandRecord }
  /** The (world, idempotency key) was already recorded; nothing was written. */
  | { readonly status: "duplicate"; readonly record: CommandRecord };

/**
 * Digest identifying a request independent of delivery: the command without
 * `commandId`, `issuedAt` and `correlationId` (transport/tracing metadata a
 * client retry may re-mint). Any change of intent — type, payload, actor,
 * instant, expected version, causation or versions — makes a different digest.
 */
export function requestDigest(command: Command): Digest {
  const { commandId: _commandId, issuedAt: _issuedAt, correlationId: _correlationId, ...intent } = command;
  return canonicalDigest(intent);
}

/** `ledger.<worldId>.<toPosition>`: stable outbox key and BullMQ job ID (no `:`). */
export function ledgerMessageKey(worldId: string, toPosition: number): string {
  return `ledger.${worldId}.${toPosition}`;
}

interface CommandRow {
  world_id: string;
  position: string;
  command_id: string;
  idempotency_key: string;
  request_digest: string;
  type: string;
  outcome: "accepted" | "rejected";
  rejection_code: string | null;
  rejection_message: string | null;
  event_from: string;
  event_to: string;
}

function mapCommandRecord(row: CommandRow): CommandRecord {
  return {
    worldId: row.world_id,
    position: toSafeInt(row.position, "position"),
    commandId: row.command_id,
    idempotencyKey: row.idempotency_key,
    requestDigest: row.request_digest,
    type: row.type,
    outcome: row.outcome,
    rejection: row.rejection_code === null ? null : { code: row.rejection_code, message: row.rejection_message ?? "" },
    eventFrom: toSafeInt(row.event_from, "event_from"),
    eventTo: toSafeInt(row.event_to, "event_to"),
  };
}

const COMMAND_COLUMNS =
  "world_id, position, command_id, idempotency_key, request_digest, type, outcome, rejection_code, rejection_message, event_from, event_to";

/** Check an accepted outcome against the state it claims to follow. Throws on any defect. */
function verifyAcceptedOutcome(
  command: Command,
  basedOn: CommitCommandInput["basedOn"],
  outcome: Extract<CommandOutcome, { accepted: true }>,
): { state: PersistedWorldState; events: DomainEvent[] } {
  const state = verifyState(outcome.state, outcome.stateHash, "outcome state");
  const events = outcome.events.map((event) => eventRegistry.parse(event));
  if (state.worldId !== command.worldId) throw new LedgerIntegrityError("outcome state belongs to another world");
  if (state.version !== basedOn.version + 1) {
    throw new LedgerIntegrityError(`outcome version ${state.version} does not follow ${basedOn.version}`);
  }
  if (state.eventPosition !== basedOn.eventPosition + events.length) {
    throw new LedgerIntegrityError("outcome event position does not equal the base position plus its events");
  }
  events.forEach((event, index) => {
    if (event.worldId !== command.worldId) throw new LedgerIntegrityError(`event ${event.eventId} is of another world`);
    if (event.sequence !== basedOn.eventPosition + index) {
      throw new LedgerIntegrityError(
        `event ${event.eventId} has sequence ${event.sequence}, expected ${basedOn.eventPosition + index}`,
      );
    }
    if (event.causationId !== command.commandId) {
      throw new LedgerIntegrityError(`event ${event.eventId} is not caused by command ${command.commandId}`);
    }
  });
  if (outcome.checkpoint !== undefined) {
    const checkpoint = parseContract("checkpoint", checkpointSchema, outcome.checkpoint);
    if (
      checkpoint.worldId !== command.worldId ||
      checkpoint.eventPosition !== state.eventPosition ||
      checkpoint.stateHash !== outcome.stateHash
    ) {
      throw new LedgerIntegrityError("checkpoint does not describe the outcome state");
    }
  }
  return { state, events };
}

async function insertEvents(client: pg.PoolClient, events: readonly DomainEvent[], commandPosition: number) {
  if (events.length === 0) return;
  await client.query(
    `INSERT INTO civ.domain_events
       (world_id, sequence, event_id, type, type_version, tick, year, day_of_year, causation_id, correlation_id,
        command_position, engine_version, content_version, config_version, payload)
     SELECT w, s, e, t, tv, tk, y, d, ca, co, $11, ev, cv, fv, p::jsonb
       FROM unnest($1::text[], $2::bigint[], $3::text[], $4::text[], $5::int[], $6::bigint[], $7::int[],
                   $8::smallint[], $9::text[], $10::text[], $12::text[], $13::text[], $14::text[], $15::text[])
         AS x(w, s, e, t, tv, tk, y, d, ca, co, ev, cv, fv, p)`,
    [
      events.map((e) => e.worldId),
      events.map((e) => e.sequence),
      events.map((e) => e.eventId),
      events.map((e) => e.type),
      events.map((e) => e.typeVersion),
      events.map((e) => e.instant.tick),
      events.map((e) => e.instant.year),
      events.map((e) => e.instant.dayOfYear),
      events.map((e) => e.causationId),
      events.map((e) => e.correlationId),
      commandPosition,
      events.map((e) => e.versions.engineVersion),
      events.map((e) => e.versions.contentVersion),
      events.map((e) => e.versions.configVersion),
      events.map((e) => JSON.stringify(e.payload)),
    ],
  );
}

/**
 * Record one processed command and all its effects in a single transaction:
 *
 * 1. lock the world's current-state row (serialises writers of one world);
 * 2. if the (world, idempotency key) is already recorded, return it unchanged
 *    (`duplicate`), or fail with `IdempotencyConflictError` if the same key
 *    carried a different request;
 * 3. reject a stale writer (`StaleWriteError`) whose outcome was computed from
 *    another version/position than the current one;
 * 4. append the command log row, the events, the new current state, the
 *    optional checkpoint, the outbox notification and (for operator commands)
 *    an audit row.
 *
 * Any failure rolls the whole transaction back: no command, event, state,
 * checkpoint or outbox row is left behind.
 */
export async function commitCommand(pool: pg.Pool, input: CommitCommandInput): Promise<CommitResult> {
  const command = commandRegistry.parse(input.command);
  const digest = requestDigest(command);
  const verified = input.outcome.accepted ? verifyAcceptedOutcome(command, input.basedOn, input.outcome) : null;

  try {
    return await withTransaction(pool, async (client) => {
      const current = await client.query(
        `SELECT ${WORLD_STATE_COLUMNS} FROM civ.world_state WHERE world_id = $1 FOR UPDATE`,
        [command.worldId],
      );
      if (current.rows[0] === undefined) throw new UnknownWorldError(`world ${command.worldId} does not exist`);
      const world = mapWorldState(current.rows[0]);

      const existing = await client.query<CommandRow>(
        `SELECT ${COMMAND_COLUMNS} FROM civ.command_log WHERE world_id = $1 AND idempotency_key = $2`,
        [command.worldId, command.idempotencyKey],
      );
      if (existing.rows[0] !== undefined) {
        const record = mapCommandRecord(existing.rows[0]);
        if (record.requestDigest !== digest) {
          throw new IdempotencyConflictError(
            `idempotency key ${command.idempotencyKey} was already used for a different request`,
          );
        }
        return { status: "duplicate" as const, record };
      }

      if (world.state.version !== input.basedOn.version || world.state.eventPosition !== input.basedOn.eventPosition) {
        throw new StaleWriteError(
          `world ${command.worldId} is at version ${world.state.version}/position ${world.state.eventPosition}; ` +
            `outcome was computed from ${input.basedOn.version}/${input.basedOn.eventPosition}`,
        );
      }

      const position = world.commandPosition;
      const eventFrom = world.state.eventPosition;
      const eventTo = verified === null ? eventFrom : verified.state.eventPosition;
      const rejection = input.outcome.accepted ? null : input.outcome.rejection;
      const inserted = await client.query<CommandRow>(
        `INSERT INTO civ.command_log
           (world_id, position, command_id, idempotency_key, request_digest, type, command, outcome,
            rejection_code, rejection_message, event_from, event_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${COMMAND_COLUMNS}`,
        [
          command.worldId,
          position,
          command.commandId,
          command.idempotencyKey,
          digest,
          command.type,
          JSON.stringify(command),
          rejection === null ? "accepted" : "rejected",
          rejection?.code ?? null,
          rejection?.message ?? null,
          eventFrom,
          eventTo,
        ],
      );
      const record = mapCommandRecord(inserted.rows[0] as CommandRow);

      if (verified === null) {
        await client.query(
          "UPDATE civ.world_state SET command_position = command_position + 1, updated_at = now() WHERE world_id = $1",
          [command.worldId],
        );
      } else {
        const outcome = input.outcome as Extract<CommandOutcome, { accepted: true }>;
        await insertEvents(client, verified.events, position);
        await client.query(
          `UPDATE civ.world_state
              SET clock = $2, status = $3, version = $4, event_position = $5, command_position = command_position + 1,
                  data = $6, state_hash = $7, versions = $8, updated_at = now()
            WHERE world_id = $1`,
          [
            command.worldId,
            verified.state.clock,
            verified.state.status,
            verified.state.version,
            verified.state.eventPosition,
            JSON.stringify(verified.state.data),
            outcome.stateHash,
            JSON.stringify(command.versions),
          ],
        );
        if (outcome.checkpoint !== undefined) await insertCheckpoint(client, outcome.checkpoint, verified.state);
        if (eventTo > eventFrom) {
          const notification: LedgerNotification = {
            schemaVersion: LEDGER_NOTIFICATION_SCHEMA_VERSION,
            worldId: command.worldId,
            fromPosition: eventFrom,
            toPosition: eventTo,
          };
          await client.query(`INSERT INTO civ.outbox (message_key, topic, world_id, payload) VALUES ($1, $2, $3, $4)`, [
            ledgerMessageKey(command.worldId, eventTo),
            LEDGER_APPENDED_TOPIC,
            command.worldId,
            JSON.stringify(notification),
          ]);
        }
      }

      if (command.actor.kind === "operator") {
        await appendAudit(client, {
          actor: command.actor,
          action: `command.${command.type}`,
          worldId: command.worldId,
          subjectId: command.commandId,
          correlationId: command.correlationId,
          reason:
            "reason" in command.payload && typeof command.payload.reason === "string" ? command.payload.reason : null,
          details: { position, outcome: record.outcome, rejection, eventFrom, eventTo },
        });
      }
      return { status: "committed" as const, record };
    });
  } catch (error) {
    if (sqlState(error) === UNIQUE_VIOLATION && constraintOf(error) === "command_log_command_id_key") {
      throw new IdempotencyConflictError(`command ${command.commandId} was already recorded`, { cause: error });
    }
    if (sqlState(error) === UNIQUE_VIOLATION) {
      // (world, key) and sequences are checked under the world lock, so any
      // other duplicate (event ID, checkpoint, outbox key) is an engine defect.
      throw new LedgerIntegrityError(`duplicate ledger identity (${constraintOf(error) ?? "unknown constraint"})`, {
        cause: error,
      });
    }
    throw error;
  }
}

// ---------------------------------------------------------------- reads

interface EventRow {
  world_id: string;
  sequence: string;
  event_id: string;
  type: string;
  type_version: number;
  tick: string;
  year: number;
  day_of_year: number;
  causation_id: string;
  correlation_id: string;
  engine_version: string;
  content_version: string;
  config_version: string;
  payload: unknown;
}

const EVENT_COLUMNS =
  "world_id, sequence, event_id, type, type_version, tick, year, day_of_year, causation_id, correlation_id, engine_version, content_version, config_version, payload";

/** Rebuild and validate the event envelope from its ledger row. */
function mapEvent(row: EventRow): DomainEvent {
  return eventRegistry.parse({
    schemaVersion: 1,
    eventId: row.event_id,
    type: row.type,
    typeVersion: row.type_version,
    worldId: row.world_id,
    sequence: toSafeInt(row.sequence, "sequence"),
    instant: { tick: toSafeInt(row.tick, "tick"), year: row.year, dayOfYear: row.day_of_year },
    causationId: row.causation_id,
    correlationId: row.correlation_id,
    versions: {
      engineVersion: row.engine_version,
      contentVersion: row.content_version,
      configVersion: row.config_version,
    },
    payload: row.payload,
  });
}

export const MAX_EVENT_PAGE = 5_000;

export interface EventPage {
  readonly events: readonly DomainEvent[];
  /** Cursor position after this page (`after` when the page is empty). */
  readonly nextPosition: number;
}

/**
 * Events with `sequence >= after`, in ledger order, at most `limit`. Pages
 * are stable: sequences are dense and immutable, so the same cursor always
 * yields the same events, and a gap is reported as an integrity failure.
 */
export async function readEvents(
  client: Queryable,
  input: { readonly worldId: string; readonly after: number; readonly limit: number },
): Promise<EventPage> {
  if (!Number.isSafeInteger(input.after) || input.after < 0)
    throw new RangeError("after must be a non-negative integer");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_EVENT_PAGE) {
    throw new RangeError(`limit must be an integer in 1–${MAX_EVENT_PAGE}`);
  }
  const result = await client.query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM civ.domain_events
      WHERE world_id = $1 AND sequence >= $2
      ORDER BY sequence LIMIT $3`,
    [input.worldId, input.after, input.limit],
  );
  const events = result.rows.map(mapEvent);
  events.forEach((event, index) => {
    if (event.sequence !== input.after + index) {
      throw new LedgerIntegrityError(`ledger of ${input.worldId} has a gap before sequence ${event.sequence}`);
    }
  });
  return { events, nextPosition: input.after + events.length };
}

/** One event by ID (archive citations), or null. */
export async function findEvent(client: Queryable, worldId: string, eventId: string): Promise<DomainEvent | null> {
  const result = await client.query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM civ.domain_events WHERE world_id = $1 AND event_id = $2`,
    [worldId, eventId],
  );
  return result.rows[0] === undefined ? null : mapEvent(result.rows[0]);
}

export interface LoggedCommand {
  readonly record: CommandRecord;
  readonly command: Command;
}

/** Recorded commands with `position >= after`, in log order (replay input). */
export async function readCommands(
  client: Queryable,
  input: { readonly worldId: string; readonly after: number; readonly limit: number },
): Promise<LoggedCommand[]> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_EVENT_PAGE) {
    throw new RangeError(`limit must be an integer in 1–${MAX_EVENT_PAGE}`);
  }
  const result = await client.query<CommandRow & { command: unknown }>(
    `SELECT ${COMMAND_COLUMNS}, command FROM civ.command_log
      WHERE world_id = $1 AND position >= $2 ORDER BY position LIMIT $3`,
    [input.worldId, input.after, input.limit],
  );
  return result.rows.map((row) => ({ record: mapCommandRecord(row), command: commandRegistry.parse(row.command) }));
}

/** The recorded outcome of an idempotency key, or null (API "already accepted?" lookups). */
export async function findCommandByKey(
  client: Queryable,
  worldId: string,
  idempotencyKey: string,
): Promise<CommandRecord | null> {
  const result = await client.query<CommandRow>(
    `SELECT ${COMMAND_COLUMNS} FROM civ.command_log WHERE world_id = $1 AND idempotency_key = $2`,
    [worldId, idempotencyKey],
  );
  return result.rows[0] === undefined ? null : mapCommandRecord(result.rows[0]);
}
