import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage<string>();

/** Accept caller-supplied correlation IDs only if they are short and safe to log. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
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
