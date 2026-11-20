import { createPool, pingDatabase } from "@civ/db";
import { createLogger, installGracefulShutdown } from "@civ/telemetry";
import { Redis } from "ioredis";
import { buildApp } from "./app.js";
import { loadApiEnv } from "./env.js";

const env = loadApiEnv(process.env);
const logger = createLogger({ service: "api", level: env.LOG_LEVEL });
const pool = createPool({ connectionString: env.DATABASE_URL, applicationName: "civ-api" });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on("error", (error) => logger.warn({ err: error }, "redis connection error"));

const app = buildApp({
  logger,
  probes: {
    postgres: () => pingDatabase(pool),
    redis: async () => {
      const reply = await redis.ping();
      if (reply !== "PONG") throw new Error(`unexpected PING reply: ${reply}`);
    },
  },
});

installGracefulShutdown({
  logger,
  steps: [
    ["http", () => app.close()],
    ["postgres", () => pool.end()],
    ["redis", () => void redis.disconnect()],
  ],
});

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  logger.fatal({ err: error }, "failed to start");
  process.exit(1);
}
