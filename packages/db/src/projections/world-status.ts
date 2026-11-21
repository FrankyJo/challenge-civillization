import type { Queryable } from "../transaction.js";
import { toSafeInt } from "../transaction.js";

/** Consumer name of the world-status projection (also its offsets key). */
export const WORLD_STATUS_CONSUMER = "world-status";

/** Read model: a world's clock and status as of `eventPosition` ledger events. */
export interface WorldStatusRow {
  readonly worldId: string;
  readonly clock: number;
  readonly year: number;
  readonly dayOfYear: number;
  readonly status: "running" | "paused";
  readonly eventPosition: number;
  readonly lastEventId: string | null;
}

export async function readWorldStatus(client: Queryable, worldId: string): Promise<WorldStatusRow | null> {
  const result = await client.query<{
    world_id: string;
    clock: string;
    year: number;
    day_of_year: number;
    status: "running" | "paused";
    event_position: string;
    last_event_id: string | null;
  }>("SELECT * FROM civ.proj_world_status WHERE world_id = $1", [worldId]);
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    worldId: row.world_id,
    clock: toSafeInt(row.clock, "clock"),
    year: row.year,
    dayOfYear: row.day_of_year,
    status: row.status,
    eventPosition: toSafeInt(row.event_position, "event_position"),
    lastEventId: row.last_event_id,
  };
}

export async function writeWorldStatus(client: Queryable, row: WorldStatusRow): Promise<void> {
  await client.query(
    `INSERT INTO civ.proj_world_status (world_id, clock, year, day_of_year, status, event_position, last_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (world_id) DO UPDATE
       SET clock = EXCLUDED.clock, year = EXCLUDED.year, day_of_year = EXCLUDED.day_of_year,
           status = EXCLUDED.status, event_position = EXCLUDED.event_position,
           last_event_id = EXCLUDED.last_event_id, updated_at = now()`,
    [row.worldId, row.clock, row.year, row.dayOfYear, row.status, row.eventPosition, row.lastEventId],
  );
}
