import { apiErrorSchema, healthReportSchema } from "@civ/contracts";
import { createLogger } from "@civ/telemetry";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, CORRELATION_HEADER, errorCodeFor } from "./app.js";
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

describe("error responses", () => {
  it("use the ApiError contract for unknown routes and methods", async () => {
    const instance = app({});
    for (const request of [
      { method: "GET" as const, url: "/missing" },
      { method: "DELETE" as const, url: "/health" },
    ]) {
      const res = await instance.inject({ ...request, headers: { [CORRELATION_HEADER]: "req-404" } });
      expect(res.statusCode).toBe(404);
      expect(apiErrorSchema.parse(res.json()).error).toEqual({
        code: "not_found",
        message: "The requested resource does not exist.",
        correlationId: "req-404",
        details: [],
      });
    }
  });

  it("map client errors to stable codes without echoing request data", async () => {
    const instance = app({});
    instance.post("/echo", async (request) => request.body);
    const res = await instance.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: '{"secret": "hunter2"',
    });
    expect(res.statusCode).toBe(400);
    const body = apiErrorSchema.parse(res.json());
    expect(body.error.code).toBe("invalid_request");
    expect(res.body).not.toContain("hunter2");
    const unsupported = await instance.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/x-civ" },
      payload: "x",
    });
    expect(unsupported.statusCode).toBe(415);
    expect(apiErrorSchema.parse(unsupported.json()).error.code).toBe("unsupported_media_type");
  });

  it("answer malformed URLs (rejected before routing) with the contract", async () => {
    const instance = app({});
    for (const url of ["/%", "/health/%zz", "/%E0%A4%A"]) {
      const res = await instance.inject({ url, headers: { [CORRELATION_HEADER]: "req-bad-url" } });
      expect(res.statusCode).toBe(400);
      expect(apiErrorSchema.parse(res.json()).error).toMatchObject({
        code: "invalid_request",
        correlationId: "req-bad-url",
      });
      expect(res.headers[CORRELATION_HEADER]).toBe("req-bad-url");
      expect(res.body).not.toContain("%");
    }
  });

  it("hide internal error details behind a generic 500", async () => {
    const instance = app({});
    instance.get("/boom", async () => {
      throw new Error("db password is hunter2 at 10.0.0.5");
    });
    const res = await instance.inject("/boom");
    expect(res.statusCode).toBe(500);
    expect(apiErrorSchema.parse(res.json()).error).toMatchObject({ code: "internal", details: [] });
    expect(res.body).not.toMatch(/hunter2|10\.0\.0\.5/);
  });

  it("classify unknown thrown values as internal", () => {
    expect(errorCodeFor(new Error("x"))).toBe("internal");
    expect(errorCodeFor({ statusCode: 418 })).toBe("invalid_request");
    expect(errorCodeFor({ statusCode: 502 })).toBe("internal");
    expect(errorCodeFor("string")).toBe("internal");
    expect(errorCodeFor({ statusCode: 429 })).toBe("rate_limited");
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
