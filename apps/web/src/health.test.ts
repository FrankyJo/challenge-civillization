import { describe, expect, it } from "vitest";
import { describeApiHealth, fetchApiHealth } from "./health.js";
import { parseWebEnv } from "./env.js";

const report = (status: "ok" | "down", checks: Record<string, "ok" | "down"> = {}) => ({
  schemaVersion: 1,
  service: "api",
  version: "0.1.0",
  status,
  checks: Object.fromEntries(Object.entries(checks).map(([k, s]) => [k, { status: s, latencyMs: 1 }])),
});

describe("describeApiHealth", () => {
  it("maps ok, degraded and malformed responses", () => {
    expect(describeApiHealth(report("ok")).state).toBe("ok");
    expect(describeApiHealth(report("down", { redis: "down", postgres: "ok" })).label).toBe("API degraded: redis down");
    expect(describeApiHealth({ error: "nope" })).toEqual({ state: "unreachable", label: "API unreachable" });
    expect(describeApiHealth("<html>")).toEqual({ state: "unreachable", label: "API unreachable" });
  });
});

describe("fetchApiHealth", () => {
  it("treats network errors as unreachable", async () => {
    const failing = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    expect((await fetchApiHealth("/api", failing)).state).toBe("unreachable");
  });

  it("calls the readiness endpoint under the base path", async () => {
    let called = "";
    const ok = ((url: string) => {
      called = url;
      return Promise.resolve(new Response(JSON.stringify(report("ok"))));
    }) as typeof fetch;
    expect((await fetchApiHealth("/api", ok)).state).toBe("ok");
    expect(called).toBe("/api/health/ready");
  });
});

describe("parseWebEnv", () => {
  it("defaults and validates the API base path", () => {
    expect(parseWebEnv({}).VITE_API_BASE_PATH).toBe("/api");
    expect(parseWebEnv({ VITE_API_BASE_PATH: "/v1" }).VITE_API_BASE_PATH).toBe("/v1");
    expect(() => parseWebEnv({ VITE_API_BASE_PATH: "https://evil.example" })).toThrow();
  });
});
