import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { apiErrorSchema, healthReportSchema } from "@civ/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createHealthServer, runHealthChecks } from "./health.js";
import { createLogger } from "./logger.js";

describe("runHealthChecks", () => {
  it("reports ok when all probes pass", async () => {
    const report = await runHealthChecks({
      service: "worker",
      version: "1.0.0",
      probes: { redis: async () => {}, postgres: async () => {} },
    });
    expect(healthReportSchema.parse(report).status).toBe("ok");
    expect(Object.keys(report.checks).sort()).toEqual(["postgres", "redis"]);
  });

  it("reports down with a stable code, passing the raw error only to the failure hook", async () => {
    const failures: [string, unknown][] = [];
    const report = await runHealthChecks({
      service: "worker",
      version: "1.0.0",
      probes: {
        redis: async () => {},
        postgres: () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:5432")),
      },
      onProbeFailure: (probe, error) => failures.push([probe, error]),
    });
    expect(JSON.stringify(report)).not.toContain("10.0.0.5");
    expect(failures.map(([probe]) => probe)).toEqual(["postgres"]);
    expect(report.status).toBe("down");
    expect(report.checks["postgres"]).toMatchObject({ status: "down", error: "unavailable" });
    expect(report.checks["redis"]?.status).toBe("ok");
  });

  it("times out hung probes", async () => {
    const report = await runHealthChecks({
      service: "simulation",
      version: "1.0.0",
      timeoutMs: 20,
      probes: { hung: () => new Promise(() => {}) },
    });
    expect(report.checks["hung"]).toMatchObject({ status: "down", error: "timeout" });
  });
});

describe("createHealthServer", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function start(probe: () => Promise<void>): Promise<string> {
    const server = createHealthServer({
      service: "simulation",
      version: "1.0.0",
      probes: { postgres: probe },
      logger: createLogger({ service: "simulation", level: "silent" }),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    close = () => new Promise((resolve) => server.close(() => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("serves liveness, readiness, 404 and 405", async () => {
    const base = await start(() => Promise.reject(new Error("db down")));
    const live = await fetch(`${base}/health`);
    expect(live.status).toBe(200);
    expect(healthReportSchema.parse(await live.json()).checks).toEqual({});

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(503);
    expect(healthReportSchema.parse(await ready.json()).status).toBe("down");

    const missing = await fetch(`${base}/nope`, { headers: { "x-correlation-id": "probe-1" } });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-correlation-id")).toBe("probe-1");
    expect(apiErrorSchema.parse(await missing.json()).error).toMatchObject({
      code: "not_found",
      correlationId: "probe-1",
    });
    const post = await fetch(`${base}/health`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(apiErrorSchema.parse(await post.json()).error.code).toBe("method_not_allowed");
  });

  it("survives malformed request targets that would make `new URL` throw", async () => {
    const base = await start(async () => {});
    const { port } = new URL(base);
    for (const target of ["//", "//:", "//[", "//a:b@"]) {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, path: target, method: "GET" }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(404);
    }
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("returns 200 from readiness when probes pass", async () => {
    const base = await start(async () => {});
    expect((await fetch(`${base}/health/ready`)).status).toBe(200);
  });
  it("serves Prometheus metrics only when a provider is configured", async () => {
    expect((await fetch(`${await start(async () => {})}/metrics`)).status).toBe(404);
    await close?.();
    const server = createHealthServer({
      service: "simulation",
      version: "1.0.0",
      probes: {},
      logger: createLogger({ service: "simulation", level: "silent" }),
      metrics: () => "# TYPE civ_test gauge\ncivTest 1\n",
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    close = () => new Promise((resolve) => server.close(() => resolve()));
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain; version=0.0.4");
    expect(await response.text()).toContain("civTest 1");
  });
});
