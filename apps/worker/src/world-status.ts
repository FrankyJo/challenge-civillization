import type { DomainEvent } from "@civ/contracts";
import {
  catchUp,
  readWorldStatus,
  WORLD_STATUS_CONSUMER,
  writeWorldStatus,
  type ConsumeResult,
  type Pool,
  type WorldStatusRow,
} from "@civ/db";

/**
 * Pure reducer of the world-status read model. Clock rules: `world.advanced`
 * moves the clock to `toTick`; `world.paused`/`world.resumed` are stamped at
 * the current clock; other (system) events do not move it.
 */
export function reduceWorldStatus(current: WorldStatusRow | null, events: readonly DomainEvent[]): WorldStatusRow {
  let row = current;
  for (const event of events) {
    const base: WorldStatusRow = row ?? {
      worldId: event.worldId,
      clock: event.instant.tick,
      year: event.instant.year,
      dayOfYear: event.instant.dayOfYear,
      status: "running",
      eventPosition: 0,
      lastEventId: null,
    };
    if (event.worldId !== base.worldId) throw new Error(`event ${event.eventId} belongs to another world`);
    if (event.sequence !== base.eventPosition) {
      throw new Error(`world-status expected sequence ${base.eventPosition}, got ${event.sequence}`);
    }
    const moved =
      event.type === "world.advanced"
        ? { clock: event.payload.toTick, year: event.instant.year, dayOfYear: event.instant.dayOfYear }
        : event.type === "world.paused" || event.type === "world.resumed"
          ? { clock: event.instant.tick, year: event.instant.year, dayOfYear: event.instant.dayOfYear }
          : {};
    const status = event.type === "world.paused" ? "paused" : event.type === "world.resumed" ? "running" : base.status;
    row = { ...base, ...moved, status, eventPosition: event.sequence + 1, lastEventId: event.eventId };
  }
  if (row === null) throw new Error("reduceWorldStatus needs at least one event");
  return row;
}

/** Bring the world-status projection of one world up to the ledger head. */
export function projectWorldStatus(pool: Pool, worldId: string, batchSize = 500): Promise<ConsumeResult> {
  return catchUp(pool, {
    consumer: WORLD_STATUS_CONSUMER,
    worldId,
    batchSize,
    handle: async (client, events) => {
      const current = await readWorldStatus(client, worldId);
      await writeWorldStatus(client, reduceWorldStatus(current, events));
    },
  });
}
