import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

/** Directory of the migrations shipped with this package. */
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/** Arbitrary but fixed advisory-lock key serialising concurrent migrators. */
export const MIGRATION_LOCK_KEY = 7_201_000_001;

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
  readonly down: string;
  /** sha256 of up + down scripts (LF-normalised); detects edits to applied migrations. */
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: Date;
}

export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MigrationError";
  }
}

/** Line endings are normalised so a CRLF checkout does not look like an edit. */
export function normalizeSql(sql: string): string {
  return sql.replace(/\r\n?/g, "\n");
}

export function checksum(up: string, down: string): string {
  return createHash("sha256")
    .update(normalizeSql(up), "utf8")
    .update("\0", "utf8")
    .update(normalizeSql(down), "utf8")
    .digest("hex");
}

/**
 * Load and validate migrations: every version needs both up and down scripts,
 * names must agree, versions are unique and contiguous from 1, and unknown
 * files are rejected rather than silently ignored.
 */
export async function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((file) => !file.startsWith(".")).sort();
  const byVersion = new Map<number, { name: string; up?: string; down?: string }>();
  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) throw new MigrationError(`unexpected file in migrations directory: ${file}`);
    const [, versionText, name, direction] = match as unknown as [string, string, string, "up" | "down"];
    const version = Number(versionText);
    const entry = byVersion.get(version) ?? { name };
    if (entry.name !== name) {
      throw new MigrationError(`version ${versionText} has conflicting names: ${entry.name} and ${name}`);
    }
    if (entry[direction] !== undefined) throw new MigrationError(`duplicate ${direction} script for ${versionText}`);
    entry[direction] = await readFile(join(dir, file), "utf8");
    byVersion.set(version, entry);
  }

  const migrations: Migration[] = [];
  const versions = [...byVersion.keys()].sort((a, b) => a - b);
  versions.forEach((version, index) => {
    if (version !== index + 1) {
      throw new MigrationError(
        `migration versions must be contiguous from 0001; expected ${index + 1}, found ${version}`,
      );
    }
    const entry = byVersion.get(version);
    if (entry?.up === undefined || entry.down === undefined) {
      throw new MigrationError(`migration ${version} (${entry?.name}) needs both .up.sql and .down.sql`);
    }
    migrations.push({
      version,
      name: entry.name,
      up: entry.up,
      down: entry.down,
      checksum: checksum(entry.up, entry.down),
    });
  });
  return migrations;
}

const BOOKKEEPING_DDL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    integer     PRIMARY KEY,
    name       text        NOT NULL,
    checksum   text        NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

export interface LockOptions {
  /** Give up waiting for another migrator after this long (default 60s). */
  readonly lockTimeoutMs?: number;
}

const LOCK_POLL_MS = 250;
const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

async function acquireLock(client: pg.PoolClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [
      MIGRATION_LOCK_KEY,
    ]);
    if (result.rows[0]?.locked) return;
    if (Date.now() >= deadline) {
      throw new MigrationError(
        `could not acquire the migration lock within ${timeoutMs}ms; another migrator is running`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
  }
}

/**
 * Run `fn` holding the session-level advisory lock on a dedicated connection.
 * If anything fails, the connection is destroyed rather than returned to the
 * pool, which also releases the session lock server-side; the original error
 * is never masked by cleanup errors.
 */
async function withMigrationLock<T>(
  pool: pg.Pool,
  options: LockOptions,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let failure: unknown;
  let locked = false;
  try {
    await acquireLock(client, options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
    locked = true;
    return await fn(client);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (locked && failure === undefined) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
      } catch (error) {
        failure = error;
      }
    }
    client.release(failure === undefined ? undefined : failure instanceof Error ? failure : true);
  }
}

async function readApplied(client: pg.PoolClient | pg.Pool): Promise<AppliedMigration[]> {
  const present = await client.query<{ present: boolean }>(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
  );
  if (!present.rows[0]?.present) return [];
  const result = await client.query<{ version: number; name: string; checksum: string; applied_at: Date }>(
    "SELECT version, name, checksum, applied_at FROM public.schema_migrations ORDER BY version",
  );
  return result.rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
}

