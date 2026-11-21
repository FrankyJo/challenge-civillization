import type pg from "pg";
import { toSafeInt, type Queryable } from "./transaction.js";

export interface OutboxMessage {
  readonly id: number;
  /** Stable key: also the queue job ID, so re-publishing is deduplicated downstream. */
  readonly messageKey: string;
  readonly topic: string;
  readonly worldId: string;
  readonly payload: unknown;
  readonly attempts: number;
}

export interface RelayOptions {
  /** Deliver one message; resolve only once the broker has accepted it. */
  readonly publish: (message: OutboxMessage) => Promise<void>;
  readonly batchSize?: number;
  /** Retry delay cap after failed publishes (default 300 s). */
  readonly maxBackoffMs?: number;
  /** A publish slower than this counts as failed (default 5 s). */
  readonly publishTimeoutMs?: number;
  /**
   * How long a claim excludes other relays (default 60 s). A relay that dies
   * mid-batch releases its rows when the lease expires.
   */
  readonly leaseMs?: number;
}

export interface RelayResult {
  readonly published: number;
  readonly failed: number;
}

const MAX_ERROR_LENGTH = 500;

/** Exponential backoff: 1 s, 2 s, 4 s … capped. */
export function outboxBackoffMs(attempts: number, maxBackoffMs: number): number {
  const exponent = Math.min(Math.max(attempts - 1, 0), 30);
  return Math.min(1_000 * 2 ** exponent, maxBackoffMs);
}

export class PublishTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`publish did not complete within ${timeoutMs}ms`);
    this.name = "PublishTimeoutError";
  }
}

async function withTimeout(task: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PublishTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish one batch of pending outbox rows.
 *
 * 1. Claim: one short statement leases up to `batchSize` due rows by pushing
 *    `next_attempt_at` forward (`FOR UPDATE SKIP LOCKED`), so concurrent
 *    relays never claim the same row and no transaction or lock is held
 *    while talking to the broker.
 * 2. Publish each message outside any transaction, bounded by a timeout.
 * 3. Mark successes published; record failures with capped backoff.
 *
 * A relay that dies after publishing but before marking leaves the lease to
 * expire and the row is published again (at-least-once; consumers
 * deduplicate by key/cursor). Rows are never dropped: a notification is
 * cheap and the ledger it points to is authoritative.
 */
export async function relayOutbox(pool: pg.Pool, options: RelayOptions): Promise<RelayResult> {
  const batchSize = options.batchSize ?? 100;
  const maxBackoffMs = options.maxBackoffMs ?? 300_000;
  const publishTimeoutMs = options.publishTimeoutMs ?? 5_000;
  const leaseMs = options.leaseMs ?? 60_000;
  const claimed = await pool.query<{
    id: string;
    message_key: string;
    topic: string;
    world_id: string;
    payload: unknown;
    attempts: number;
  }>(
    `UPDATE civ.outbox
        SET next_attempt_at = now() + make_interval(secs => $2::double precision / 1000)
      WHERE id IN (SELECT id FROM civ.outbox
                    WHERE published_at IS NULL AND next_attempt_at <= now()
                    ORDER BY id LIMIT $1
                    FOR UPDATE SKIP LOCKED)
      RETURNING id, message_key, topic, world_id, payload, attempts`,
    [batchSize, leaseMs],
  );
  const messages = claimed.rows
    .map((row): OutboxMessage => ({
      id: toSafeInt(row.id, "id"),
      messageKey: row.message_key,
      topic: row.topic,
      worldId: row.world_id,
      payload: row.payload,
      attempts: row.attempts,
    }))
    .sort((a, b) => a.id - b.id);

  const published: number[] = [];
  let failed = 0;
  for (const message of messages) {
    try {
      await withTimeout(options.publish(message), publishTimeoutMs);
      published.push(message.id);
    } catch (error) {
      failed += 1;
      const attempts = message.attempts + 1;
      const text = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(
        0,
        MAX_ERROR_LENGTH,
      );
      await pool.query(
        `UPDATE civ.outbox
            SET attempts = $2, last_error = $3,
                next_attempt_at = now() + make_interval(secs => $4::double precision / 1000)
          WHERE id = $1 AND published_at IS NULL`,
        [message.id, attempts, text, outboxBackoffMs(attempts, maxBackoffMs)],
      );
    }
  }
  if (published.length > 0) {
    await pool.query(
      "UPDATE civ.outbox SET published_at = now(), last_error = NULL WHERE id = ANY($1::bigint[]) AND published_at IS NULL",
      [published],
    );
  }
  return { published: published.length, failed };
}

export interface OutboxBacklog {
  readonly pending: number;
  /** Age of the oldest pending row in ms (0 when none). */
  readonly oldestPendingMs: number;
  /** Highest attempt count among pending rows (stuck-relay signal). */
  readonly maxAttempts: number;
}

/** Relay health: how much is waiting and for how long. */
export async function outboxBacklog(client: Queryable): Promise<OutboxBacklog> {
  const result = await client.query<{ pending: string; oldest_ms: string | null; max_attempts: number | null }>(
    `SELECT count(*) AS pending,
            floor(extract(epoch FROM now() - min(created_at)) * 1000)::bigint AS oldest_ms,
            max(attempts) AS max_attempts
       FROM civ.outbox WHERE published_at IS NULL`,
  );
  const row = result.rows[0];
  return {
    pending: toSafeInt(row?.pending ?? 0, "pending"),
    oldestPendingMs:
      row?.oldest_ms === null || row?.oldest_ms === undefined ? 0 : toSafeInt(row.oldest_ms, "oldest_ms"),
    maxAttempts: row?.max_attempts ?? 0,
  };
}

/** Retention: delete rows published more than `olderThanMs` ago. Returns rows removed. */
export async function pruneOutbox(client: Queryable, olderThanMs: number): Promise<number> {
  if (!Number.isSafeInteger(olderThanMs) || olderThanMs < 0) throw new RangeError("olderThanMs must be >= 0");
  const result = await client.query(
    `DELETE FROM civ.outbox
      WHERE published_at IS NOT NULL AND published_at < now() - make_interval(secs => $1::double precision / 1000)`,
    [olderThanMs],
  );
  return result.rowCount ?? 0;
}
