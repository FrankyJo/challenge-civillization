import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEphemeralDatabase, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPool,
  DEFAULT_MIGRATIONS_DIR,
  MIGRATION_LOCK_KEY,
  migrateDown,
  migrateUp,
  migrationStatus,
  pingDatabase,
  type Pool,
} from "../../src/index.js";

const adminUrl = requireTestEnv("TEST_DATABASE_URL");

let db: EphemeralDatabase | undefined;
let pool: Pool | undefined;

beforeEach(async () => {
  db = await createEphemeralDatabase(adminUrl);
  pool = createPool({ connectionString: db.url, max: 4 });
});

afterEach(async () => {
  await pool?.end();
  await db?.drop();
  pool = undefined;
  db = undefined;
});

function currentPool(): Pool {
  if (!pool) throw new Error("test database was not created");
  return pool;
}

async function schemaExists(name: string): Promise<boolean> {
  const result = await currentPool().query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [name]);
  return result.rowCount === 1;
}

async function tableExists(name: string): Promise<boolean> {
  const result = await currentPool().query("SELECT to_regclass($1) IS NOT NULL AS present", [name]);
  return (result.rows[0] as { present: boolean }).present;
}

async function copyMigrations(extra: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "civ-mig-int-"));
  await cp(DEFAULT_MIGRATIONS_DIR, dir, { recursive: true });
  await Promise.all(Object.entries(extra).map(([name, sql]) => writeFile(join(dir, name), sql)));
  return dir;
}

describe("migration lifecycle against real PostgreSQL", () => {
  it("pings the database", async () => {
    await expect(pingDatabase(currentPool())).resolves.toBeUndefined();
  });

  it("applies, is idempotent, reports status, and rolls back", async () => {
    expect(await migrateUp(currentPool())).toEqual([1]);
    expect(await schemaExists("civ")).toBe(true);
    expect(await migrateUp(currentPool())).toEqual([]);

    const status = await migrationStatus(currentPool());
    expect(status).toHaveLength(1);
    expect(status[0]?.appliedAt).toBeInstanceOf(Date);

    expect(await migrateDown(currentPool())).toEqual([1]);
    expect(await schemaExists("civ")).toBe(false);
    expect((await migrationStatus(currentPool()))[0]?.appliedAt).toBeNull();
    expect(await migrateDown(currentPool())).toEqual([]);

    expect(await migrateUp(currentPool())).toEqual([1]);
  });

  it("serialises concurrent migrators so each migration applies exactly once", async () => {
    const results = await Promise.all([migrateUp(currentPool()), migrateUp(currentPool()), migrateUp(currentPool())]);
    expect(results.flat().sort()).toEqual([1]);
    const rows = await currentPool().query("SELECT count(*)::int AS n FROM public.schema_migrations");
    expect((rows.rows[0] as { n: number }).n).toBe(1);
  });

  it("rolls back a failing migration atomically and records nothing", async () => {
    const dir = await copyMigrations({
      "0002_broken.up.sql": "CREATE TABLE civ.half_done (id int); SELECT * FROM civ.does_not_exist;",
      "0002_broken.down.sql": "DROP TABLE civ.half_done;",
    });
    await expect(migrateUp(currentPool(), { dir })).rejects.toThrow(
      /migration 2 \(broken\) up failed and was rolled back/,
    );
    expect(await tableExists("civ.half_done")).toBe(false);
    const status = await migrationStatus(currentPool(), { dir });
    expect(status.map((s) => s.appliedAt !== null)).toEqual([true, false]);
  });

  it("refuses to run when an applied migration was edited", async () => {
    const dir = await copyMigrations();
    await migrateUp(currentPool(), { dir });
    await writeFile(join(dir, "0001_baseline.up.sql"), "CREATE SCHEMA IF NOT EXISTS civ; -- edited\n");
    await expect(migrateUp(currentPool(), { dir })).rejects.toThrow(/was modified after being applied/);
    await expect(migrateDown(currentPool(), { dir })).rejects.toThrow(/was modified after being applied/);
  });

  it("refuses to run when the database is ahead of the code", async () => {
    const dir = await copyMigrations({
      "0002_extra.up.sql": "CREATE TABLE civ.extra (id int);",
      "0002_extra.down.sql": "DROP TABLE civ.extra;",
    });
    await migrateUp(currentPool(), { dir });
    await expect(migrateUp(currentPool())).rejects.toThrow(/not on disk/);
    expect(await migrateDown(currentPool(), { dir, steps: 2 })).toEqual([2, 1]);
  });

  it("detects edits to an applied down script", async () => {
    const dir = await copyMigrations();
    await migrateUp(currentPool(), { dir });
    await writeFile(join(dir, "0001_baseline.down.sql"), "DROP SCHEMA civ CASCADE;\n");
    await expect(migrateUp(currentPool(), { dir })).rejects.toThrow(/was modified after being applied/);
  });

  it("refuses to run over a gap in recorded history", async () => {
    const dir = await copyMigrations({
      "0002_two.up.sql": "SELECT 2;",
      "0002_two.down.sql": "SELECT 2;",
      "0003_three.up.sql": "SELECT 3;",
      "0003_three.down.sql": "SELECT 3;",
    });
    await migrateUp(currentPool(), { dir });
    await currentPool().query("DELETE FROM public.schema_migrations WHERE version = 2");
    await expect(migrateUp(currentPool(), { dir })).rejects.toThrow(/gap: expected version 2 but found 3/);
  });

  it("status is read-only on a fresh database", async () => {
    expect((await migrationStatus(currentPool()))[0]?.appliedAt).toBeNull();
    expect(await tableExists("public.schema_migrations")).toBe(false);
  });

  it("times out instead of waiting forever for another migrator", async () => {
    const holder = await currentPool().connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      await expect(migrateUp(currentPool(), { lockTimeoutMs: 300 })).rejects.toThrow(
        /could not acquire the migration lock/,
      );
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
      holder.release();
    }
    expect(await migrateUp(currentPool())).toEqual([1]);
  });

  it("validates the steps argument", async () => {
    await expect(migrateDown(currentPool(), { steps: 0 })).rejects.toThrow(/positive integer/);
  });
});
