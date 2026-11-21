import {
  parseContract,
  publicMapSnapshotSchema,
  worldIdSchema,
  worldMapSchema,
  type PublicMapSnapshot,
  type WorldMap,
} from "@civ/contracts";
import { canonicalDigest } from "./digest.js";
import { LedgerIntegrityError, NotFoundError } from "./errors.js";
import { type Queryable } from "./transaction.js";

/** A world's generated map and its public projection, as stored. */
export interface StoredWorldMap {
  readonly document: WorldMap;
  readonly snapshot: PublicMapSnapshot;
}

/**
 * Verify a map document and its snapshot before storing or after loading:
 * contract shapes, the document hash recomputed with node:crypto (the domain
 * computes it with its own pure SHA-256), and that the snapshot belongs to
 * this exact document. Semantic map validation is the domain's job and runs
 * when the map is generated.
 */
export function verifyWorldMap(input: StoredWorldMap, label: string): StoredWorldMap {
  const document = parseContract(`${label} document`, worldMapSchema, input.document);
  const snapshot = parseContract(`${label} snapshot`, publicMapSnapshotSchema, input.snapshot);
  const { mapHash, ...unhashed } = document;
  const actual = canonicalDigest(unhashed);
  if (actual !== mapHash) {
    throw new LedgerIntegrityError(`${label}: map hash ${mapHash} does not match its canonical digest ${actual}`);
  }
  if (
    snapshot.mapHash !== mapHash ||
    snapshot.mapVersion !== document.mapVersion ||
    snapshot.worldId !== document.worldId
  ) {
    throw new LedgerIntegrityError(`${label}: snapshot does not belong to map ${mapHash}`);
  }
  return { document, snapshot };
}

/** Insert a verified map inside the caller's transaction (world creation). */
export async function insertWorldMap(client: Queryable, map: StoredWorldMap): Promise<void> {
  const { document, snapshot } = map;
  await client.query(
    `INSERT INTO civ.world_maps
       (world_id, schema_version, generator, generator_version, map_version, map_hash, document, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      document.worldId,
      document.schemaVersion,
      document.generator.id,
      document.generator.version,
      document.mapVersion,
      document.mapHash,
      JSON.stringify(document),
      JSON.stringify(snapshot),
    ],
  );
}

/** Load a world's authoritative map, hash-verified. */
export async function loadWorldMap(db: Queryable, worldId: string): Promise<StoredWorldMap> {
  parseContract("world id", worldIdSchema, worldId);
  const result = await db.query<{ document: unknown; snapshot: unknown }>(
    "SELECT document, snapshot FROM civ.world_maps WHERE world_id = $1",
    [worldId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new NotFoundError(`world ${worldId} has no map`);
  const stored = verifyWorldMap(row as StoredWorldMap, `map of ${worldId}`);
  if (stored.document.worldId !== worldId) throw new LedgerIntegrityError(`map row of ${worldId} names another world`);
  return stored;
}

/**
 * The compact public projection only; the authoritative document is not
 * read. Null when the world has no map.
 */
export async function readMapSnapshot(db: Queryable, worldId: string): Promise<PublicMapSnapshot | null> {
  parseContract("world id", worldIdSchema, worldId);
  const result = await db.query<{ snapshot: unknown; map_hash: string }>(
    "SELECT snapshot, map_hash FROM civ.world_maps WHERE world_id = $1",
    [worldId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const snapshot = parseContract("map snapshot", publicMapSnapshotSchema, row.snapshot);
  if (snapshot.mapHash !== row.map_hash || snapshot.worldId !== worldId) {
    throw new LedgerIntegrityError(`map snapshot of ${worldId} does not match its row`);
  }
  return snapshot;
}
