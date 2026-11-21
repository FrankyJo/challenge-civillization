import { createServer, type Server } from "node:http";
import {
  aggregateStatus,
  apiErrorStatus,
  createApiError,
  HEALTH_REPORT_SCHEMA_VERSION,
  type ApiErrorCode,
  type DependencyCheck,
  type HealthReport,
  type ServiceName,
} from "@civ/contracts";
import type { Logger } from "pino";
import { CORRELATION_HEADER, resolveCorrelationId } from "./correlation.js";

/** A dependency probe. Resolve when healthy; throw/reject when not. */
export type HealthProbe = () => Promise<void>;

export interface HealthCheckOptions {
  readonly service: ServiceName;
  readonly version: string;
  readonly probes: Readonly<Record<string, HealthProbe>>;
  /** Per-probe timeout so a hung dependency cannot hang the health endpoint. */
  readonly timeoutMs?: number;
  /** Receives the raw failure for server-side logging. */
  readonly onProbeFailure?: ProbeFailureHandler;
}

export type ProbeFailureHandler = (probe: string, error: unknown) => void;

const DEFAULT_TIMEOUT_MS = 2_000;

class ProbeTimeoutError extends Error {}

/**
 * Public probe failures carry only a stable code ("timeout" | "unavailable").
 * Raw driver messages can reveal internal hosts, ports and roles, so they go
 * to `onProbeFailure` (server-side logging) instead of the response body.
 */
async function runProbe(
  name: string,
  probe: HealthProbe,
  timeoutMs: number,
  onProbeFailure: ProbeFailureHandler | undefined,
): Promise<DependencyCheck> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeoutError(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { status: "ok", latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    onProbeFailure?.(name, error);
    return {
      status: "down",
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof ProbeTimeoutError ? "timeout" : "unavailable",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Run all probes concurrently and build a schema-conformant readiness report. */
export async function runHealthChecks(options: HealthCheckOptions): Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const entries = await Promise.all(
    Object.entries(options.probes).map(
      async ([name, probe]) => [name, await runProbe(name, probe, timeoutMs, options.onProbeFailure)] as const,
    ),
  );
  const checks = Object.fromEntries(entries);
  return {
    schemaVersion: HEALTH_REPORT_SCHEMA_VERSION,
    service: options.service,
    version: options.version,
    status: aggregateStatus(checks),
    checks,
  };
}

/** Liveness report: the process is running and serving; no dependency probes. */
export function livenessReport(service: ServiceName, version: string): HealthReport {
  return { schemaVersion: HEALTH_REPORT_SCHEMA_VERSION, service, version, status: "ok", checks: {} };
}

export interface HealthServerOptions extends HealthCheckOptions {
  readonly logger: Logger;
  /** Prometheus text exposition served at GET /metrics (internal port only). */
  readonly metrics?: () => string;
}

/**
 * Minimal HTTP server for non-API processes:
 *   GET /health        liveness (always 200 while the process serves)
 *   GET /health/ready  readiness (200 if every probe passes, otherwise 503)
 *   GET /metrics       Prometheus text metrics, when `metrics` is given
 * Call `listen()` on the returned server.
 */
export function createHealthServer(options: HealthServerOptions): Server {
  const checkOptions: HealthCheckOptions = {
    ...options,
    onProbeFailure:
      options.onProbeFailure ??
      ((probe, error) => options.logger.warn({ err: error, probe }, "readiness probe failed")),
  };
  return createServer((req, res) => {
    // Never parse the raw request target with `new URL`: inputs such as `//`
    // throw synchronously and would crash the process from a single request.
    const path = (req.url ?? "/").split("?", 1)[0];
    const correlationId = resolveCorrelationId(req.headers[CORRELATION_HEADER]);
    const send = (statusCode: number, body: unknown): void => {
      res.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        [CORRELATION_HEADER]: correlationId,
      });
      res.end(JSON.stringify(body));
    };
    const fail = (code: ApiErrorCode): void => send(apiErrorStatus(code), createApiError({ code, correlationId }));
    if (req.method !== "GET") return fail("method_not_allowed");
    if (path === "/health") return send(200, livenessReport(options.service, options.version));
    if (path === "/health/ready") {
      runHealthChecks(checkOptions).then(
        (report) => send(report.status === "ok" ? 200 : 503, report),
        (error: unknown) => {
          options.logger.error({ err: error }, "readiness check crashed");
          fail("internal");
        },
      );
      return undefined;
    }
    if (path === "/metrics" && options.metrics !== undefined) {
      let body: string;
      try {
        body = options.metrics();
      } catch (error) {
        options.logger.error({ err: error }, "metrics exposition failed");
        return fail("internal");
      }
      res.writeHead(200, {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
        [CORRELATION_HEADER]: correlationId,
      });
      res.end(body);
      return undefined;
    }
    return fail("not_found");
  });
}

export interface GracefulShutdownOptions {
  readonly logger: Logger;
  /** Ordered cleanup steps; each runs even if an earlier one failed. */
  readonly steps: readonly (readonly [name: string, run: () => Promise<void> | void])[];
  /** Force exit with code 1 if cleanup has not finished by then (default 10s). */
  readonly timeoutMs?: number;
  readonly signals?: readonly NodeJS.Signals[];
}

/**
 * Install SIGTERM/SIGINT handlers that run cleanup steps once, log (never
 * swallow) failures, exit 0 on clean shutdown and 1 on any failure or timeout.
 */
export function installGracefulShutdown(options: GracefulShutdownOptions): void {
  let started = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (started) return;
    started = true;
    options.logger.info({ signal }, "shutting down");
    const timer = setTimeout(() => {
      options.logger.error({ timeoutMs: options.timeoutMs ?? 10_000 }, "shutdown timed out; forcing exit");
      process.exit(1);
    }, options.timeoutMs ?? 10_000);
    timer.unref();
    let failed = false;
    for (const [name, run] of options.steps) {
      try {
        await run();
      } catch (error) {
        failed = true;
        options.logger.error({ err: error, step: name }, "shutdown step failed");
      }
    }
    clearTimeout(timer);
    process.exit(failed ? 1 : 0);
  };
  for (const signal of options.signals ?? (["SIGTERM", "SIGINT"] as const)) {
    process.once(signal, () => void shutdown(signal));
  }
}
