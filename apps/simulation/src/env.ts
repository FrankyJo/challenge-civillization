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

export const simulationEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema,
    SIMULATION_HEALTH_HOST: hostSchema,
    SIMULATION_HEALTH_PORT: portSchema.default(3001),
    DATABASE_URL: postgresUrlSchema,
    /** The world runner advances scheduled worlds; disable to run a health-only process. */
    RUNNER_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    RUNNER_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    RUNNER_LEASE_TTL_MS: z.coerce.number().int().min(1_000).max(600_000).default(15_000),
    RUNNER_MAX_TICKS_PER_BATCH: z.coerce.number().int().min(1).max(3_650).default(365),
    /** About two hours of season pace (≈1,027 ticks/hour). */
    RUNNER_CATCH_UP_CEILING_TICKS: z.coerce.number().int().min(0).max(739_490).default(2_000),
    /** About six minutes of season pace. */
    RUNNER_BACKLOG_ALERT_TICKS: z.coerce.number().int().min(1).max(739_490).default(100),
    /** Single-step controls; refused when NODE_ENV is production. */
    RUNNER_ALLOW_STEP: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /** Operators whose controls are honoured: comma-separated IDs, or "*" (refused in production). Empty: none. */
    RUNNER_CONTROL_OPERATORS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      )
      .pipe(z.array(z.union([z.literal("*"), z.string().regex(/^opr_[0-9a-z]{8,64}$/)]))),
    /** Largest schedule extension per control (minutes; default 7 days). */
    RUNNER_MAX_EXTENSION_MINUTES: z.coerce.number().int().min(1).max(43_200).default(10_080),
  })
  .refine((env) => !(env.RUNNER_ALLOW_STEP && env.NODE_ENV === "production"), {
    path: ["RUNNER_ALLOW_STEP"],
    message: "single-step must not be enabled in production",
  })
  .refine((env) => !(env.RUNNER_CONTROL_OPERATORS.includes("*") && env.NODE_ENV === "production"), {
    path: ["RUNNER_CONTROL_OPERATORS"],
    message: "production must list operator IDs explicitly",
  });
export type SimulationEnv = z.infer<typeof simulationEnvSchema>;

export const loadSimulationEnv = (source: EnvSource): SimulationEnv => parseEnv(simulationEnvSchema, source);
