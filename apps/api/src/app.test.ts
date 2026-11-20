import { healthReportSchema } from "@civ/contracts";
import { createLogger } from "@civ/telemetry";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, CORRELATION_HEADER } from "./app.js";
import { apiEnvSchema, loadApiEnv } from "./env.js";

const logger = createLogger({ service: "api", level: "silent" });
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function app(probes: Parameters<typeof buildApp>[0]["probes"]) {
  const instance = buildApp({ logger, probes });
  apps.push(instance);
  return instance;
}

describe("GET /health", () => {
  it("returns liveness without touching dependencies", async () => {
    let probed = false;
    const res = await app({ postgres: async () => void (probed = true) }).inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(healthReportSchema.parse(res.json())).toMatchObject({ service: "api", status: "ok", checks: {} });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(probed).toBe(false);
  });
});

describe("GET /health/ready", () => {
  it("is 200 when all probes pass", async () => {
    const res = await app({ postgres: async () => {}, redis: async () => {} }).inject("/health/ready");
    expect(res.statusCode).toBe(200);
    expect(healthReportSchema.parse(res.json()).status).toBe("ok");
  });

  it("is 503 with per-dependency detail when one probe fails", async () => {
    const res = await app({
      postgres: async () => {},
      redis: () => Promise.reject(new Error("connection refused")),
    }).inject("/health/ready");
    expect(res.statusCode).toBe(503);
    const report = healthReportSchema.parse(res.json());
    expect(report.checks["redis"]).toMatchObject({ status: "down", error: "unavailable" });
    expect(res.body).not.toContain("connection refused");
    expect(report.checks["postgres"]?.status).toBe("ok");
  });
});

describe("correlation IDs", () => {
  it("echoes a safe inbound ID and replaces an unsafe one", async () => {
    const instance = app({});
    const kept = await instance.inject({ url: "/health", headers: { [CORRELATION_HEADER]: "abc-123" } });
    expect(kept.headers[CORRELATION_HEADER]).toBe("abc-123");
    const replaced = await instance.inject({ url: "/health", headers: { [CORRELATION_HEADER]: "a b" } });
    expect(replaced.headers[CORRELATION_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns 404 for unknown routes with a correlation header", async () => {
    const res = await app({}).inject("/missing");
    expect(res.statusCode).toBe(404);
    expect(res.headers[CORRELATION_HEADER]).toBeDefined();
  });
});

describe("api env", () => {
  it("requires database and redis URLs and defaults the port", () => {
    expect(() => loadApiEnv({})).toThrow(/DATABASE_URL: is required[\s\S]*REDIS_URL: is required/);
    const env = loadApiEnv({ DATABASE_URL: "postgres://u@h/d", REDIS_URL: "redis://h:6379" });
    expect(env.API_PORT).toBe(3000);
    expect(env.API_HOST).toBe("127.0.0.1");
    expect(Object.keys(apiEnvSchema.shape)).not.toContain("ANTHROPIC_API_KEY");
  });
});
