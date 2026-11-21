import { type MapParams, type PublicMapSnapshot, type WorldMap } from "@civ/contracts";
import { LedgerIntegrityError, loadWorldMap, type Pool } from "@civ/db";
import {
  canonicalHash,
  generateWorldMap,
  MAP_GENERATOR,
  mapSnapshot,
  validateWorldMap,
  type GeographyReference,
  type MapStats,
} from "@civ/domain";

/** A freshly generated map ready to be stored with its world. */
export interface PreparedGeography {
  readonly map: WorldMap;
  readonly snapshot: PublicMapSnapshot;
  /** Pass to `createEngine({ geography })`. */
  readonly reference: GeographyReference;
  readonly stats: MapStats;
}

/**
 * Generate and validate a world's map (the generator validates its own
 * output and throws `MapValidationError` on any defect) and its public
 * snapshot. Pure apart from CPU time; the caller stores the result with
 * `createWorld({ map: { document, snapshot } })`.
 */
export function prepareGeography(input: {
  readonly worldId: string;
  readonly seed: string;
  readonly params?: MapParams;
}): PreparedGeography {
  const map = generateWorldMap(input);
  const report = validateWorldMap(map);
  if (report.stats === null) throw new Error("generator defect: a validated map has no statistics");
  return {
    map,
    snapshot: mapSnapshot(map),
    reference: { mapVersion: map.mapVersion, mapHash: map.mapHash },
    stats: report.stats,
  };
}

/**
 * Load a world's stored map for the engine. Checks, in order: the store's
 * hash verification, the domain's semantic validation, the expected engine
 * reference (mandatory: `engine.config.geography`, so a world never runs on
 * a map other than the one its versions name), that the stored public
 * snapshot is exactly the projection of the document, and — when the stored map was made by this build's generator
 * version — that regenerating it from seed and params yields the same hash
 * (catches platform nondeterminism or an unversioned generator change).
 */
export async function loadGeography(
  pool: Pool,
  worldId: string,
  expected: GeographyReference,
): Promise<{ readonly map: WorldMap; readonly reference: GeographyReference; readonly regenerated: boolean }> {
  const { document, snapshot } = await loadWorldMap(pool, worldId);
  const report = validateWorldMap(document);
  if (!report.ok) {
    throw new LedgerIntegrityError(`stored map of ${worldId} is invalid: ${report.issues.slice(0, 3).join("; ")}`);
  }
  if (expected.mapHash !== document.mapHash || expected.mapVersion !== document.mapVersion) {
    throw new LedgerIntegrityError(`stored map of ${worldId} is not the map the engine was configured with`);
  }
  if (canonicalHash(mapSnapshot(document)) !== canonicalHash(snapshot)) {
    throw new LedgerIntegrityError(`stored public snapshot of ${worldId} is not the projection of its map`);
  }
  let regenerated = false;
  if (document.generator.version === MAP_GENERATOR.version) {
    const again = generateWorldMap({ worldId, seed: document.seed, params: document.params });
    if (again.mapHash !== document.mapHash) {
      throw new LedgerIntegrityError(
        `map of ${worldId} does not reproduce: stored ${document.mapHash}, regenerated ${again.mapHash}`,
      );
    }
    regenerated = true;
  }
  return { map: document, reference: { mapVersion: document.mapVersion, mapHash: document.mapHash }, regenerated };
}
