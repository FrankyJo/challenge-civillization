import {
  hostSchema,
  logLevelSchema,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  postgresUrlSchema,
  redisUrlSchema,
  type EnvSource,
} from "@civ/contracts";
import { z } from "zod";

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  WORKER_HEALTH_HOST: hostSchema,
  WORKER_HEALTH_PORT: portSchema.default(3002),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const loadWorkerEnv = (source: EnvSource): WorkerEnv => parseEnv(workerEnvSchema, source);
