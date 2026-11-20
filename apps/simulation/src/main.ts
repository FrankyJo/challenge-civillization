import { createPool, pingDatabase } from "@civ/db";
import { ENGINE_VERSION } from "@civ/domain";
import { createHealthServer, createLogger, installGracefulShutdown } from "@civ/telemetry";
import { loadSimulationEnv } from "./env.js";

// Phase 00: process skeleton only. It connects to PostgreSQL and reports
// health; it does not advance any world. The tick runner, world lease and
// checkpoints are Phase 06 deliverables.
const env = loadSimulationEnv(process.env);
const logger = createLogger({ service: "simulation", level: env.LOG_LEVEL });
const pool = createPool({ connectionString: env.DATABASE_URL, max: 2, applicationName: "civ-simulation" });

const server = createHealthServer({
  service: "simulation",
  version: ENGINE_VERSION,
  probes: { postgres: () => pingDatabase(pool) },
  logger,
});

server.on("error", (error) => {
  logger.fatal({ err: error }, "health server failed");
  process.exit(1);
});

server.listen(env.SIMULATION_HEALTH_PORT, env.SIMULATION_HEALTH_HOST, () => {
  logger.info(
    { port: env.SIMULATION_HEALTH_PORT, engineVersion: ENGINE_VERSION },
    "simulation process ready (no world loaded)",
  );
});

installGracefulShutdown({
  logger,
  steps: [
    [
      "health server",
      () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    ],
    ["postgres", () => pool.end()],
  ],
});
