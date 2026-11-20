import { pino, type DestinationStream, type Logger } from "pino";
import { getCorrelationId } from "./correlation.js";

export type { Logger } from "pino";

export interface LoggerOptions {
  readonly service: string;
  readonly level?: string;
  /** Override output (tests). Defaults to stdout. */
  readonly destination?: DestinationStream;
}

/** Keys whose values must never reach log output, at any depth we control. */
export const REDACTED_PATHS = [
  "password",
  "*.password",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "authorization",
  "*.authorization",
  "req.headers.authorization",
  "req.headers.cookie",
  "connectionString",
  "*.connectionString",
] as const;

/**
 * JSON logger with service name, ISO timestamps, secret redaction, and the
 * ambient correlation ID (if any) attached to every line.
 */
export function createLogger(options: LoggerOptions): Logger {
  return pino(
    {
      level: options.level ?? "info",
      base: { service: options.service },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: [...REDACTED_PATHS], censor: "[redacted]" },
      mixin() {
        const correlationId = getCorrelationId();
        return correlationId === undefined ? {} : { correlationId };
      },
    },
    options.destination,
  );
}
