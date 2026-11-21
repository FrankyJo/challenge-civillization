import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicMapSnapshotSchema, worldMapSchema, type PublicMapSnapshot, type WorldMap } from "@civ/contracts";
import { createEphemeralDatabase, LedgerScript, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalDigest,
  createPool,
  createWorld,
  getWorld,
  LedgerIntegrityError,
  loadWorldMap,
  migrateUp,
  NotFoundError,
  readMapSnapshot,
  type Pool,
  type StoredWorldMap,
} from "../../src/index.js";

// The frozen contract fixtures are a real generator output (10 × 8 cells).
const fixtures = resolve(import.meta.dirname, "..", "..", "..", "contracts", "fixtures", "v1");
const document: WorldMap = worldMapSchema.parse(JSON.parse(readFileSync(resolve(fixtures, "world-map.json"), "utf8")));
const snapshot: PublicMapSnapshot = publicMapSnapshotSchema.parse(
  JSON.parse(readFileSync(resolve(fixtures, "public-map-snapshot.json"), "utf8")),
);
const map: StoredWorldMap = { document, snapshot };

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
let db: EphemeralDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await createEphemeralDatabase(adminUrl);
  pool = createPool({ connectionString: db.url, max: 4 });
  await migrateUp(pool);
});

afterAll(async () => {
  await pool.end();
  await db.drop();
});

function scriptFor(worldId: string): LedgerScript {
  return new LedgerScript({ worldId });
}

async function create(worldId: string, stored: StoredWorldMap | undefined, seed = document.seed) {
  const script = scriptFor(worldId);
  await createWorld(pool, {
    world: { ...script.world, seed },
    initialState: script.state,
    stateHash: script.stateHash,
    ...(stored === undefined ? {} : { map: stored }),
    correlationId: `create-${worldId}`,
  });
}

/** Re-hash a deliberately changed document so only the targeted check fails. */
function rehashed(changed: Omit<WorldMap, "mapHash">): WorldMap {
  return { ...changed, mapHash: canonicalDigest(changed) } as WorldMap;
}

describe("world maps", () => {
  it("stores the map with the world and reads it back hash-verified", async () => {
    await create(document.worldId, map);
    expect(await loadWorldMap(pool, document.worldId)).toEqual(map);
    expect(await readMapSnapshot(pool, document.worldId)).toEqual(snapshot);
    const audit = await pool.query<{ details: { mapHash: string; mapVersion: string } }>(
      "SELECT details FROM civ.audit_log WHERE world_id = $1 AND action = 'world.created'",
      [document.worldId],
    );
    expect(audit.rows[0]?.details).toMatchObject({ mapHash: document.mapHash, mapVersion: document.mapVersion });
  });

  it("refuses maps that are tampered with, foreign or mismatched, writing nothing", async () => {
    const { mapHash: _hash, ...unhashed } = document;
    const tampered = { ...document, cells: { ...document.cells, elevationM: document.cells.elevationM.map(() => 1) } };
    const cases: [string, StoredWorldMap, string, RegExp][] = [
      ["wld_mapbad01", { document: tampered, snapshot }, document.seed, /does not match its canonical digest/],
      ["wld_mapbad02", map, document.seed, /generated for this world/],
      ["wld_mapbad03", map, "00000000000000aa", /generated for this world/],
      [
        "wld_mapbad04",
        { document: rehashed({ ...unhashed, params: { ...unhashed.params, minLandmassCells: 3 } }), snapshot },
        document.seed,
        /snapshot does not belong/,
      ],
    ];
    for (const [worldId, stored, seed, message] of cases) {
      const target =
        worldId === "wld_mapbad01" || worldId === "wld_mapbad04" ? document.worldId : (worldId as WorldMap["worldId"]);
      const script = scriptFor(target);
      await expect(
        createWorld(pool, {
          world: { ...script.world, worldId: target, seed },
          initialState: script.state,
          stateHash: script.stateHash,
          map: stored,
          correlationId: "bad-map",
        }),
      ).rejects.toThrow(message);
    }
    await expect(create("wld_mapbad05", { document, snapshot: { ...snapshot, terrain: "x" } })).rejects.toThrow();
    expect(await getWorld(pool, "wld_mapbad05")).toBeNull();
    const rows = await pool.query("SELECT count(*)::int AS n FROM civ.world_maps");
    expect(rows.rows[0]).toEqual({ n: 1 });
  });

  it("serves no map for map-less worlds", async () => {
    await create("wld_nomap001", undefined, "0123456789abcdef");
    await expect(loadWorldMap(pool, "wld_nomap001")).rejects.toThrow(NotFoundError);
    expect(await readMapSnapshot(pool, "wld_nomap001")).toBeNull();
    await expect(readMapSnapshot(pool, "not a world")).rejects.toThrow();
  });

  it("is append-only and constrained in the database", async () => {
    for (const sql of [
      "UPDATE civ.world_maps SET generator = 'x'",
      "DELETE FROM civ.world_maps",
      "TRUNCATE civ.world_maps CASCADE",
    ]) {
      await expect(pool.query(sql), sql).rejects.toMatchObject({ code: "23001" });
    }
    const other = { ...snapshot, mapHash: `sha256:${"0".repeat(64)}` };
    await expect(
      pool.query(
        `INSERT INTO civ.world_maps (world_id, schema_version, generator, generator_version, map_version, map_hash, document, snapshot)
         VALUES ('wld_nomap001', 1, 'civ-hexgen', '1.0.0', $1, $2, $3, $4)`,
        [document.mapVersion, document.mapHash, JSON.stringify(document), JSON.stringify(other)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("detects a stored document that no longer matches its hash", async () => {
    const client = await pool.connect();
    try {
      // Simulate storage corruption by a privileged operator bypassing the guard.
      await client.query("BEGIN");
      await client.query("ALTER TABLE civ.world_maps DISABLE TRIGGER world_maps_append_only");
      await client.query(
        `UPDATE civ.world_maps SET document = jsonb_set(document, '{cells,elevationM,0}', '-7') WHERE world_id = $1`,
        [document.worldId],
      );
      await expect(loadWorldMap(client, document.worldId)).rejects.toThrow(LedgerIntegrityError);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect(await loadWorldMap(pool, document.worldId)).toEqual(map);
  });
});
