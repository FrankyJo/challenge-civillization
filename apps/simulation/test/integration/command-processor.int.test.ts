import { commandRegistry, type Command, type Digest } from "@civ/contracts";
import {
  createPool,
  createWorld,
  latestCheckpoint,
  loadWorldState,
  migrateUp,
  readCommands,
  readEvents,
  IdempotencyConflictError,
  type Pool,
} from "@civ/db";
import {
  canonicalHash,
  createEngine,
  createSystemSchedule,
  DAILY,
  instantAt,
  replay,
  SEASON_ONE_SPAN,
  YEARLY,
  type Engine,
  type SimulationSystem,
  type WorldState,
} from "@civ/domain";
import { createEphemeralDatabase, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processCommand } from "../../src/command-processor.js";

interface Ledger {
  readonly harvest: number;
  readonly census: readonly number[];
}

const harvest: SimulationSystem<Ledger> = {
  id: "harvest",
  order: 10,
  cadence: DAILY,
  description: "test: random daily yield",
  run: (data, { random }) => ({ data: { ...data, harvest: data.harvest + random.nextInt(0, 100) }, events: [] }),
};
const census: SimulationSystem<Ledger> = {
  id: "census",
  order: 20,
  cadence: YEARLY,
  description: "test: yearly random count",
  run: (data, { random, instant }) => ({
    data: { ...data, census: [...data.census, instant.year * 1_000 + random.nextInt(0, 1_000)] },
    events: [],
  }),
};

const CONTENT: Digest = `sha256:${"c".repeat(64)}`;
const adminUrl = requireTestEnv("TEST_DATABASE_URL");
let db: EphemeralDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await createEphemeralDatabase(adminUrl);
  pool = createPool({ connectionString: db.url, max: 8 });
  await migrateUp(pool);
});

afterAll(async () => {
  await pool.end();
  await db.drop();
});

let worlds = 0;
async function newWorld(): Promise<Engine<Ledger>> {
  worlds += 1;
  const worldId = `wld_proc${worlds.toString(36).padStart(4, "0")}`;
  const engine = createEngine<Ledger>({
    worldId,
    seed: "9e3779b97f4a7c15",
    span: SEASON_ONE_SPAN,
    contentVersion: CONTENT,
    schedule: createSystemSchedule([harvest, census]),
  });
  const initial = engine.initialState({ harvest: 0, census: [] });
  await createWorld(pool, {
    world: {
      schemaVersion: 1,
      worldId,
      name: "Processor test",
      seed: "9e3779b97f4a7c15",
      startYear: 1,
      endYear: 2026,
      versions: engine.versions,
      createdAt: "2027-01-01T00:00:00.000Z",
      createdBy: { kind: "system", component: "simulation" },
    } as never,
    initialState: initial,
    stateHash: canonicalHash(initial),
    checkpoint: engine.checkpoint(initial),
    correlationId: `create-${worldId}`,
  });
  return engine;
}

let commandCounter = 0;
function command(engine: Engine<Ledger>, clock: number, type: string, payload: object, key?: string): Command {
  commandCounter += 1;
  const commandId = `cmd_proc${commandCounter.toString(36).padStart(6, "0")}`;
  return commandRegistry.parse({
    schemaVersion: 1,
    commandId,
    type,
    typeVersion: 1,
    worldId: engine.worldId,
    instant: instantAt(engine.span, clock),
    issuedAt: "2027-01-01T00:00:00.000Z",
    actor:
      type === "world.advance"
        ? { kind: "system", component: "scheduler" }
        : { kind: "operator", operatorId: "opr_00000001" },
    idempotencyKey: key ?? `key-${commandId}`,
    expectedVersion: null,
    causationId: null,
    correlationId: `corr-${commandId}`,
    versions: engine.versions,
    payload,
  });
}

const advance = (engine: Engine<Ledger>, from: number, to: number, key?: string) =>
  command(engine, from, "world.advance", { fromTick: from, toTick: to }, key);

