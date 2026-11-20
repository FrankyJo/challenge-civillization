import { randomUUID } from "node:crypto";
import { createLogger } from "@civ/telemetry";
import { requireTestEnv } from "@civ/testing";
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSystemWorker } from "../../src/worker.js";

const redisUrl = requireTestEnv("TEST_REDIS_URL");
// Unique queue per run so parallel CI jobs or reruns never share state.
const queueName = `system-test-${randomUUID()}`;
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(queueName, { connection });
const events = new QueueEvents(queueName, { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) });
const worker = startSystemWorker({
  connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
  logger: createLogger({ service: "worker", level: "silent" }),
  queueName,
});

beforeAll(async () => {
  await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
});

afterAll(async () => {
  await worker.close();
  await events.close();
  await queue.obliterate({ force: true });
  await queue.close();
  connection.disconnect();
});

describe("system queue round trip against real Redis", () => {
  it("processes system.ping and returns the nonce", async () => {
    const nonce = randomUUID();
    const job = await queue.add("system.ping", { nonce });
    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({ nonce, handledBy: "worker" });
  });

  it("deduplicates jobs by id (idempotent enqueue)", async () => {
    const jobId = `ping-${randomUUID()}`;
    const first = await queue.add("system.ping", { nonce: "a" }, { jobId });
    const second = await queue.add("system.ping", { nonce: "b" }, { jobId });
    expect(second.id).toBe(first.id);
    await expect(first.waitUntilFinished(events, 10_000)).resolves.toEqual({ nonce: "a", handledBy: "worker" });
  });

  it("fails unknown jobs without retry storms", async () => {
    const job = await queue.add("does.not.exist", {}, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/unknown job: does.not.exist/);
  });
});
