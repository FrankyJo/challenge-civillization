import type pg from "pg";

/** Anything that can run a query: the pool or a client inside a transaction. */
export type Queryable = pg.Pool | pg.PoolClient;

/**
 * Run `fn` inside one READ COMMITTED transaction on a dedicated connection.
 * Commits when `fn` resolves; rolls back and rethrows the original error when
 * it rejects. A connection whose ROLLBACK failed is destroyed, never reused.
 */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      }
      throw error;
    }
  } finally {
    client.release(broken);
  }
}

/** Parse a bigint column (returned as text by node-postgres) into a safe integer. */
export function toSafeInt(value: unknown, column: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) throw new RangeError(`${column} is not a safe integer`);
  return number;
}

/** ISO 8601 UTC text of a timestamptz column. */
export function toIso(value: unknown, column: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new RangeError(`${column} is not a timestamp`);
  return value.toISOString();
}
