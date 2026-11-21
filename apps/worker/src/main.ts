import { createPool, pingDatabase } from "@civ/db";
import { createHealthServer, createLogger, installGracefulShutdown } from "@civ/telemetry";
import { Redis } from "ioredis";
import { loadWorkerEnv } from "./env.js";
import { createLedgerQueue, startLedgerWorker, startOutboxRelay, startReconciler } from "./ledger.js";
import { startSystemWorker } from "./worker.js";

export const WORKER_VERSION = "0.1.0";

const env = loadWorkerEnv(process.env);
const logger = createLogger({ service: "worker", level: env.LOG_LEVEL });
const pool = createPool({ connectionString: env.DATABASE_URL, max: 4, applicationName: "civ-worker" });
// BullMQ workers need blocking commands: maxRetriesPerRequest must be null.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const probeRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
for (const client of [connection, probeRedis]) {
  client.on("error", (error) => logger.warn({ err: error }, "redis connection error"));
}

const worker = startSystemWorker({ connection, logger, concurrency: env.WORKER_CONCURRENCY });
const ledgerQueue = createLedgerQueue(connection);
const ledgerWorker = startLedgerWorker({ connection, pool, logger, concurrency: env.WORKER_CONCURRENCY });
const relay = startOutboxRelay({ pool, queue: ledgerQueue, logger, intervalMs: env.OUTBOX_RELAY_INTERVAL_MS });
const reconciler = startReconciler({ pool, logger, intervalMs: env.PROJECTION_RECONCILE_INTERVAL_MS });
void reconciler.runOnce();

const server = createHealthServer({
  service: "worker",
  version: WORKER_VERSION,
  probes: {
    postgres: () => pingDatabase(pool),
    redis: async () => {
      const reply = await probeRedis.ping();
      if (reply !== "PONG") throw new Error(`unexpected PING reply: ${reply}`);
    },
    consumer: async () => {
      if (!worker.isRunning()) throw new Error("system queue consumer is not running");
      if (!ledgerWorker.isRunning()) throw new Error("ledger queue consumer is not running");
    },
  },
  logger,
});

server.on("error", (error) => {
  logger.fatal({ err: error }, "health server failed");
  process.exit(1);
});
server.listen(env.WORKER_HEALTH_PORT, env.WORKER_HEALTH_HOST, () => {
  logger.info({ port: env.WORKER_HEALTH_PORT }, "worker ready");
});

installGracefulShutdown({
  logger,
  // worker.close() waits for in-flight jobs; the shutdown timeout bounds it.
  timeoutMs: 20_000,
  steps: [
    [
      "health server",
      () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    ],
    ["outbox relay", () => relay.stop()],
    ["projection reconciler", () => reconciler.stop()],
    ["queue consumer", () => worker.close()],
    ["ledger consumer", () => ledgerWorker.close()],
    ["ledger queue", () => ledgerQueue.close()],
    ["postgres", () => pool.end()],
    [
      "redis",
      () => {
        connection.disconnect();
        probeRedis.disconnect();
      },
    ],
  ],
});
