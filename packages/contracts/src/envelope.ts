import { z } from "zod";
import { actorSchema, type ActorKind } from "./actor.js";
import {
  commandIdSchema,
  correlationIdSchema,
  eventIdSchema,
  idempotencyKeySchema,
  messageIdSchema,
  worldIdSchema,
} from "./ids.js";
import { simulationInstantSchema, utcTimestampSchema } from "./time.js";
import { ContractValidationError, issuesFromZod, type ContractResult } from "./validation.js";
import { versionStampSchema } from "./versions.js";

/** Version of the envelope wire format itself (not of any payload). */
export const ENVELOPE_SCHEMA_VERSION = 1 as const;

/** Dotted lowercase message type, e.g. `world.pause`. */
export const messageTypeSchema = z
  .string()
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/, "must be a dotted lowercase name, e.g. world.pause");

/** Payload version of one message type; bumped on any non-additive change. */
export const typeVersionSchema = z.number().int().min(1).max(1000);

/**
 * Audit fields every command carries. `causationId` is null only for
 * commands that originate outside the system (operator, scheduler).
 * `issuedAt` records arrival wall time; transitions use `instant` only.
 */
const commandEnvelopeShape = {
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION),
  commandId: commandIdSchema,
  type: messageTypeSchema,
  typeVersion: typeVersionSchema,
  worldId: worldIdSchema,
  instant: simulationInstantSchema,
  issuedAt: utcTimestampSchema,
  actor: actorSchema,
  idempotencyKey: idempotencyKeySchema,
  expectedVersion: z.number().int().nonnegative().nullable(),
  causationId: messageIdSchema.nullable(),
  correlationId: correlationIdSchema,
  versions: versionStampSchema,
};

/**
 * Audit fields every domain event carries. Events contain no wall-clock
 * time: replaying the same inputs must reproduce them byte for byte.
 * `sequence` is the event's position in the world's append-only ledger.
 */
const eventEnvelopeShape = {
  schemaVersion: z.literal(ENVELOPE_SCHEMA_VERSION),
  eventId: eventIdSchema,
  type: messageTypeSchema,
  typeVersion: typeVersionSchema,
  worldId: worldIdSchema,
  sequence: z.number().int().nonnegative(),
  instant: simulationInstantSchema,
  causationId: messageIdSchema,
  correlationId: correlationIdSchema,
  versions: versionStampSchema,
};

/** Envelope fields with an unvalidated payload; use a registry to parse messages. */
export const commandEnvelopeSchema = z.strictObject({ ...commandEnvelopeShape, payload: z.unknown() });
export const eventEnvelopeSchema = z.strictObject({ ...eventEnvelopeShape, payload: z.unknown() });

export type CommandEnvelopeFields = z.output<z.ZodObject<typeof commandEnvelopeShape>>;
export type EventEnvelopeFields = z.output<z.ZodObject<typeof eventEnvelopeShape>>;

/** Payloads are closed objects: unknown fields are rejected, never ignored. */
type StrictPayload = z.ZodObject<z.ZodRawShape, z.core.$strict>;

export interface CommandDefinition<
  T extends string = string,
  V extends number = number,
  P extends StrictPayload = StrictPayload,
> {
  readonly kind: "command";
  readonly type: T;
  readonly typeVersion: V;
  readonly description: string;
  readonly payload: P;
  /** Actor kinds allowed to issue this command. */
  readonly actorKinds: readonly ActorKind[];
}

export interface EventDefinition<
  T extends string = string,
  V extends number = number,
  P extends StrictPayload = StrictPayload,
> {
  readonly kind: "event";
  readonly type: T;
  readonly typeVersion: V;
  readonly description: string;
  readonly payload: P;
}

export function defineCommand<const T extends string, const V extends number, P extends StrictPayload>(
  definition: Omit<CommandDefinition<T, V, P>, "kind">,
): CommandDefinition<T, V, P> {
  assertDefinition(definition);
  if (definition.actorKinds.length === 0) throw new Error(`Command ${definition.type} allows no actor kinds`);
  return Object.freeze({ kind: "command", ...definition, actorKinds: Object.freeze([...definition.actorKinds]) });
}

export function defineEvent<const T extends string, const V extends number, P extends StrictPayload>(
  definition: Omit<EventDefinition<T, V, P>, "kind">,
): EventDefinition<T, V, P> {
  assertDefinition(definition);
  return Object.freeze({ kind: "event", ...definition });
}

function assertDefinition(definition: { type: string; typeVersion: number; payload: z.ZodType }): void {
  if (!messageTypeSchema.safeParse(definition.type).success) {
    throw new Error(`Invalid message type name: ${definition.type}`);
  }
  if (!typeVersionSchema.safeParse(definition.typeVersion).success) {
    throw new Error(`Invalid typeVersion for ${definition.type}: ${definition.typeVersion}`);
  }
  const def = definition.payload._zod.def as { type?: string; catchall?: { _zod: { def: { type: string } } } };
  if (def.type !== "object" || def.catchall?._zod.def.type !== "never") {
    throw new Error(`Payload of ${definition.type}@${definition.typeVersion} must be a z.strictObject`);
  }
}

