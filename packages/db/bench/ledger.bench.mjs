// Ledger write/read throughput against a real PostgreSQL.
// Usage: BENCH_DATABASE_URL=postgresql://… pnpm --filter @civ/db bench
// Creates and drops its own throwaway database on that server.
import { performance } from "node:perf_hooks";
import { createEphemeralDatabase, digestOf, LedgerScript } from "@civ/testing";
import { catchUp, commitCommand, createPool, createWorld, migrateUp, readEvents } from "../dist/index.js";

const adminUrl = process.env.BENCH_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!adminUrl) throw new Error("set BENCH_DATABASE_URL (or TEST_DATABASE_URL)");

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const ms = (n) => `${n.toFixed(2)} ms`;

const db = await createEphemeralDatabase(adminUrl, "civ_bench");
const pool = createPool({ connectionString: db.url, max: 4 });
try {
  await migrateUp(pool);
  const script = new LedgerScript({ worldId: "wld_bench0001" });
  await createWorld(pool, {
    world: script.world,
    initialState: script.state,
    stateHash: script.stateHash,
    correlationId: "bench",
  });

  // 1. Sequential single-event commits (one transaction each).
  const latencies = [];
  for (let i = 0; i < 1_000; i += 1) {
    const step = script.advance(1);
    const start = performance.now();
    await commitCommand(pool, step);
    latencies.push(performance.now() - start);
    script.commit(step);
  }
  const total = latencies.reduce((a, b) => a + b, 0);
  console.log(
    `commit (1 event):    n=1000 p50=${ms(pct(latencies, 50))} p95=${ms(pct(latencies, 95))} p99=${ms(pct(latencies, 99))} → ${Math.round(1_000_000 / total)} commits/s`,
  );

  // 2. One commit carrying a large event batch (bulk unnest insert).
  for (const size of [1_000, 5_000]) {
    const step = script.advance(1);
    const template = step.outcome.events[0];
    const base = step.basedOn.eventPosition;
    const events = Array.from({ length: size }, (_, i) => ({
      ...template,
      eventId: `evt_bench${(base + i).toString(36).padStart(8, "0")}`,
      sequence: base + i,
    }));
    const state = { ...step.outcome.state, eventPosition: base + size };
    const outcome = { ...step.outcome, events, state, stateHash: digestOf(state) };
    const start = performance.now();
    await commitCommand(pool, { ...step, outcome });
    const elapsed = performance.now() - start;
    script.commit({ ...step, outcome });
    console.log(`commit (${size} events): ${ms(elapsed)} → ${Math.round((size * 1_000) / elapsed)} events/s`);
  }

  // 3. Cursor reads and a consumer catch-up over the whole ledger.
  let start = performance.now();
  let position = 0;
  let read = 0;
  for (;;) {
    const page = await readEvents(pool, { worldId: script.world.worldId, after: position, limit: 1_000 });
    if (page.events.length === 0) break;
    read += page.events.length;
    position = page.nextPosition;
  }
  let elapsed = performance.now() - start;
  console.log(
    `readEvents (1000/page): ${read} events in ${ms(elapsed)} → ${Math.round((read * 1_000) / elapsed)} events/s`,
  );

  start = performance.now();
  const result = await catchUp(pool, {
    consumer: "bench",
    worldId: script.world.worldId,
    batchSize: 500,
    handle: async () => undefined,
  });
  elapsed = performance.now() - start;
  console.log(
    `catchUp (500/batch, no-op): ${result.applied} events in ${ms(elapsed)} → ${Math.round((result.applied * 1_000) / elapsed)} events/s`,
  );
} finally {
  await pool.end();
  await db.drop();
}
