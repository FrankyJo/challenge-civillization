import { z } from "zod";
import { checkpointIdSchema, worldIdSchema } from "./ids.js";
import { simulationInstantSchema } from "./time.js";
import { ContractValidationError, parseContract } from "./validation.js";
import { digestSchema, versionStampSchema } from "./versions.js";

/**
 * Position in a world's event ledger. `position` is the number of events
 * already consumed; ledger sequences start at 0, so the next event a holder
 * of this cursor expects has `sequence === position`.
 */
export const eventCursorSchema = z.strictObject({
  worldId: worldIdSchema,
  position: z.number().int().nonnegative(),
});
export type EventCursor = z.output<typeof eventCursorSchema>;

/** Wire form: `v1.<worldId>.<position>`, opaque to clients, stable for resumption. */
const CURSOR_WIRE = /^v1\.(wld_[0-9a-z]{8,64})\.(0|[1-9][0-9]{0,15})$/;
export const eventCursorStringSchema = z
  .string()
  .regex(CURSOR_WIRE, "must be an event cursor (v1.<worldId>.<position>)")
  .refine((wire) => Number.isSafeInteger(Number(wire.slice(wire.lastIndexOf(".") + 1))), "position is out of range");

export function encodeEventCursor(cursor: EventCursor): string {
  const parsed = parseContract("event cursor", eventCursorSchema, cursor);
  return `v1.${parsed.worldId}.${parsed.position}`;
}

export function decodeEventCursor(wire: string): EventCursor {
  const match = typeof wire === "string" ? CURSOR_WIRE.exec(wire) : null;
  if (match === null) {
    throw new ContractValidationError("event cursor", [{ path: "(root)", message: "malformed cursor" }]);
  }
  return parseContract("event cursor", eventCursorSchema, { worldId: match[1], position: Number(match[2]) });
}

export const CHECKPOINT_SCHEMA_VERSION = 1 as const;

/**
 * Metadata of a canonical state checkpoint: the state after applying the
 * first `eventPosition` ledger events, at `instant`, hashed over canonical
 * serialization, under `versions`.
 */
export const checkpointSchema = z.strictObject({
  schemaVersion: z.literal(CHECKPOINT_SCHEMA_VERSION),
  checkpointId: checkpointIdSchema,
  worldId: worldIdSchema,
  instant: simulationInstantSchema,
  eventPosition: z.number().int().nonnegative(),
  stateHash: digestSchema,
  versions: versionStampSchema,
});
export type Checkpoint = z.output<typeof checkpointSchema>;
