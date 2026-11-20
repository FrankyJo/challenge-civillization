import { z } from "zod";

/** Queue for operational jobs. Domain queues (projections, archive) arrive later. */
export const SYSTEM_QUEUE = "system";

/**
 * `system.ping` verifies the queue round trip (producer → Redis → worker →
 * result). It carries a caller-chosen nonce that is echoed back.
 */
export const systemPingSchema = z.object({ nonce: z.string().min(1).max(128) });
export type SystemPing = z.infer<typeof systemPingSchema>;
export interface SystemPingResult {
  readonly nonce: string;
  readonly handledBy: "worker";
}

export class UnknownJobError extends Error {
  constructor(name: string) {
    super(`unknown job: ${name}`);
    this.name = "UnknownJobError";
  }
}

/** Dispatch a system-queue job. Payloads are validated; unknown names fail. */
export function processSystemJob(name: string, data: unknown): SystemPingResult {
  switch (name) {
    case "system.ping": {
      const payload = systemPingSchema.parse(data);
      return { nonce: payload.nonce, handledBy: "worker" };
    }
    default:
      throw new UnknownJobError(name);
  }
}
