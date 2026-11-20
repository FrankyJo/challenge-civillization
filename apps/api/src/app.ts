import { createApiError, apiErrorStatus, type ApiErrorCode } from "@civ/contracts";
import {
  CORRELATION_HEADER,
  livenessReport,
  resolveCorrelationId,
  runHealthChecks,
  type HealthProbe,
  type Logger,
} from "@civ/telemetry";
import Fastify, { LogController, type FastifyReply } from "fastify";

export const API_VERSION = "0.1.0";
export { CORRELATION_HEADER };

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
    // Errors raised before routing (malformed URL, bad content-type syntax)
    // bypass setErrorHandler; answer them with the same contract.
    frameworkErrors: (error, request, frameworkReply) => {
      // Fastify types this reply with the route's (unknown) schema generics.
      const reply = frameworkReply as unknown as FastifyReply;
      const code = errorCodeFor(error);
      request.log.info({ errorCode: code, frameworkError: error.code }, "request rejected before routing");
      void reply
        .code(apiErrorStatus(code))
        .header("cache-control", "no-store")
        .header(CORRELATION_HEADER, request.id)
        .send(createApiError({ code, correlationId: request.id }));
    },
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header(CORRELATION_HEADER, request.id);
  });

  // Every error response uses the versioned ApiError contract. Client errors
  // keep only a stable code and generic message (Fastify's text can echo
  // request data); server errors are logged with full detail and never exposed.
  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404).header("cache-control", "no-store");
    return createApiError({ code: "not_found", correlationId: request.id });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const code = errorCodeFor(error);
    const status = apiErrorStatus(code);
    if (status >= 500) request.log.error({ err: error }, "request failed");
    else request.log.info({ errorCode: code, statusCode: status }, "request rejected");
    reply.code(status).header("cache-control", "no-store");
    return createApiError({ code, correlationId: request.id });
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
/** Map a thrown error to a public code; unclassified 4xx are invalid_request, everything else internal. */
export function errorCodeFor(error: unknown): ApiErrorCode {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : Number.NaN;
  switch (status) {
    case 400:
      return "invalid_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 405:
      return "method_not_allowed";
    case 409:
      return "conflict";
    case 413:
      return "payload_too_large";
    case 415:
      return "unsupported_media_type";
    case 429:
      return "rate_limited";
    case 503:
      return "unavailable";
    default:
      // Any other client error (405, 408, 414, 422, ...) is still the client's.
      return status >= 400 && status < 500 ? "invalid_request" : "internal";
  }
}

export type ApiApp = ReturnType<typeof buildApp>;
