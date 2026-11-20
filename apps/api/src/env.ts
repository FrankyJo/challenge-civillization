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

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  API_HOST: hostSchema,
  API_PORT: portSchema.default(3000),
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const loadApiEnv = (source: EnvSource): ApiEnv => parseEnv(apiEnvSchema, source);
