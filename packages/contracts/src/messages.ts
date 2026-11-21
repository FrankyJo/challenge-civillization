import { z } from "zod";
import { createCommandRegistry, createEventRegistry, defineCommand, defineEvent } from "./envelope.js";

/**
 * Registered message variants.
 *
 * - world.pause / world.resume and their events: operator controls specified
 *   in docs/SECURITY-OPERATIONS.md ("World controls").
 * - world.advance / world.advanced: the scheduler (or, for single-step and
 *   bounded catch-up, an operator) asks the engine to run due ticks
 *   (docs/ARCHITECTURE.md "Authority and data flow"); the event records the
 *   clock movement so projections can follow it.
 * Later phases add variants here as their specs define them. A definition
 * that has ever been persisted is never removed or edited; a breaking change
 * is a new `typeVersion` registered alongside the old one.
 */
const operatorReason = z
  .string()
  .min(1)
  .max(500)
  .regex(/^\S(?:[\s\S]*\S)?$/u, "must not have leading or trailing whitespace")
  // Audit text: no control or invisible formatting characters (e.g. bidi
  // overrides) other than line breaks and tabs.
  .regex(/^(?:[^\p{Cc}\p{Cf}]|[\n\t])*$/u, "must not contain control or formatting characters");

export const pauseWorldCommand = defineCommand({
  type: "world.pause",
  typeVersion: 1,
  description: "Operator request to stop claiming new ticks after the current transaction.",
  actorKinds: ["operator"],
  payload: z.strictObject({ reason: operatorReason }),
});

export const resumeWorldCommand = defineCommand({
  type: "world.resume",
  typeVersion: 1,
  description: "Operator request to resume claiming ticks after lease/checkpoint/queue checks.",
  actorKinds: ["operator"],
  payload: z.strictObject({ reason: operatorReason }),
});

/** A clock position: number of completed ticks. */
const clockPosition = z.number().int().nonnegative();

export const advanceWorldCommand = defineCommand({
  type: "world.advance",
  typeVersion: 1,
  description: "Run every tick from the current clock position fromTick up to (excluding) toTick.",
  actorKinds: ["system", "operator"],
  payload: z
    .strictObject({ fromTick: clockPosition, toTick: clockPosition })
    .refine((range) => range.toTick > range.fromTick, { path: ["toTick"], message: "must be after fromTick" }),
});

export const worldPausedEvent = defineEvent({
  type: "world.paused",
  typeVersion: 1,
  description: "The world stopped claiming new ticks. Audit record of a pause.",
  payload: z.strictObject({ reason: operatorReason }),
});

export const worldResumedEvent = defineEvent({
  type: "world.resumed",
  typeVersion: 1,
  description: "The world resumed claiming ticks. Audit record of a resume.",
  payload: z.strictObject({ reason: operatorReason }),
});

export const worldAdvancedEvent = defineEvent({
  type: "world.advanced",
  typeVersion: 1,
  description: "The clock moved from fromTick to toTick; events of those ticks precede this one.",
  payload: z
    .strictObject({ fromTick: clockPosition, toTick: clockPosition })
    .refine((range) => range.toTick > range.fromTick, { path: ["toTick"], message: "must be after fromTick" }),
});

export const commandRegistry = createCommandRegistry([pauseWorldCommand, resumeWorldCommand, advanceWorldCommand]);
export const eventRegistry = createEventRegistry([worldPausedEvent, worldResumedEvent, worldAdvancedEvent]);

/** Every command the system accepts, as a tagged union on `type`. */
export type Command = ReturnType<typeof commandRegistry.parse>;
/** Every domain event the system records, as a tagged union on `type`. */
export type DomainEvent = ReturnType<typeof eventRegistry.parse>;
