import { type WorldData, type WorldRecord } from "@civ/contracts";
import { loadWorldMap, type Pool } from "@civ/db";
import { createEngine, createSystemSchedule, type Engine } from "@civ/domain";

/**
 * The season-one system schedule. No simulation systems run yet (Phase 07
 * adds lifecycle systems); the schedule's descriptor is part of every
 * world's `configVersion`, so changing it changes the version stamp.
 */
export const SEASON_ONE_SYSTEMS = createSystemSchedule<WorldData>([]);

/** Build a launched world's engine from its stored map and launch versions. */
export async function seasonOneEngine(pool: Pool, world: WorldRecord): Promise<Engine<unknown>> {
  const { document } = await loadWorldMap(pool, world.worldId);
  return createEngine<WorldData>({
    worldId: world.worldId,
    seed: world.seed,
    span: { startYear: world.startYear, endYear: world.endYear },
    contentVersion: world.versions.contentVersion,
    schedule: SEASON_ONE_SYSTEMS,
    geography: { mapVersion: document.mapVersion, mapHash: document.mapHash },
  }) as Engine<unknown>;
}
