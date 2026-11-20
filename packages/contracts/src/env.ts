import { z } from "zod";

/**
 * Raised when process configuration fails validation. The message lists the
 * offending variable names and reasons but never echoes values, so secrets
 * cannot leak into logs through a misconfiguration.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly { readonly variable: string; readonly reason: string }[];

  constructor(issues: readonly { readonly variable: string; readonly reason: string }[]) {
    super(
      `Invalid environment configuration:\n${issues
        .map((issue) => `  - ${issue.variable}: ${issue.reason}`)
        .join("\n")}`,
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Parse an environment record against a Zod object schema. Empty strings are
 * treated as unset so that `FOO=` in a dotenv file falls back to defaults or
 * fails as "required" instead of passing as a blank value.
 */
export function parseEnv<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  source: EnvSource,
): z.infer<z.ZodObject<Shape>> {
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = source[key];
    if (value !== undefined && value.trim() !== "") normalized[key] = value.trim();
  }
  const result = schema.safeParse(normalized);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => ({
        variable: issue.path.map(String).join(".") || "(root)",
        reason: issue.code === "invalid_type" && issue.input === undefined ? "is required" : issue.message,
      })),
    );
  }
  return result.data;
}

export const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

export const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info");

export const portSchema = z.coerce
  .number()
  .int("must be an integer")
  .min(0, "must be between 0 and 65535")
  .max(65535, "must be between 0 and 65535");

export const hostSchema = z.string().min(1).default("127.0.0.1");

const urlWithProtocols = (protocols: readonly string[]) =>
  z.string().refine(
    (value) => {
      try {
        const url = new URL(value);
        return protocols.includes(url.protocol) && url.hostname.length > 0;
      } catch {
        return false;
      }
    },
    `must be a URL using ${protocols.join(" or ")}`,
  );

export const postgresUrlSchema = urlWithProtocols(["postgres:", "postgresql:"]);
export const redisUrlSchema = urlWithProtocols(["redis:", "rediss:"]);
