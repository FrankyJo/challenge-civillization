import { type WorldData } from "@civ/contracts";
import { SEASON_ONE_CONTENT_VERSION } from "@civ/content";
import {
  AlreadyExistsError,
  createPool,
  latestCheckpoint,
  LedgerIntegrityError,
  loadWorldState,
  migrateUp,
  type Pool,
} from "@civ/db";
import { canonicalHash, createSystemSchedule } from "@civ/domain";
import { createEphemeralDatabase, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadGeography } from "../../src/geography.js";
import { launchWorld, loadSeedPopulation } from "../../src/launch.js";

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

const schedule = createSystemSchedule<WorldData>([]);
const launch = (worldId: string) =>
  launchWorld({
    pool,
    worldId,
    name: "Launch test",
    seed: "9e3779b97f4a7c15",
    createdAt: "2026-11-21T12:00:00Z",
    createdBy: { kind: "system", component: "simulation" },
    correlationId: `launch-${worldId}`,
    schedule,
  });

describe("world launch", () => {
  it("stores map, 10,000 people and an initial state bound to both, and reloads them reproducibly", async () => {
    const launched = await launch("wld_launch0001");
    expect(launched.population.persons).toHaveLength(10_000);
    expect(launched.engine.versions.contentVersion).toBe(SEASON_ONE_CONTENT_VERSION);
    expect(launched.report.plausibility.every((check) => check.ok)).toBe(true);

    const current = await loadWorldState(pool, "wld_launch0001");
    expect(current.state.data).toEqual({ schemaVersion: 1, seedPopulationHash: launched.populationHash });
    expect(current.versions).toEqual(launched.engine.versions);
    const checkpoint = await latestCheckpoint(pool, "wld_launch0001");
    expect(checkpoint?.checkpoint.stateHash).toBe(canonicalHash(current.state));

    const geography = await loadGeography(pool, "wld_launch0001", launched.geography.reference);
    const loaded = await loadSeedPopulation({
      pool,
      worldId: "wld_launch0001",
      seed: "9e3779b97f4a7c15",
      data: current.state.data,
      map: geography.map,
    });
    expect(loaded.populationHash).toBe(launched.populationHash);
    expect(loaded.regenerated).toBe(true);
  });

  it("refuses a second launch and a state that names another population", async () => {
    await expect(launch("wld_launch0001")).rejects.toThrow(AlreadyExistsError);
    const current = await loadWorldState(pool, "wld_launch0001");
    const geography = await loadGeography(pool, "wld_launch0001", await referenceOf());
    await expect(
      loadSeedPopulation({
        pool,
        worldId: "wld_launch0001",
        seed: "9e3779b97f4a7c15",
        data: { ...(current.state.data as WorldData), seedPopulationHash: `sha256:${"0".repeat(64)}` },
        map: geography.map,
      }),
    ).rejects.toThrow(LedgerIntegrityError);
  });
});

async function referenceOf() {
  const result = await pool.query<{ map_version: string; map_hash: string }>(
    "SELECT map_version, map_hash FROM civ.world_maps WHERE world_id = 'wld_launch0001'",
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("no map");
  return { mapVersion: row.map_version as `sha256:${string}`, mapHash: row.map_hash as `sha256:${string}` };
}
