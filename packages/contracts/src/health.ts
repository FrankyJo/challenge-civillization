import { z } from "zod";

/** Version of the health report wire format. Bump on breaking change. */
export const HEALTH_REPORT_SCHEMA_VERSION = 1 as const;

export const healthStatusSchema = z.enum(["ok", "down"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const dependencyCheckSchema = z.object({
  status: healthStatusSchema,
  latencyMs: z.number().nonnegative(),
  error: z.string().optional(),
});
export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

/**
 * Health reports are read across rolling deploys (web/ops tooling may be
 * older than the process), so unknown fields are tolerated and stripped on
 * read; see docs/CONTRACTS.md "Strictness and rolling compatibility".
 */
export const healthReportSchema = z.object({
  schemaVersion: z.literal(HEALTH_REPORT_SCHEMA_VERSION),
  service: z.enum(["api", "simulation", "worker"]),
  version: z.string().min(1),
  status: healthStatusSchema,
  checks: z.record(z.string(), dependencyCheckSchema),
});
export type HealthReport = z.infer<typeof healthReportSchema>;
export type ServiceName = HealthReport["service"];

/** Overall status is `ok` only when every dependency check is `ok`. */
export function aggregateStatus(checks: Readonly<Record<string, DependencyCheck>>): HealthStatus {
  return Object.values(checks).every((check) => check.status === "ok") ? "ok" : "down";
}