/** The typed command produced by parsing with a definition. */
export type CommandOf<D> =
  D extends CommandDefinition<infer T, infer V, infer P>
    ? Omit<CommandEnvelopeFields, "type" | "typeVersion"> & {
        readonly type: T;
        readonly typeVersion: V;
        readonly payload: z.output<P>;
      }
    : never;

/** The typed event produced by parsing with a definition. */
export type EventOf<D> =
  D extends EventDefinition<infer T, infer V, infer P>
    ? Omit<EventEnvelopeFields, "type" | "typeVersion"> & {
        readonly type: T;
        readonly typeVersion: V;
        readonly payload: z.output<P>;
      }
    : never;

export interface MessageRegistry<Definition, Message> {
  readonly kind: "command" | "event";
  readonly definitions: readonly Definition[];
  /** Union of every registered variant, for documentation and JSON Schema. */
  readonly schema: z.ZodType;
  has(type: string, typeVersion: number): boolean;
  parse(raw: unknown): Message;
  safeParse(raw: unknown): ContractResult<Message>;
}

const key = (type: string, typeVersion: number) => `${type}@${typeVersion}`;

function createRegistry<Definition extends CommandDefinition | EventDefinition, Message>(
  kind: "command" | "event",
  envelope: z.ZodObject<z.ZodRawShape, z.core.$strict>,
  definitions: readonly Definition[],
  check: (definition: Definition, message: Record<string, unknown>) => ContractValidationError | undefined,
): MessageRegistry<Definition, Message> {
  if (definitions.length === 0) throw new Error(`A ${kind} registry needs at least one definition`);
  const byKey = new Map<string, Definition>();
  for (const definition of definitions) {
    if (definition.kind !== kind) throw new Error(`${definition.type} is not a ${kind} definition`);
    const id = key(definition.type, definition.typeVersion);
    if (byKey.has(id)) throw new Error(`Duplicate ${kind} definition ${id}`);
    byKey.set(id, definition);
  }
  const contract = `${kind} envelope`;
  const variants = definitions.map((definition) =>
    envelope.extend({
      type: z.literal(definition.type),
      typeVersion: z.literal(definition.typeVersion),
      payload: definition.payload,
    }),
  );
  const [first, ...rest] = variants;
  if (first === undefined) throw new Error(`A ${kind} registry needs at least one definition`);

  function safeParse(raw: unknown): ContractResult<Message> {
    const base = envelope.safeParse(raw);
    if (!base.success)
      return { success: false, error: new ContractValidationError(contract, issuesFromZod(base.error)) };
    const message = base.data as Record<string, unknown> & { type: string; typeVersion: number };
    const definition = byKey.get(key(message.type, message.typeVersion));
    if (definition === undefined) {
      return {
        success: false,
        error: new ContractValidationError(contract, [
          { path: "type", message: `unknown ${kind} type ${key(message.type, message.typeVersion)}` },
        ]),
      };
    }
    const payload = definition.payload.safeParse(message["payload"]);
    if (!payload.success) {
      return {
        success: false,
        error: new ContractValidationError(contract, issuesFromZod(payload.error, ["payload"])),
      };
    }
    const parsed = { ...message, payload: payload.data };
    const failure = check(definition, parsed);
    if (failure !== undefined) return { success: false, error: failure };
    return { success: true, data: parsed as Message };
  }

  return Object.freeze({
    kind,
    definitions: Object.freeze([...definitions]),
    schema: rest.length === 0 ? first : z.union([first, ...rest]),
    has: (type: string, typeVersion: number) => byKey.has(key(type, typeVersion)),
    safeParse,
    parse(raw: unknown): Message {
      const result = safeParse(raw);
      if (!result.success) throw result.error;
      return result.data;
    },
  });
}

export function createCommandRegistry<const Definitions extends readonly CommandDefinition[]>(
  definitions: Definitions,
): MessageRegistry<Definitions[number], CommandOf<Definitions[number]>> {
  return createRegistry("command", commandEnvelopeSchema, definitions, (definition, message) => {
    const actor = message["actor"] as { kind: ActorKind };
    if (!definition.actorKinds.includes(actor.kind)) {
      return new ContractValidationError("command envelope", [
        { path: "actor.kind", message: `${definition.type} cannot be issued by actor kind ${actor.kind}` },
      ]);
    }
    if (message["causationId"] === message["commandId"]) {
      return new ContractValidationError("command envelope", [
        { path: "causationId", message: "a command cannot cause itself" },
      ]);
    }
    return undefined;
  });
}

export function createEventRegistry<const Definitions extends readonly EventDefinition[]>(
  definitions: Definitions,
): MessageRegistry<Definitions[number], EventOf<Definitions[number]>> {
  return createRegistry("event", eventEnvelopeSchema, definitions, (_definition, message) =>
    message["causationId"] === message["eventId"]
      ? new ContractValidationError("event envelope", [
          { path: "causationId", message: "an event cannot cause itself" },
        ])
      : undefined,
  );
}
