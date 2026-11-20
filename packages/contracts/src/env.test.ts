import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";
import {
  EnvValidationError,
  logLevelSchema,
  nodeEnvSchema,
  parseEnv,
  portSchema,
  postgresUrlSchema,
  redisUrlSchema,
} from "./env.js";

const schema = z.object({
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
  PORT: portSchema.default(3000),
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
});

const valid = {
  DATABASE_URL: "postgresql://user:secret-password@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
};

describe("parseEnv", () => {
  it("applies defaults and coerces numbers", () => {
    expect(parseEnv(schema, valid)).toEqual({
      NODE_ENV: "development",
      LOG_LEVEL: "info",
      PORT: 3000,
      ...valid,
    });
    expect(parseEnv(schema, { ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("treats blank values as unset", () => {
    expect(() => parseEnv(schema, { ...valid, DATABASE_URL: "   " })).toThrow(/DATABASE_URL: is required/);
    expect(parseEnv(schema, { ...valid, PORT: "" }).PORT).toBe(3000);
  });

  it("reports every invalid variable without echoing values", () => {
    let caught: unknown;
    try {
      parseEnv(schema, {
        DATABASE_URL: "mysql://root:hunter2@db/x",
        REDIS_URL: "not a url",
        PORT: "70000",
        NODE_ENV: "staging",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.issues.map((issue) => issue.variable).sort()).toEqual([
      "DATABASE_URL",
      "NODE_ENV",
      "PORT",
      "REDIS_URL",
    ]);
    expect(error.message).not.toContain("hunter2");
    expect(error.message).not.toContain("not a url");
  });

  it("ignores variables not declared by the schema", () => {
    const parsed = parseEnv(schema, { ...valid, ANTHROPIC_API_KEY: "sk-should-not-appear" });
    expect(parsed).not.toHaveProperty("ANTHROPIC_API_KEY");
  });
});

describe("portSchema", () => {
  it("accepts exactly the integers 0..65535", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: 200_000 }), (port) => {
        const ok = portSchema.safeParse(String(port)).success;
        expect(ok).toBe(port >= 0 && port <= 65535);
      }),
    );
  });

  it("rejects non-integers", () => {
    expect(portSchema.safeParse("80.5").success).toBe(false);
    expect(portSchema.safeParse("eighty").success).toBe(false);
  });
});
