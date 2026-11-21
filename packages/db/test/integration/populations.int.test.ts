import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  publicMapSnapshotSchema,
  seedPopulationSchema,
  worldDataSchema,
  worldMapSchema,
  type SeedPopulation,
} from "@civ/contracts";
import { createEphemeralDatabase, LedgerScript, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalDigest,
  createPool,
  createWorld,
  getWorld,
  LedgerIntegrityError,
  loadWorldPopulation,
  migrateDown,
  migrateUp,
  NotFoundError,
  type Pool,
  type StoredPopulation,
} from "../../src/index.js";

// Frozen contract fixtures: a real generator output (12 people on the 10 × 8 fixture map).
const fixtures = resolve(import.meta.dirname, "..", "..", "..", "contracts", "fixtures", "v1");
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(fixtures, `${name}.json`), "utf8"));
const document = worldMapSchema.parse(read("world-map"));
const snapshot = publicMapSnapshotSchema.parse(read("public-map-snapshot"));
const population: SeedPopulation = seedPopulationSchema.parse(read("seed-population"));
const data = worldDataSchema.parse(read("world-data"));
const stored: StoredPopulation = { population, populationHash: data.seedPopulationHash };

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

function createInput(overrides: { population?: StoredPopulation; withMap?: boolean; contentVersion?: string } = {}) {
  const script = new LedgerScript({ worldId: document.worldId });
  return {
    world: {
      ...script.world,
      seed: document.seed,
      versions: { ...script.world.versions, contentVersion: overrides.contentVersion ?? population.contentVersion },
    },
    initialState: script.state,
    stateHash: script.stateHash,
    ...(overrides.withMap === false ? {} : { map: { document, snapshot } }),
    population: overrides.population ?? stored,
    correlationId: "launch",
  } as Parameters<typeof createWorld>[1];
}

describe("seed populations", () => {
  it("refuses populations that are tampered with or detached from their map and content", async () => {
    const tampered = {
      ...population,
      persons: population.persons.map((person, index) => (index === 0 ? { ...person, birthTick: -400 } : person)),
    };
    await expect(
      createWorld(pool, createInput({ population: { population: tampered, populationHash: data.seedPopulationHash } })),
    ).rejects.toThrow(/does not match its canonical digest/);
    await expect(createWorld(pool, createInput({ withMap: false }))).rejects.toThrow(
      /with the map it was synthesized on/,
    );
    await expect(createWorld(pool, createInput({ contentVersion: `sha256:${"d".repeat(64)}` }))).rejects.toThrow(
      /its content version/,
    );
    expect(await getWorld(pool, document.worldId)).toBeNull();
  });

  it("stores the population with its world and reads it back hash-verified", async () => {
    await createWorld(pool, createInput());
    const loaded = await loadWorldPopulation(pool, document.worldId);
    expect(loaded).toEqual(stored);
    expect(canonicalDigest(loaded.population)).toBe(data.seedPopulationHash);
    const audit = await pool.query<{ details: { populationHash: string; living: number } }>(
      "SELECT details FROM civ.audit_log WHERE world_id = $1 AND action = 'world.created'",
      [document.worldId],
    );
    expect(audit.rows[0]?.details).toMatchObject({ populationHash: data.seedPopulationHash, living: 12 });
    await expect(loadWorldPopulation(pool, "wld_nopopulat")).rejects.toThrow(NotFoundError);
  });

  it("is append-only and constrained in the database", async () => {
    for (const sql of [
      "UPDATE civ.world_populations SET living = 1",
      "DELETE FROM civ.world_populations",
      "TRUNCATE civ.world_populations CASCADE",
    ]) {
      await expect(pool.query(sql), sql).rejects.toMatchObject({ code: "23001" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("ALTER TABLE civ.world_populations DISABLE TRIGGER world_populations_append_only");
      // The living count must equal the stored persons (CHECK constraint).
      await expect(client.query("UPDATE civ.world_populations SET living = living + 1")).rejects.toMatchObject({
        code: "23514",
      });
      await client.query("ROLLBACK");
      // Storage corruption is detected on load.
      await client.query("BEGIN");
      await client.query("ALTER TABLE civ.world_populations DISABLE TRIGGER world_populations_append_only");
      await client.query(
        `UPDATE civ.world_populations SET document = jsonb_set(document, '{persons,0,birthTick}', '-999')`,
      );
      await expect(loadWorldPopulation(client, document.worldId)).rejects.toThrow(LedgerIntegrityError);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("refuses to roll back 0005 while a population is stored", async () => {
    await expect(migrateDown(pool)).rejects.toThrow(/refusing to roll back 0005/);
    expect((await loadWorldPopulation(pool, document.worldId)).populationHash).toBe(data.seedPopulationHash);
  });
});
