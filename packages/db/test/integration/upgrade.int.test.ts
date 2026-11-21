import { mkdtemp, readdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEphemeralDatabase, LedgerScript, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  commitCommand,
  createPool,
  createSeason,
  createWorld,
  DEFAULT_MIGRATIONS_DIR,
  latestCheckpoint,
  loadMigrations,
  loadWorldState,
  migrateDown,
  migrateUp,
  migrationStatus,
  readCommands,
  readEvents,
  resetDatabase,
  type CommitCommandInput,
  type Pool,
} from "../../src/index.js";

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
const opened: { db: EphemeralDatabase; pool: Pool }[] = [];

async function freshDatabase(): Promise<Pool> {
  const db = await createEphemeralDatabase(adminUrl);
  const pool = createPool({ connectionString: db.url, max: 4 });
  opened.push({ db, pool });
  return pool;
}

afterEach(async () => {
  for (const { db, pool } of opened.splice(0)) {
    await pool.end();
    await db.drop();
  }
});

/** A migrations directory holding only versions 1..k (the code as of an older release). */
async function migrationsUpTo(k: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `civ-mig-v${k}-`));
  for (const file of await readdir(DEFAULT_MIGRATIONS_DIR)) {
    if (Number(file.slice(0, 4)) <= k) await copyFile(join(DEFAULT_MIGRATIONS_DIR, file), join(dir, file));
  }
  return dir;
}

/** Seed a realistic authoritative dataset through the repositories (works from schema v2 on). */
async function seedFixture(pool: Pool): Promise<LedgerScript> {
  const script = new LedgerScript({ worldId: "wld_fixture01" });
  await createWorld(pool, {
    world: script.world,
    initialState: script.state,
    stateHash: script.stateHash,
    correlationId: "fixture",
  });
  await createSeason(pool, { season: script.builders.season(), correlationId: "fixture", reason: null });
  const steps = [
    () => script.advance(365, { checkpoint: true }),
    () => script.pause(),
    () => script.resume(),
    () => script.advance(100),
  ];
  for (const next of steps) {
    const step = next();
    await commitCommand(pool, step as unknown as CommitCommandInput);
    script.commit(step);
  }
  return script;
}

async function snapshot(pool: Pool, worldId: string) {
  return {
    state: await loadWorldState(pool, worldId),
    events: await readEvents(pool, { worldId, after: 0, limit: 100 }),
    commands: await readCommands(pool, { worldId, after: 0, limit: 100 }),
    checkpoint: await latestCheckpoint(pool, worldId),
  };
}

describe("migration upgrade paths", () => {
  it("every released schema version upgrades to the latest", async () => {
    const latest = (await loadMigrations()).length;
    for (let k = 1; k <= latest; k += 1) {
      const pool = await freshDatabase();
      expect(await migrateUp(pool, { dir: await migrationsUpTo(k) })).toEqual(
        Array.from({ length: k }, (_, i) => i + 1),
      );
      expect(await migrateUp(pool)).toEqual(Array.from({ length: latest - k }, (_, i) => k + i + 1));
      expect((await migrationStatus(pool)).every((row) => row.appliedAt !== null)).toBe(true);
    }
  });

  it("upgrades a v2 fixture database with authoritative data without touching facts", async () => {
    const pool = await freshDatabase();
    await migrateUp(pool, { dir: await migrationsUpTo(2) });
    const script = await seedFixture(pool);
    const before = await snapshot(pool, script.world.worldId);
    expect(before.events.events).toHaveLength(4);

    expect(await migrateUp(pool)).toEqual([3]);
    expect(await snapshot(pool, script.world.worldId)).toEqual(before);
    const projection = await pool.query("SELECT count(*)::int AS n FROM civ.proj_world_status");
    expect(projection.rows[0]).toEqual({ n: 0 });
  });

  it("rolls back projections but refuses to drop authoritative data", async () => {
    const pool = await freshDatabase();
    await migrateUp(pool);
    const script = await seedFixture(pool);
    const before = await snapshot(pool, script.world.worldId);

    expect(await migrateDown(pool)).toEqual([3]);
    await expect(migrateDown(pool)).rejects.toThrow(/refusing to roll back 0002/);
    expect((await migrationStatus(pool)).map((row) => row.appliedAt !== null)).toEqual([true, true, false]);
    expect(await snapshot(pool, script.world.worldId)).toEqual(before);
    expect(await migrateUp(pool)).toEqual([3]);
  });

  it("development reset drops everything and re-applies all migrations", async () => {
    const pool = await freshDatabase();
    await migrateUp(pool);
    await seedFixture(pool);
    expect(await resetDatabase(pool)).toEqual([1, 2, 3]);
    const worlds = await pool.query("SELECT count(*)::int AS n FROM civ.worlds");
    expect(worlds.rows[0]).toEqual({ n: 0 });
  });
});
