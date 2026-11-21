import { z } from "zod";

/**
 * Stable identifiers are `<prefix>_<body>`: a fixed three-letter kind prefix
 * and 8–64 lowercase base-36 characters. The prefix makes an ID's kind
 * self-describing in logs and prevents passing, say, an event ID where a
 * world ID is expected. Generation (deterministic streams) belongs to the
 * engine; this module only defines and validates the format.
 *
 * Prefixes are part of the persisted format: never change or reuse one.
 */
export const ID_PREFIXES = Object.freeze({
  world: "wld",
  season: "ssn",
  command: "cmd",
  event: "evt",
  checkpoint: "chk",
  operator: "opr",
  proposal: "prp",
  source: "src",
  review: "rvw",
  region: "rgn",
  waterBody: "wbd",
  person: "per",
  household: "hhd",
  settlement: "stl",
} as const);

export type IdKind = keyof typeof ID_PREFIXES;

const ID_BODY = "[0-9a-z]{8,64}";

export function idPattern(kind: IdKind): RegExp {
  return new RegExp(`^${ID_PREFIXES[kind]}_${ID_BODY}$`);
}

function idString(kind: IdKind) {
  return z
    .string()
    .regex(idPattern(kind), `must be a ${kind} ID: "${ID_PREFIXES[kind]}_" followed by 8–64 characters [0-9a-z]`);
}

export const worldIdSchema = idString("world").brand<"WorldId">();
export const seasonIdSchema = idString("season").brand<"SeasonId">();
export const commandIdSchema = idString("command").brand<"CommandId">();
export const eventIdSchema = idString("event").brand<"EventId">();
export const checkpointIdSchema = idString("checkpoint").brand<"CheckpointId">();
export const operatorIdSchema = idString("operator").brand<"OperatorId">();
export const proposalIdSchema = idString("proposal").brand<"ProposalId">();
export const sourceIdSchema = idString("source").brand<"SourceId">();
export const reviewIdSchema = idString("review").brand<"ReviewId">();

export type WorldId = z.output<typeof worldIdSchema>;
export type SeasonId = z.output<typeof seasonIdSchema>;
export type CommandId = z.output<typeof commandIdSchema>;
export type EventId = z.output<typeof eventIdSchema>;
export type CheckpointId = z.output<typeof checkpointIdSchema>;
export type OperatorId = z.output<typeof operatorIdSchema>;
export type ProposalId = z.output<typeof proposalIdSchema>;
export type SourceId = z.output<typeof sourceIdSchema>;
export type ReviewId = z.output<typeof reviewIdSchema>;

/** A causation reference: the command or event that caused a message. */
export const messageIdSchema = z.union([commandIdSchema, eventIdSchema]);
export type MessageId = z.output<typeof messageIdSchema>;

/**
 * Correlation IDs group every message, request and log line of one logical
 * operation. They may originate outside the system (an inbound HTTP header),
 * so the format is a short, log-safe token rather than a prefixed ID.
 */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const correlationIdSchema = z.string().regex(CORRELATION_ID_PATTERN, "must be 1–128 characters [A-Za-z0-9._:-]");
export type CorrelationId = z.output<typeof correlationIdSchema>;

/** Client-chosen idempotency keys; one effect per (world, key). */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9._:-]{8,128}$/, "must be 8–128 characters [A-Za-z0-9._:-]");
export type IdempotencyKey = z.output<typeof idempotencyKeySchema>;
