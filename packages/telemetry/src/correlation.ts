import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { CORRELATION_ID_PATTERN } from "@civ/contracts";

/** HTTP header carrying the correlation ID in requests and responses. */
export const CORRELATION_HEADER = "x-correlation-id";

const storage = new AsyncLocalStorage<string>();

/** Accept caller-supplied correlation IDs only if they match the contract (short, log-safe). */
export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value);
}

/** Use the inbound ID when it is well-formed; otherwise mint a fresh one. */
export function resolveCorrelationId(inbound: unknown): string {
  return isValidCorrelationId(inbound) ? inbound : randomUUID();
}

export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run(correlationId, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore();
}
