import { livenessReport, resolveCorrelationId, runHealthChecks, type HealthProbe, type Logger } from "@civ/telemetry";
import Fastify, { LogController } from "fastify";

export const API_VERSION = "0.1.0";
export const CORRELATION_HEADER = "x-correlation-id";

export interface AppDependencies {
  readonly logger: Logger;
  /** Readiness probes, e.g. { postgres, redis }. */
  readonly probes: Readonly<Record<string, HealthProbe>>;
}

/**
 * Build the HTTP application without binding a port, so tests can use
 * `app.inject()` and `main.ts` owns process lifecycle.
 */
export function buildApp(deps: AppDependencies) {
  const app = Fastify({
    loggerInstance: deps.logger,
    genReqId: (req) => resolveCorrelationId(req.headers[CORRELATION_HEADER]),
    logController: new LogController({ requestIdLogLabel: "correlationId" }),
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
  });

  app.get("/health", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return livenessReport("api", API_VERSION);
  });

  app.get("/health/ready", async (_request, reply) => {
    const report = await runHealthChecks({
      service: "api",
      version: API_VERSION,
      probes: deps.probes,
      onProbeFailure: (probe, error) => app.log.warn({ err: error, probe }, "readiness probe failed"),
    });
    reply.header("cache-control", "no-store");
    reply.code(report.status === "ok" ? 200 : 503);
    return report;
  });

  return app;
}
export type ApiApp = ReturnType<typeof buildApp>;
