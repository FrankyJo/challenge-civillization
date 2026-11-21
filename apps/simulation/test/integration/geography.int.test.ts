import { type Digest } from "@civ/contracts";
import {
  canonicalDigest,
  createPool,
  createWorld,
  LedgerIntegrityError,
  migrateUp,
  readMapSnapshot,
  type Pool,
} from "@civ/db";
import { createEngine, createSystemSchedule, DEFAULT_MAP_PARAMS, SEASON_ONE_SPAN } from "@civ/domain";
import { createContractBuilders, createEphemeralDatabase, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadGeography, prepareGeography } from "../../src/geography.js";

const CONTENT: Digest = `sha256:${"c".repeat(64)}`;
const SEED = "9e3779b97f4a7c15";
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

async function launch(worldId: string, params = DEFAULT_MAP_PARAMS) {
  const geography = prepareGeography({ worldId, seed: SEED, params });
  const engine = createEngine({
    worldId,
    seed: SEED,
    span: SEASON_ONE_SPAN,
    contentVersion: CONTENT,
    schedule: createSystemSchedule([]),
    geography: geography.reference,
  });
  const initial = engine.initialState({});
  const builders = createContractBuilders({ worldId });
  await createWorld(pool, {
    world: { ...builders.world(), seed: SEED, versions: engine.versions },
    initialState: initial,
    stateHash: canonicalDigest(initial),
    map: { document: geography.map, snapshot: geography.snapshot },
    correlationId: `launch-${worldId}`,
  });
  return { geography, engine };
}

describe("world geography", () => {
  it("launches a world with its map and reloads the identical, reproducible map", async () => {
    const { geography, engine } = await launch("wld_geo00001");
    expect(engine.config.geography).toEqual(geography.reference);
    const loaded = await loadGeography(pool, "wld_geo00001", geography.reference);
    expect(loaded.map).toEqual(geography.map);
    expect(loaded.regenerated).toBe(true);
    expect(await readMapSnapshot(pool, "wld_geo00001")).toEqual(geography.snapshot);
    expect(geography.stats.landCells).toBeGreaterThan(1_000);
  });

  it("refuses a stored map that is not the one the engine expects", async () => {
    const { geography } = await launch("wld_geo00002", {
      ...DEFAULT_MAP_PARAMS,
      width: 24,
      height: 18,
      regionTargetCells: 20,
    });
    const other = prepareGeography({ worldId: "wld_geo00002", seed: SEED });
    await expect(loadGeography(pool, "wld_geo00002", other.reference)).rejects.toThrow(LedgerIntegrityError);
    expect((await loadGeography(pool, "wld_geo00002", geography.reference)).reference).toEqual(geography.reference);
  });
});
