import { createPool, pingDatabase } from "@civ/db";
import { createHealthServer, createLogger, installGracefulShutdown } from "@civ/telemetry";
import { Redis } from "ioredis";
import { loadWorkerEnv } from "./env.js";
import { startSystemWorker } from "./worker.js";

export const WORKER_VERSION = "0.1.0";

const env = loadWorkerEnv(process.env);
const logger = createLogger({ service: "worker", level: env.LOG_LEVEL });
const pool = createPool({ connectionString: env.DATABASE_URL, max: 2, applicationName: "civ-worker" });
// BullMQ workers need blocking commands: maxRetriesPerRequest must be null.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const probeRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
for (const client of [connection, probeRedis]) {
  client.on("error", (error) => logger.warn({ err: error }, "redis connection error"));
}

const worker = startSystemWorker({ connection, logger, concurrency: env.WORKER_CONCURRENCY });

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
    ["queue consumer", () => worker.close()],
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
