import { describe, expect, it } from "vitest";
import { processSystemJob, UnknownJobError } from "./jobs.js";
import { loadWorkerEnv } from "./env.js";

describe("processSystemJob", () => {
  it("echoes the ping nonce", () => {
    expect(processSystemJob("system.ping", { nonce: "n1" })).toEqual({ nonce: "n1", handledBy: "worker" });
  });

  it("rejects invalid payloads and unknown job names", () => {
    expect(() => processSystemJob("system.ping", { nonce: "" })).toThrow();
    expect(() => processSystemJob("system.ping", null)).toThrow();
    expect(() => processSystemJob("world.tick", {})).toThrow(UnknownJobError);
  });
});

describe("worker env", () => {
  it("bounds concurrency", () => {
    const base = { DATABASE_URL: "postgres://h/d", REDIS_URL: "redis://h" };
    expect(loadWorkerEnv(base).WORKER_CONCURRENCY).toBe(4);
    expect(() => loadWorkerEnv({ ...base, WORKER_CONCURRENCY: "0" })).toThrow(/WORKER_CONCURRENCY/);
    expect(() => loadWorkerEnv({ ...base, WORKER_CONCURRENCY: "65" })).toThrow(/WORKER_CONCURRENCY/);
  });
});
