import type { DomainEvent } from "@civ/contracts";
import type pg from "pg";
import { readEvents } from "./ledger.js";
import { toSafeInt, withTransaction, type Queryable } from "./transaction.js";

const CONSUMER_NAME = /^[a-z][a-z0-9-]{0,62}$/;

function assertConsumer(consumer: string): void {
  if (!CONSUMER_NAME.test(consumer)) throw new RangeError(`invalid consumer name: ${consumer}`);
}

export interface ConsumeOptions {
  readonly consumer: string;
  readonly worldId: string;
  readonly batchSize?: number;
  /**
   * Apply a batch of events (contiguous, in ledger order) using `client`,
   * which is inside the transaction that also advances the cursor. Effects
   * and cursor commit together, so redelivery never applies an event twice.
   */
  readonly handle: (client: pg.PoolClient, events: readonly DomainEvent[]) => Promise<void>;
}

export interface ConsumeResult {
  /** Events applied by this call. */
  readonly applied: number;
  /** Cursor after this call. */
  readonly position: number;
}

/**
 * Apply one batch of a world's ledger to a consumer. The consumer's offset
 * row is locked for the transaction, so concurrent deliveries of the same
 * notification serialise and the second one sees the advanced cursor.
 */
export async function consumeBatch(pool: pg.Pool, options: ConsumeOptions): Promise<ConsumeResult> {
  assertConsumer(options.consumer);
  const batchSize = options.batchSize ?? 500;
  return withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO civ.consumer_offsets (consumer, world_id, position) VALUES ($1, $2, 0)
       ON CONFLICT (consumer, world_id) DO NOTHING`,
      [options.consumer, options.worldId],
    );
    const locked = await client.query<{ position: string }>(
      "SELECT position FROM civ.consumer_offsets WHERE consumer = $1 AND world_id = $2 FOR UPDATE",
      [options.consumer, options.worldId],
    );
    const position = toSafeInt(locked.rows[0]?.position, "position");
    const page = await readEvents(client, { worldId: options.worldId, after: position, limit: batchSize });
    if (page.events.length === 0) return { applied: 0, position };
    await options.handle(client, page.events);
    await client.query(
      "UPDATE civ.consumer_offsets SET position = $3, updated_at = now() WHERE consumer = $1 AND world_id = $2",
      [options.consumer, options.worldId, page.nextPosition],
    );
    return { applied: page.events.length, position: page.nextPosition };
  });
}

/** Apply batches until the consumer reaches the ledger head as of the last read. */
export async function catchUp(pool: pg.Pool, options: ConsumeOptions): Promise<ConsumeResult> {
  let applied = 0;
  for (;;) {
    const result = await consumeBatch(pool, options);
    applied += result.applied;
    if (result.applied === 0) return { applied, position: result.position };
  }
}

export interface ConsumerLag {
  readonly worldId: string;
  readonly position: number;
  readonly head: number;
  readonly lag: number;
}

/** Per-world lag of a consumer behind the ledger head (worlds never consumed count from 0). */
export async function consumerLag(client: Queryable, consumer: string): Promise<ConsumerLag[]> {
  assertConsumer(consumer);
  const result = await client.query<{ world_id: string; position: string; head: string }>(
    `SELECT ws.world_id, coalesce(co.position, 0) AS position, ws.event_position AS head
       FROM civ.world_state ws
       LEFT JOIN civ.consumer_offsets co ON co.world_id = ws.world_id AND co.consumer = $1
      ORDER BY ws.world_id`,
    [consumer],
  );
  return result.rows.map((row) => {
    const position = toSafeInt(row.position, "position");
    const head = toSafeInt(row.head, "head");
    return { worldId: row.world_id, position, head, lag: head - position };
  });
}

export type InboxResult<T> = { readonly status: "processed"; readonly result: T } | { readonly status: "duplicate" };

/**
 * Run a job's side effects at most once per (consumer, message key): the
 * processed marker and the effects commit in one transaction. A concurrent
 * duplicate blocks on the marker's unique key and then reports `duplicate`;
 * if the first attempt rolls back, the retry runs the effects.
 */
export async function processOnce<T>(
  pool: pg.Pool,
  input: { readonly consumer: string; readonly messageKey: string },
  effects: (client: pg.PoolClient) => Promise<T>,
): Promise<InboxResult<T>> {
  assertConsumer(input.consumer);
  return withTransaction(pool, async (client) => {
    const marker = await client.query(
      `INSERT INTO civ.inbox (consumer, message_key) VALUES ($1, $2)
       ON CONFLICT (consumer, message_key) DO NOTHING RETURNING 1`,
      [input.consumer, input.messageKey],
    );
    if (marker.rowCount === 0) return { status: "duplicate" as const };
    return { status: "processed" as const, result: await effects(client) };
  });
}
