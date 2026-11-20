import { randomBytes } from "node:crypto";
import pg from "pg";

export interface EphemeralDatabase {
  /** Connection URL for the freshly created, empty database. */
  readonly url: string;
  readonly name: string;
  /** Terminate connections and drop the database. Safe to call twice. */
  drop(): Promise<void>;
}

const NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function ephemeralDatabaseName(prefix: string): string {
  const name = `${prefix}_${randomBytes(6).toString("hex")}`;
  if (!NAME_PATTERN.test(name)) throw new Error(`invalid database name: ${name}`);
  return name;
}

/**
 * Create an isolated database on the server addressed by `adminUrl` (the
 * connecting role needs CREATEDB). Each test file gets its own database, so
 * suites never share or leak state.
 */
export async function createEphemeralDatabase(adminUrl: string, prefix = "civ_test"): Promise<EphemeralDatabase> {
  const name = ephemeralDatabaseName(prefix);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  let dropped = false;
  return {
    url: url.toString(),
    name,
    async drop() {
      if (dropped) return;
      dropped = true;
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}
