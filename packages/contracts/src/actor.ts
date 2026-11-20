import { z } from "zod";
import { operatorIdSchema } from "./ids.js";

/**
 * Who issued a command or last changed a record. Actors are internal audit
 * data: operator identities never appear in public DTOs.
 */
export const systemComponentSchema = z.enum(["scheduler", "simulation", "worker"]);

export const actorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("system"), component: systemComponentSchema }),
  z.strictObject({ kind: z.literal("operator"), operatorId: operatorIdSchema }),
]);
export type Actor = z.output<typeof actorSchema>;
export type ActorKind = Actor["kind"];