/** Refuse to proceed if history diverges from the files on disk. */
function verifyHistory(applied: readonly AppliedMigration[], migrations: readonly Migration[]): void {
  applied.forEach((record, index) => {
    if (record.version !== index + 1) {
      throw new MigrationError(
        `migration history has a gap: expected version ${index + 1} but found ${record.version}; restore the bookkeeping table before migrating`,
      );
    }
  });
  for (const record of applied) {
    const migration = migrations[record.version - 1];
    if (!migration) {
      throw new MigrationError(
        `database has migration ${record.version} (${record.name}) that is not on disk; deploy the newer code or restore it`,
      );
    }
    if (migration.checksum !== record.checksum) {
      throw new MigrationError(
        `applied migration ${record.version} (${record.name}) was modified after being applied; add a new migration instead`,
      );
    }
  }
}

async function inTransaction(client: pg.PoolClient, label: string, fn: () => Promise<void>): Promise<void> {
  await client.query("BEGIN");
  try {
    await fn();
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new MigrationError(
        `${label} failed (${(error as Error).message}) and ROLLBACK also failed: ${(rollbackError as Error).message}`,
        { cause: error },
      );
    }
    throw new MigrationError(`${label} failed and was rolled back: ${(error as Error).message}`, { cause: error });
  }
}

export interface MigrateOptions extends LockOptions {
  readonly dir?: string;
}

/** Apply all pending migrations, each in its own transaction. Returns versions applied. */
export async function migrateUp(pool: pg.Pool, options: MigrateOptions = {}): Promise<number[]> {
  const migrations = await loadMigrations(options.dir);
  return withMigrationLock(pool, options, async (client) => {
    await client.query(BOOKKEEPING_DDL);
    const applied = await readApplied(client);
    verifyHistory(applied, migrations);
    const done: number[] = [];
    for (const migration of migrations.slice(applied.length)) {
      await inTransaction(client, `migration ${migration.version} (${migration.name}) up`, async () => {
        await client.query(migration.up);
        await client.query("INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
          migration.version,
          migration.name,
          migration.checksum,
        ]);
      });
      done.push(migration.version);
    }
    return done;
  });
}

/** Roll back the most recent `steps` migrations (default 1). Returns versions reverted. */
export async function migrateDown(
  pool: pg.Pool,
  options: MigrateOptions & { readonly steps?: number } = {},
): Promise<number[]> {
  const steps = options.steps ?? 1;
  if (!Number.isInteger(steps) || steps < 1) throw new MigrationError(`steps must be a positive integer, got ${steps}`);
  const migrations = await loadMigrations(options.dir);
  return withMigrationLock(pool, options, async (client) => {
    await client.query(BOOKKEEPING_DDL);
    const applied = await readApplied(client);
    verifyHistory(applied, migrations);
    const reverted: number[] = [];
    for (const record of applied.slice(-steps).reverse()) {
      const migration = migrations[record.version - 1] as Migration;
      await inTransaction(client, `migration ${migration.version} (${migration.name}) down`, async () => {
        await client.query(migration.down);
        await client.query("DELETE FROM public.schema_migrations WHERE version = $1", [migration.version]);
      });
      reverted.push(migration.version);
    }
    return reverted;
  });
}

export interface MigrationStatus {
  readonly version: number;
  readonly name: string;
  readonly appliedAt: Date | null;
}

/** Read-only: takes no lock and creates nothing. */
export async function migrationStatus(
  pool: pg.Pool,
  options: Pick<MigrateOptions, "dir"> = {},
): Promise<MigrationStatus[]> {
  const migrations = await loadMigrations(options.dir);
  const applied = await readApplied(pool);
  verifyHistory(applied, migrations);
  return migrations.map((migration) => ({
    version: migration.version,
    name: migration.name,
    appliedAt: applied[migration.version - 1]?.appliedAt ?? null,
  }));
}
