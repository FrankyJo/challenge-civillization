import { randomUUID } from "node:crypto";
import {
  commitCommand,
  consumerLag,
  createPool,
  createWorld,
  migrateUp,
  outboxBacklog,
  readWorldStatus,
  WORLD_STATUS_CONSUMER,
  type CommitCommandInput,
  type Pool,
} from "@civ/db";
import { createLogger } from "@civ/telemetry";
import { createEphemeralDatabase, LedgerScript, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import type { Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createLedgerQueue,
  startLedgerWorker,
  startOutboxRelay,
  startReconciler,
  type PeriodicTask,
} from "../../src/ledger.js";

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
// A dedicated logical database: the simulated Redis restart (FLUSHDB plus
// dropped connections) affects only this suite's keys and clients.
const redisUrl = new URL(requireTestEnv("TEST_REDIS_URL"));
redisUrl.pathname = "/7";
const queueName = `ledger-test-${randomUUID()}`;
const logger = createLogger({ service: "worker", level: "silent" });

let db: EphemeralDatabase;
let pool: Pool;
const clients: Redis[] = [];
function redis(): Redis {
  const client = new Redis(redisUrl.toString(), { maxRetriesPerRequest: null });
  client.on("error", () => undefined);
  clients.push(client);
  return client;
}

const queue = createLedgerQueue(redis(), queueName);
let worker: Worker;
let relay: PeriodicTask;

beforeAll(async () => {
  db = await createEphemeralDatabase(adminUrl);
  pool = createPool({ connectionString: db.url, max: 8 });
  await migrateUp(pool);
  worker = startLedgerWorker({ connection: redis(), pool, logger, concurrency: 4, queueName });
  relay = startOutboxRelay({ pool, queue, logger, intervalMs: 50 });
  await worker.waitUntilReady();
});

afterAll(async () => {
  await relay.stop();
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  for (const client of clients) client.disconnect();
  await pool.end();
  await db.drop();
});

async function waitFor<T>(probe: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (done(value)) return value;
    if (Date.now() > deadline)
      throw new Error(`condition not met in ${timeoutMs}ms; last value ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function newWorld(id: string): Promise<LedgerScript> {
  const script = new LedgerScript({ worldId: id });
  await createWorld(pool, {
    world: script.world,
    initialState: script.state,
    stateHash: script.stateHash,
    correlationId: `create-${id}`,
  });
  return script;
}

async function commitSteps(script: LedgerScript, makers: (() => ReturnType<LedgerScript["pause"]>)[]) {
  for (const make of makers) {
    const step = make();
    const result = await commitCommand(pool, step as unknown as CommitCommandInput);
    expect(result.status).toBe("committed");
    script.commit(step);
  }
}

const projected = (worldId: string) => readWorldStatus(pool, worldId);

/** Simulate a Redis restart: every key of this logical DB is lost and client connections drop. */
async function restartRedis(): Promise<void> {
  const admin = new Redis(redisUrl.toString());
  try {
    await admin.flushdb();
    const ids = await Promise.all(clients.map((client) => client.client("ID").catch(() => null)));
    for (const id of ids) if (id !== null) await admin.client("KILL", "ID", String(id)).catch(() => undefined);
  } finally {
    admin.disconnect();
  }
}

describe("ledger delivery through Redis/BullMQ", () => {
  it("fails malformed and unknown jobs without retries", async () => {
    const bad = await queue.add("ledger.appended", { schemaVersion: 1, worldId: "nope" }, { jobId: "bad-payload" });
    const unknown = await queue.add("ledger.unknown", {}, { jobId: "bad-name" });
    for (const job of [bad, unknown]) {
      await waitFor(
        () => job.getState(),
        (state) => state === "failed",
      );
      const failed = await queue.getJob(job.id ?? "");
      expect(failed?.attemptsMade).toBe(1);
    }
  });

  it("relays outbox notifications and projects every event exactly once", async () => {
    const script = await newWorld("wld_relay0001");
    await commitSteps(script, [() => script.advance(400), () => script.pause(), () => script.resume()]);
    const status = await waitFor(
      () => projected("wld_relay0001"),
      (row) => row?.eventPosition === 3,
    );
    expect(status).toMatchObject({ clock: 400, status: "running", eventPosition: 3 });
    expect((await outboxBacklog(pool)).pending).toBe(0);

    // Duplicate and stale notifications (redelivery) change nothing.
    for (const jobId of ["dup-a", "dup-b"]) {
      const job = await queue.add(
        "ledger.appended",
        { schemaVersion: 1, worldId: "wld_relay0001", fromPosition: 0, toPosition: 3 },
        { jobId },
      );
      await waitFor(
        () => job.getState(),
        (state) => state === "completed",
      );
    }
    expect(await projected("wld_relay0001")).toEqual(status);
  });

  it("recovers after a Redis restart loses queued notifications", async () => {
    const script = await newWorld("wld_restart01");
    await commitSteps(script, [() => script.advance(100)]);
    await waitFor(
      () => projected("wld_restart01"),
      (row) => row?.eventPosition === 1,
    );

    // Notifications reach Redis but are lost before any consumer runs them.
    await worker.pause();
    await commitSteps(script, [() => script.pause(), () => script.resume()]);
    await waitFor(
      () => outboxBacklog(pool),
      (backlog) => backlog.pending === 0,
    );
    await restartRedis();
    worker.resume();
    expect((await projected("wld_restart01"))?.eventPosition).toBe(1);

    // New traffic after the restart flows again (clients reconnect) and the
    // catch-up from the durable cursor also covers the lost notifications.
    await commitSteps(script, [() => script.advance(5)]);
    await waitFor(
      () => projected("wld_restart01"),
      (row) => row?.eventPosition === 4,
      30_000,
    );
    expect(await projected("wld_restart01")).toMatchObject({ clock: 105, status: "running", eventPosition: 4 });
  });

  it("the reconciler isolates a broken world and still catches up the others", async () => {
    const broken = await newWorld("wld_poison001");
    const healthy = await newWorld("wld_healthy01");
    await relay.stop();
    try {
      await commitSteps(broken, [() => broken.advance(3)]);
      await commitSteps(healthy, [() => healthy.advance(9)]);
      // Corrupt the (non-authoritative) projection so its reducer refuses the next event.
      await pool.query(
        `INSERT INTO civ.proj_world_status (world_id, clock, year, day_of_year, status, event_position)
         VALUES ('wld_poison001', 0, 1, 1, 'running', 5)`,
      );
      const reconciler = startReconciler({ pool, logger, intervalMs: 60_000 });
      await reconciler.runOnce();
      await reconciler.stop();
      expect(await projected("wld_healthy01")).toMatchObject({ clock: 9, eventPosition: 1 });
      expect((await projected("wld_poison001"))?.eventPosition).toBe(5);
      // Documented recovery: drop the projection row and its cursor; the reconciler rebuilds it.
      await pool.query("DELETE FROM civ.proj_world_status WHERE world_id = 'wld_poison001'");
      await pool.query(
        "DELETE FROM civ.consumer_offsets WHERE consumer = 'world-status' AND world_id = 'wld_poison001'",
      );
      const again = startReconciler({ pool, logger, intervalMs: 60_000 });
      await again.runOnce();
      await again.stop();
      expect(await projected("wld_poison001")).toMatchObject({ clock: 3, eventPosition: 1 });
    } finally {
      relay = startOutboxRelay({ pool, queue, logger, intervalMs: 50 });
    }
  });

  it("the reconciler catches up without any notification at all", async () => {
    const script = await newWorld("wld_reconcile1");
    await relay.stop();
    try {
      await commitSteps(script, [() => script.advance(7), () => script.pause()]);
      await restartRedis();
      expect(await projected("wld_reconcile1")).toBeNull();
      const lagBefore = (await consumerLag(pool, WORLD_STATUS_CONSUMER)).find((l) => l.worldId === "wld_reconcile1");
      expect(lagBefore).toMatchObject({ position: 0, head: 2, lag: 2 });

      const reconciler = startReconciler({ pool, logger, intervalMs: 60_000 });
      await reconciler.runOnce();
      await reconciler.stop();
      expect(await projected("wld_reconcile1")).toMatchObject({ clock: 7, status: "paused", eventPosition: 2 });
      expect(
        (await consumerLag(pool, WORLD_STATUS_CONSUMER)).every((l) => l.lag === 0 || l.worldId !== "wld_reconcile1"),
      ).toBe(true);
    } finally {
      relay = startOutboxRelay({ pool, queue, logger, intervalMs: 50 });
    }
  });
});
