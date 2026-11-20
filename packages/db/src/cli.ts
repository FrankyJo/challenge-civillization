#!/usr/bin/env node
import { parseEnv, postgresUrlSchema } from "@civ/contracts";
import { z } from "zod";
import { createPool } from "./pool.js";
import { migrateDown, migrateUp, migrationStatus } from "./migrations.js";

const USAGE = "usage: civ-migrate <up|down [steps]|status>";

async function main(argv: readonly string[]): Promise<void> {
  const [command, stepsArg] = argv;
  if (command !== "up" && command !== "down" && command !== "status") throw new Error(USAGE);
  const env = parseEnv(z.object({ DATABASE_URL: postgresUrlSchema }), process.env);
  const pool = createPool({ connectionString: env.DATABASE_URL, max: 1, applicationName: "civ-migrate" });
  try {
    if (command === "up") {
      const applied = await migrateUp(pool);
      console.log(applied.length ? `applied: ${applied.join(", ")}` : "already up to date");
    } else if (command === "down") {
      const steps = stepsArg === undefined ? 1 : Number(stepsArg);
      const reverted = await migrateDown(pool, { steps });
      console.log(reverted.length ? `reverted: ${reverted.join(", ")}` : "nothing to revert");
    } else {
      for (const row of await migrationStatus(pool)) {
        console.log(
          `${String(row.version).padStart(4, "0")} ${row.name.padEnd(32)} ${row.appliedAt?.toISOString() ?? "pending"}`,
        );
      }
    }
  } finally {
    await pool.end();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
