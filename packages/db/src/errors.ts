/** Base class for persistence failures callers are expected to handle. */
export class StoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The addressed record does not exist. */
export class NotFoundError extends StoreError {}

/** The world does not exist (or has no current state). */
export class UnknownWorldError extends NotFoundError {}

/** A world, season or other identity already exists. */
export class AlreadyExistsError extends StoreError {}

/**
 * The writer computed its change from a version that is no longer current.
 * Nothing was written; reload and recompute (or give up).
 */
export class StaleWriteError extends StoreError {}

/**
 * The writer no longer holds the world's lease (taken over, expired or never
 * held): its fencing token is stale. Nothing was written; stop writing.
 */
export class FencingError extends StoreError {}

/** The idempotency key or command ID was already used for a different request. */
export class IdempotencyConflictError extends StoreError {}

/**
 * Persisted or submitted data violates a ledger invariant (sequence gap,
 * hash mismatch, wrong world/causation). Indicates a defect, never retried.
 */
export class LedgerIntegrityError extends StoreError {}

/** A development-only operation was refused in this environment. */
export class ResetRefusedError extends StoreError {}

/** PostgreSQL SQLSTATE of a driver error, if any. */
export function sqlState(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Name of the violated constraint of a driver error, if any. */
export function constraintOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "constraint" in error) {
    const name = (error as { constraint: unknown }).constraint;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

export const UNIQUE_VIOLATION = "23505";
export const RESTRICT_VIOLATION = "23001";
