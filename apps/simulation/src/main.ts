import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { createPool, databaseNow, pingDatabase } from "@civ/db";
import { ENGINE_VERSION } from "@civ/domain";
import { createHealthServer, createLogger, installGracefulShutdown } from "@civ/telemetry";
import { loadSimulationEnv } from "./env.js";
import { SimulationRunner, startRunnerLoop } from "./runner.js";
import { seasonOneEngine } from "./systems.js";

// The headless simulation process: reports health and, unless disabled,
// runs the world runner that advances every scheduled world under a
// PostgreSQL lease (docs/RUNNER.md). Browser/API uptime never drives it.
const env = loadSimulationEnv(process.env);
const logger = createLogger({ service: "simulation", level: env.LOG_LEVEL });
const pool = createPool({ connectionString: env.DATABASE_URL, max: 4, applicationName: "civ-simulation" });

const holder = `${hostname()
  .replace(/[^A-Za-z0-9._-]/g, "-")
  .slice(0, 60)}:${process.pid}:${randomUUID().slice(0, 8)}`;
const runner = new SimulationRunner({
  pool,
  holder,
  // The database clock: the same clock that decides lease expiry.
  now: () => databaseNow(pool),
  logger,
  engineFor: (world) => seasonOneEngine(pool, world),
  leaseTtlMs: env.RUNNER_LEASE_TTL_MS,
  maxTicksPerBatch: env.RUNNER_MAX_TICKS_PER_BATCH,
  catchUpCeilingTicks: env.RUNNER_CATCH_UP_CEILING_TICKS,
  backlogAlertTicks: env.RUNNER_BACKLOG_ALERT_TICKS,
  allowStep: env.RUNNER_ALLOW_STEP,
  controlOperators: env.RUNNER_CONTROL_OPERATORS.includes("*") ? "any" : new Set(env.RUNNER_CONTROL_OPERATORS),
  maxExtensionMs: env.RUNNER_MAX_EXTENSION_MINUTES * 60_000,
});
const loop = env.RUNNER_ENABLED ? startRunnerLoop(runner, env.RUNNER_INTERVAL_MS, logger) : null;
const startedAt = Date.now();

const server = createHealthServer({
  service: "simulation",
  version: ENGINE_VERSION,
  probes: {
    postgres: () => pingDatabase(pool),
    // Liveness of the runner loop: a cycle must have completed recently.
    ...(loop === null
      ? {}
      : {
          runner: async () => {
            const last =
              runner.lastSuccessAt ?? (Date.now() - startedAt < 5 * env.RUNNER_INTERVAL_MS ? Date.now() : null);
            if (runner.lastFailure !== null) throw new Error(runner.lastFailure);
            if (last === null || Date.now() - last > 5 * env.RUNNER_INTERVAL_MS + env.RUNNER_LEASE_TTL_MS) {
              throw new Error("no successful runner cycle recently");
            }
          },
        }),
  },
  logger,
  ...(loop === null ? {} : { metrics: () => runner.metricsText() }),
});

server.on("error", (error) => {
  logger.fatal({ err: error }, "health server failed");
  process.exit(1);
});

server.listen(env.SIMULATION_HEALTH_PORT, env.SIMULATION_HEALTH_HOST, () => {
  logger.info(
    { port: env.SIMULATION_HEALTH_PORT, engineVersion: ENGINE_VERSION, runner: env.RUNNER_ENABLED, holder },
    "simulation process ready",
  );
});

installGracefulShutdown({
  logger,
  steps: [
    ["runner", () => loop?.stop() ?? Promise.resolve()],
    [
      "health server",
      () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    ],
    ["postgres", () => pool.end()],
  ],
});
