import {
  hostSchema,
  logLevelSchema,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  postgresUrlSchema,
  type EnvSource,
} from "@civ/contracts";
import { z } from "zod";

export const simulationEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  SIMULATION_HEALTH_HOST: hostSchema,
  SIMULATION_HEALTH_PORT: portSchema.default(3001),
  DATABASE_URL: postgresUrlSchema,
});
export type SimulationEnv = z.infer<typeof simulationEnvSchema>;

export const loadSimulationEnv = (source: EnvSource): SimulationEnv => parseEnv(simulationEnvSchema, source);
