import { z } from "zod";
import { worldIdSchema } from "./ids.js";

export const LEDGER_NOTIFICATION_SCHEMA_VERSION = 1 as const;

/** Outbox topic and queue job name for "events were appended to a world's ledger". */
export const LEDGER_APPENDED_TOPIC = "ledger.appended" as const;

/**
 * Queue notification that ledger events `[fromPosition, toPosition)` of a
 * world were committed. It carries no facts: consumers read the events from
 * the authoritative ledger by cursor, so a lost or duplicated notification
 * only delays or repeats a catch-up and never loses or doubles an effect.
 */
export const ledgerNotificationSchema = z
  .strictObject({
    schemaVersion: z.literal(LEDGER_NOTIFICATION_SCHEMA_VERSION),
    worldId: worldIdSchema,
    fromPosition: z.number().int().nonnegative(),
    toPosition: z.number().int().nonnegative(),
  })
  .refine((note) => note.toPosition > note.fromPosition, {
    path: ["toPosition"],
    message: "must be greater than fromPosition",
  });
export type LedgerNotification = z.output<typeof ledgerNotificationSchema>;