describe("processCommand with the deterministic kernel", () => {
  it("persists a run whose stored state equals an in-memory replay of the command log", async () => {
    const engine = await newWorld();
    const script: Command[] = [];
    let clock = 0;
    for (const span of [400, 3_650, 1_200]) {
      const next = advance(engine, clock, clock + span);
      script.push(next);
      expect((await processCommand({ pool, engine, command: next })).status).toBe("accepted");
      clock += span;
    }
    const pause = command(engine, clock, "world.pause", { reason: "maintenance" });
    const blocked = advance(engine, clock, clock + 10);
    const resume = command(engine, clock, "world.resume", { reason: "done" });
    expect((await processCommand({ pool, engine, command: pause })).status).toBe("accepted");
    expect(await processCommand({ pool, engine, command: blocked })).toMatchObject({
      status: "rejected",
      rejection: { code: "world_paused" },
    });
    expect((await processCommand({ pool, engine, command: resume })).status).toBe("accepted");
    script.push(pause, blocked, resume);

    const stored = await loadWorldState(pool, engine.worldId);
    const logged = await readCommands(pool, { worldId: engine.worldId, after: 0, limit: 100 });
    expect(logged.map((entry) => entry.command)).toEqual(script);

    const replayed = replay(
      engine,
      engine.initialState({ harvest: 0, census: [] }),
      logged.map((e) => e.command),
    );
    expect(replayed.state).toEqual(stored.state);
    expect(canonicalHash(replayed.state)).toBe(stored.stateHash);
    expect(replayed.rejections.map((r) => r.rejection.code)).toEqual(["world_paused"]);
    const events = await readEvents(pool, { worldId: engine.worldId, after: 0, limit: 100 });
    expect(events.events).toEqual(replayed.events);
  });

  it("checkpoints on the configured interval and restores to the same state", async () => {
    const engine = await newWorld();
    let clock = 0;
    for (const span of [3_000, 1_000, 3_650]) {
      await processCommand({
        pool,
        engine,
        command: advance(engine, clock, clock + span),
        checkpointIntervalTicks: 3_650,
      });
      clock += span;
    }
    const latest = await latestCheckpoint(pool, engine.worldId);
    // Crossed 3,650 at 4,000 and 7,300 at 7,650.
    expect(latest?.checkpoint.instant.tick).toBe(7_650);
    expect(latest?.checkpoint).toEqual(engine.checkpoint(latest?.state as WorldState<Ledger>));
    expect((await latestCheckpoint(pool, engine.worldId, 2))?.checkpoint.instant.tick).toBe(4_000);
    expect(latest?.state).toEqual((await loadWorldState(pool, engine.worldId)).state);
  });

  it("applies a redelivered command once and refuses a reused key with different intent", async () => {
    const engine = await newWorld();
    const first = advance(engine, 0, 100, "tick-batch-0001");
    expect((await processCommand({ pool, engine, command: first })).status).toBe("accepted");
    const redelivered = { ...first, commandId: "cmd_redeliver01" } as Command;
    expect(await processCommand({ pool, engine, command: redelivered })).toMatchObject({
      status: "duplicate",
      record: { commandId: first.commandId },
    });
    expect((await loadWorldState(pool, engine.worldId)).state.clock).toBe(100);
    await expect(
      processCommand({ pool, engine, command: advance(engine, 100, 200, "tick-batch-0001") }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("concurrent runners advancing the same clock: exactly one batch wins, the other is rejected", async () => {
    const engine = await newWorld();
    const results = await Promise.all([
      processCommand({ pool, engine, command: advance(engine, 0, 500) }),
      processCommand({ pool, engine, command: advance(engine, 0, 700) }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["accepted", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected).toMatchObject({ rejection: { code: "clock_mismatch" } });
    const state = await loadWorldState(pool, engine.worldId);
    expect([500, 700]).toContain(state.state.clock);
    expect(state.state.version).toBe(1);
    expect(state.commandPosition).toBe(2);
    expect((await readEvents(pool, { worldId: engine.worldId, after: 0, limit: 10 })).events).toHaveLength(1);
  });

  it("eight concurrent writers: every command is recorded exactly once, one advance wins", async () => {
    const engine = await newWorld();
    const commands = Array.from({ length: 8 }, (_, i) => advance(engine, 0, 100 + i));
    const results = await Promise.all(commands.map((cmd) => processCommand({ pool, engine, command: cmd })));
    expect(results.filter((r) => r.status === "accepted")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    const logged = await readCommands(pool, { worldId: engine.worldId, after: 0, limit: 100 });
    expect(logged.map((e) => e.command.commandId).sort()).toEqual(commands.map((c) => c.commandId).sort());
    expect(logged.map((e) => e.record.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const state = await loadWorldState(pool, engine.worldId);
    expect(state.state.version).toBe(1);
    expect(state.commandPosition).toBe(8);
  });
});
