import type pg from "pg";
import { parse as parseConnectionString } from "pg-connection-string";
import { ResetRefusedError } from "./errors.js";
import { migrateUp, type MigrateOptions } from "./migrations.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Development reset is allowed only when every guard holds: not production,
 * an explicit opt-in flag, and a loopback database host. It destroys all
 * data, including the append-only ledger, so it must never reach a shared
 * environment.
 */
export function assertResetAllowed(env: {
  readonly nodeEnv: string | undefined;
  readonly allowFlag: string | undefined;
  readonly databaseUrl: string;
}): void {
  if (env.nodeEnv === "production") throw new ResetRefusedError("database reset is refused when NODE_ENV=production");
  if (env.allowFlag !== "1") throw new ResetRefusedError("database reset requires CIV_ALLOW_DB_RESET=1");
  let url: URL;
  try {
    url = new URL(env.databaseUrl);
  } catch {
    throw new ResetRefusedError("database reset requires a valid DATABASE_URL");
  }
  // node-postgres lets query parameters (host, hostaddr, service, options…)
  // override the URL authority, so a reset URL may carry none at all.
  if (url.search !== "") {
    throw new ResetRefusedError("database reset refuses connection strings with query parameters");
  }
  // Check the host exactly as the driver will resolve it.
  const effective = parseConnectionString(env.databaseUrl) as { host?: string | null; hostaddr?: string };
  if (effective.hostaddr !== undefined || !LOOPBACK_HOSTS.has(effective.host ?? "")) {
    throw new ResetRefusedError("database reset is allowed only against a loopback (local) database host");
  }
}

/** Drop every Civilization object and the migration history, then migrate up. */
export async function resetDatabase(pool: pg.Pool, options: MigrateOptions = {}): Promise<number[]> {
  await pool.query("DROP SCHEMA IF EXISTS civ CASCADE");
  await pool.query("DROP TABLE IF EXISTS public.schema_migrations");
  return migrateUp(pool, options);
}
