import { type Digest } from "@civ/contracts";
import {
  createPool,
  createSeason,
  createWorld,
  FencingError,
  latestCheckpoint,
  listSeasons,
  loadWorldState,
  migrateUp,
  readCommands,
  readEvents,
  readWorldRunner,
  submitControl,
  type Pool,
  type PoolClient,
} from "@civ/db";
import {
  canonicalHash,
  createEngine,
  createSystemSchedule,
  DAILY,
  deriveId,
  instantAt,
  replay,
  type Engine,
  type SimulationSystem,
  type WorldState,
} from "@civ/domain";
import { createLogger } from "@civ/telemetry";
import { createContractBuilders, createEphemeralDatabase, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { commandRegistry } from "@civ/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processCommand } from "../../src/command-processor.js";
import { SimulationRunner, type RunnerOptions } from "../../src/runner.js";

// A three-year world (1,095 ticks) played over 1,095 s: one tick per second.
interface Tally {
  readonly harvest: number;
}
const harvest: SimulationSystem<Tally> = {
  id: "harvest",
  order: 10,
  cadence: DAILY,
  description: "test: random daily yield",
  run: (data, { random }) => ({ data: { harvest: data.harvest + random.nextInt(0, 100) }, events: [] }),
};
const SPAN = { startYear: 1, endYear: 3 };
const TICKS = 1_095;
const START = Date.UTC(2027, 0, 1);
const CONTENT: Digest = `sha256:${"c".repeat(64)}`;
const silent = createLogger({ service: "simulation", level: "silent" });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
const databases: { db: EphemeralDatabase; pool: Pool }[] = [];
let pool: Pool;

async function database(): Promise<Pool> {
  const db = await createEphemeralDatabase(adminUrl);
  const next = createPool({ connectionString: db.url, max: 8 });
  await migrateUp(next);
  databases.push({ db, pool: next });
  return next;
}

beforeAll(async () => {
  pool = await database();
});

afterAll(async () => {
  for (const { db, pool: open } of databases) {
    await open.end();
    await db.drop();
  }
});

const engines = new Map<string, Engine<Tally>>();
function engineOf(worldId: string): Engine<Tally> {
  let engine = engines.get(worldId);
  if (engine === undefined) {
    engine = createEngine<Tally>({
      worldId,
      seed: "9e3779b97f4a7c15",
      span: SPAN,
      contentVersion: CONTENT,
      schedule: createSystemSchedule([harvest]),
    });
    engines.set(worldId, engine);
  }
  return engine;
}

async function world(target: Pool, worldId: string): Promise<Engine<Tally>> {
  const engine = engineOf(worldId);
  const initial = engine.initialState({ harvest: 0 });
  const builders = createContractBuilders({ worldId });
  await createWorld(target, {
    world: { ...builders.world(), seed: "9e3779b97f4a7c15", startYear: 1, endYear: 3, versions: engine.versions },
    initialState: initial,
    stateHash: canonicalHash(initial),
    checkpoint: engine.checkpoint(initial),
    correlationId: `create-${worldId}`,
  });
  await createSeason(target, {
    season: builders.season({
      seasonId: deriveId("season", worldId, 1),
      startsAt: new Date(START).toISOString(),
      endsAt: new Date(START + TICKS * 1_000).toISOString(),
    }),
    correlationId: `season-${worldId}`,
    reason: null,
  });
  return engine;
}

function runner(target: Pool, clock: { now: number }, overrides: Partial<RunnerOptions> = {}): SimulationRunner {
  return new SimulationRunner({
    pool: target,
    holder: overrides.holder ?? `test-${Math.random().toString(36).slice(2, 10)}`,
    now: () => clock.now,
    logger: silent,
    engineFor: async (record) => engineOf(record.worldId) as unknown as Engine<unknown>,
    leaseTtlMs: 5_000,
    maxTicksPerBatch: 50,
    catchUpCeilingTicks: 200,
    backlogAlertTicks: 100,
    allowStep: true,
    controlOperators: "any",
    maxExtensionMs: 7 * 24 * 3_600_000,
    checkpointIntervalTicks: 100,
    ...overrides,
  });
}

async function cycle(target: SimulationRunner, worldId: string) {
  const reports = await target.runCycle();
  return reports.find((report) => report.worldId === worldId);
}

/** Advanced ranges in ledger order; must tile [0, clock) exactly. */
async function advancedRanges(target: Pool, worldId: string): Promise<[number, number][]> {
  const page = await readEvents(target, { worldId, after: 0, limit: 5_000 });
  return page.events
    .filter((event) => event.type === "world.advanced")
    .map((event) => {
      const payload = event.payload as { fromTick: number; toTick: number };
      return [payload.fromTick, payload.toTick];
    });
}

function expectTiled(ranges: [number, number][], clock: number) {
  let next = 0;
  for (const [from, to] of ranges) {
    expect(from).toBe(next);
    expect(to).toBeGreaterThan(from);
    next = to;
  }
  expect(next).toBe(clock);
}

const operator = { kind: "operator" as const, operatorId: "opr_00000001" as never };
let keys = 0;
const control = (worldId: string, action: Parameters<typeof submitControl>[1]["action"], extra: object = {}) => {
  keys += 1;
  return submitControl(pool, {
    worldId,
    requestKey: `test-control-${keys}`,
    action,
    actor: operator,
    reason: `test ${action}`,
    correlationId: `test-${keys}`,
    ...extra,
  });
};

describe("world runner", () => {
  it("follows the schedule in bounded batches to the end of the season", async () => {
    const worldId = "wld_runner0001";
    await world(pool, worldId);
    const clock = { now: START - 1_000 };
    // A ceiling above the whole season: the final jump is caught up automatically.
    const subject = runner(pool, clock, { catchUpCeilingTicks: TICKS });
    expect(await cycle(subject, worldId)).toMatchObject({ state: "idle", clock: 0, due: 0 });
    clock.now = START + 10_500;
    expect(await cycle(subject, worldId)).toMatchObject({ advanced: 10, backlog: 0, state: "idle" });
    expect((await listSeasons(pool, worldId))[0]?.season.status).toBe("live");
    clock.now = START + 70_000;
    expect(await cycle(subject, worldId)).toMatchObject({ advanced: 50, backlog: 10, state: "running" });
    expect(await cycle(subject, worldId)).toMatchObject({ advanced: 10, backlog: 0, state: "idle" });
    clock.now = START + TICKS * 1_000;
    let report = await cycle(subject, worldId);
    for (let guard = 0; report?.state !== "completed" && guard < 40; guard += 1) report = await cycle(subject, worldId);
    expect(report?.state).toBe("completed");
    const current = await loadWorldState(pool, worldId);
    expect(current.state.clock).toBe(TICKS);
    expectTiled(await advancedRanges(pool, worldId), TICKS);
    expect((await listSeasons(pool, worldId))[0]?.season.status).toBe("completed");
    // Replay from the latest checkpoint reproduces the stored state exactly.
    const engine = engineOf(worldId);
    const checkpoint = await latestCheckpoint(pool, worldId);
    expect(checkpoint).not.toBeNull();
    const after = (await readCommands(pool, { worldId, after: 0, limit: 5_000 })).filter(
      (logged) =>
        logged.record.eventFrom >= (checkpoint?.checkpoint.eventPosition ?? 0) && logged.record.outcome === "accepted",
    );
    const replayed = replay(
      engine,
      checkpoint?.state as WorldState<Tally>,
      after.map((logged) => logged.command),
    );
    expect(canonicalHash(replayed.state)).toBe(current.stateHash);
  });

  it("crash and restart at every commit boundary gives neither duplicate nor missed ticks", async () => {
    const reference = await database();
    const faulty = await database();
    const times = [START + 30_000, START + 95_000, START + 160_000, START + 400_000, START + 401_000];
    /**
     * Drive a world through the timeline, pausing at 160 s and resuming at
     * 400 s through operator controls. A failed or lost cycle is a crash:
     * a new runner takes over after lease expiry and retries at the same time.
     */
    async function play(home: Pool, target: Pool, worldId: string, ttlMs: number): Promise<number> {
      await world(home, worldId);
      const clock = { now: START };
      let restarts = 0;
      const options = { leaseTtlMs: ttlMs, catchUpCeilingTicks: TICKS };
      let current = runner(target, clock, { holder: `${worldId}-0`, ...options });
      for (const at of times) {
        clock.now = at;
        const action = at === times[2] ? "pause" : at === times[3] ? "resume" : null;
        if (action !== null) {
          await submitControl(home, {
            worldId,
            requestKey: `crash-${action}-1`,
            action,
            actor: operator,
            reason: `timeline ${action}`,
            correlationId: `crash-${action}`,
          });
        }
        for (let guard = 0; guard < 30; guard += 1) {
          const report = await cycle(current, worldId);
          if (report?.state === "failed" || report?.state === "standby") {
            restarts += 1;
            await sleep(ttlMs + 50);
            current = runner(target, clock, { holder: `${worldId}-${restarts}`, ...options });
            continue;
          }
          if (report?.backlog === 0 || report?.state === "paused") break;
        }
      }
      return restarts;
    }
    async function outcome(target: Pool, worldId: string) {
      const state = await loadWorldState(target, worldId);
      const controls = await target.query(
        "SELECT action, status FROM civ.runner_controls WHERE world_id = $1 ORDER BY id",
        [worldId],
      );
      return {
        clock: state.state.clock,
        status: state.state.status,
        stateHash: state.stateHash,
        ranges: await advancedRanges(target, worldId),
        // Control IDs are per database; compare the keys without them.
        commands: (await readCommands(target, { worldId, after: 0, limit: 5_000 })).map((logged) =>
          logged.record.idempotencyKey.replace(/^ctl:\d+:/, "ctl:"),
        ),
        season: (await listSeasons(target, worldId)).at(-1)?.season.status,
        controls: controls.rows,
      };
    }

    // Count the COMMITs of an uninterrupted run, then crash at every one of them.
    const counting = { commits: 0, failAt: 0, mode: "before" as const, fired: false };
    await play(reference, faultyPool(reference, counting), "wld_crashcount", 5_000);
    // 18 COMMITs per run: season start, advances, pause and resume (command, status, decision each).
    expect(counting.commits).toBe(18);
    for (const mode of ["before", "after"] as const) {
      for (let k = 1; k <= counting.commits; k += 1) {
        const worldId = `wld_cr${mode[0]}${k.toString(36).padStart(7, "0")}`;
        await play(reference, reference, worldId, 5_000);
        const plan = { commits: 0, failAt: k, mode, fired: false };
        const restarts = await play(faulty, faultyPool(faulty, plan), worldId, 300);
        expect(plan.fired, `${mode} COMMIT ${k}`).toBe(true);
        expect(restarts).toBeGreaterThan(0);
        const expected = await outcome(reference, worldId);
        const actual = await outcome(faulty, worldId);
        expectTiled(actual.ranges, actual.clock);
        expect(actual).toEqual(expected);
        expect(actual).toMatchObject({ clock: 401, status: "running", season: "live" });
        expect(actual.controls).toEqual([
          { action: "pause", status: "applied" },
          { action: "resume", status: "applied" },
        ]);
      }
    }
  }, 600_000);

  it("never lets two runners advance the same world", async () => {
    const worldId = "wld_runner0002";
    await world(pool, worldId);
    const clock = { now: START };
    const a = runner(pool, clock, { holder: "runner-a" });
    const b = runner(pool, clock, { holder: "runner-b" });
    for (let step = 1; step <= 12; step += 1) {
      clock.now = START + step * 20_000;
      const [ra, rb] = await Promise.all([cycle(a, worldId), cycle(b, worldId)]);
      const active = [ra, rb].filter((report) => report?.state !== "standby");
      expect(active).toHaveLength(1);
    }
    const state = await loadWorldState(pool, worldId);
    expect(state.state.clock).toBe(240);
    expectTiled(await advancedRanges(pool, worldId), 240);
    const rejected = (await readCommands(pool, { worldId, after: 0, limit: 5_000 })).filter(
      (logged) => logged.record.outcome === "rejected",
    );
    expect(rejected).toHaveLength(0);
  });

  it("fences out a holder whose lease expired and was taken over", async () => {
    const worldId = "wld_runner0003";
    const engine = await world(pool, worldId);
    const clock = { now: START + 10_000 };
    const a = runner(pool, clock, { holder: "runner-old", leaseTtlMs: 300 });
    expect(await cycle(a, worldId)).toMatchObject({ state: "idle", leaseToken: 1 });
    await sleep(400);
    const b = runner(pool, clock, { holder: "runner-new", leaseTtlMs: 5_000 });
    clock.now = START + 20_000;
    expect(await cycle(b, worldId)).toMatchObject({ state: "idle", leaseToken: 2, clock: 10 });
    // The old holder computed an advance under token 1: its commit is refused.
    const stale = commandRegistry.parse({
      schemaVersion: 1,
      commandId: deriveId("command", worldId, "stale"),
      type: "world.advance",
      typeVersion: 1,
      worldId,
      instant: instantAt(engine.span, 20),
      issuedAt: new Date(clock.now).toISOString(),
      actor: { kind: "system", component: "scheduler" },
      idempotencyKey: "stale-advance-1",
      expectedVersion: null,
      causationId: null,
      correlationId: "stale",
      versions: engine.versions,
      payload: { fromTick: 20, toTick: 25 },
    });
    await expect(
      processCommand({ pool, engine, command: stale, fence: { holder: "runner-old", token: 1 } }),
    ).rejects.toThrow(FencingError);
    expect(await cycle(a, worldId)).toMatchObject({ state: "standby" });
    expect((await loadWorldState(pool, worldId)).state.clock).toBe(20);
  });

  it("pauses, holds an over-ceiling backlog, and catches up only after approval", async () => {
    const worldId = "wld_runner0004";
    await world(pool, worldId);
    const clock = { now: START + 50_000 };
    const subject = runner(pool, clock);
    await cycle(subject, worldId);
    await control(worldId, "pause");
    expect(await cycle(subject, worldId)).toMatchObject({ state: "paused", clock: 50 });
    expect((await listSeasons(pool, worldId))[0]?.season).toMatchObject({
      status: "paused",
      statusNote: "Paused: test pause",
    });
    clock.now = START + 600_000;
    expect(await cycle(subject, worldId)).toMatchObject({ state: "paused", clock: 50, advanced: 0 });
    await control(worldId, "resume");
    expect(await cycle(subject, worldId)).toMatchObject({ state: "held", backlog: 550, advanced: 0 });
    expect(await cycle(subject, worldId)).toMatchObject({ state: "held" });
    expect((await readWorldRunner(pool, worldId)).state).toBe("held");
    await control(worldId, "approve_catch_up");
    let report = await cycle(subject, worldId);
    expect(report).toMatchObject({ advanced: 50, state: "running" });
    for (let guard = 0; report?.backlog !== 0 && guard < 20; guard += 1) report = await cycle(subject, worldId);
    expect((await loadWorldState(pool, worldId)).state.clock).toBe(600);
  });

  it("extends the schedule with an audited decision instead of catching up", async () => {
    const worldId = "wld_runner0005";
    await world(pool, worldId);
    const clock = { now: START + 50_000 };
    const subject = runner(pool, clock);
    await cycle(subject, worldId);
    await control(worldId, "pause");
    await cycle(subject, worldId);
    clock.now = START + 1_050_000;
    await control(worldId, "resume");
    await cycle(subject, worldId);
    // 1,000 s behind: extend the season by exactly that.
    await control(worldId, "extend", { extraMs: 1_000_000 });
    expect(await cycle(subject, worldId)).toMatchObject({ state: "idle", backlog: 0, clock: 50 });
    const season = (await listSeasons(pool, worldId))[0]?.season;
    expect(season?.endsAt).toBe(new Date(START + TICKS * 1_000 + 1_000_000).toISOString());
    expect(season?.statusNote).toMatch(/Schedule extended by 0.3 h/);
    const audit = await pool.query("SELECT action FROM civ.audit_log WHERE world_id = $1 ORDER BY id", [worldId]);
    expect(audit.rows.map((row: { action: string }) => row.action)).toContain("season.schedule_extended");
    clock.now += 10_000;
    expect(await cycle(subject, worldId)).toMatchObject({ advanced: 10, clock: 50 });
    expect((await loadWorldState(pool, worldId)).state.clock).toBe(60);
  });

  it("single-steps a paused world only where allowed", async () => {
    const worldId = "wld_runner0006";
    await world(pool, worldId);
    const clock = { now: START + 5_000 };
    const subject = runner(pool, clock);
    await cycle(subject, worldId);
    await control(worldId, "pause");
    await cycle(subject, worldId);
    await control(worldId, "step", { ticks: 3 });
    expect(await cycle(subject, worldId)).toMatchObject({ state: "paused", clock: 8 });
    const locked = runner(pool, clock, { allowStep: false, holder: "locked-runner" });
    await subject.release();
    await control(worldId, "step", { ticks: 3 });
    await cycle(locked, worldId);
    expect((await loadWorldState(pool, worldId)).state.clock).toBe(8);
    const decisions = await pool.query(
      "SELECT action, status, result FROM civ.runner_controls WHERE world_id = $1 ORDER BY id",
      [worldId],
    );
    expect(decisions.rows.at(-1)).toMatchObject({
      action: "step",
      status: "rejected",
      result: "single-step is disabled in this environment",
    });
  });

  it("rejects controls from unlisted operators and oversized extensions", async () => {
    const worldId = "wld_runner0007";
    await world(pool, worldId);
    const clock = { now: START + 5_000 };
    const strict = runner(pool, clock, {
      holder: "strict-runner",
      controlOperators: new Set(["opr_99999999"]),
      maxExtensionMs: 60_000,
    });
    await cycle(strict, worldId);
    await control(worldId, "pause");
    await cycle(strict, worldId);
    expect((await loadWorldState(pool, worldId)).state.status).toBe("running");
    const open = runner(pool, clock, { holder: "strict-runner", maxExtensionMs: 60_000 });
    await control(worldId, "extend", { extraMs: 120_000 });
    await cycle(open, worldId);
    const decisions = await pool.query(
      "SELECT action, status, result FROM civ.runner_controls WHERE world_id = $1 ORDER BY id",
      [worldId],
    );
    expect(decisions.rows).toEqual([
      { action: "pause", status: "rejected", result: "operator opr_00000001 is not authorized for runner controls" },
      { action: "extend", status: "rejected", result: "extensions are limited to 1 minutes per control" },
    ]);
  });

  it("keeps the season status in step with the world and exposes metrics", async () => {
    const worldId = "wld_runner0008";
    const engine = await world(pool, worldId);
    const clock = { now: START + 5_000 };
    const subject = runner(pool, clock);
    await cycle(subject, worldId);
    // A pause committed outside the runner's control path (e.g. a crash before its status update).
    const pause = commandRegistry.parse({
      schemaVersion: 1,
      commandId: deriveId("command", worldId, "outside-pause"),
      type: "world.pause",
      typeVersion: 1,
      worldId,
      instant: instantAt(engine.span, 5),
      issuedAt: new Date(clock.now).toISOString(),
      actor: operator,
      idempotencyKey: "outside-pause-1",
      expectedVersion: null,
      causationId: null,
      correlationId: "outside",
      versions: engine.versions,
      payload: { reason: "outside" },
    });
    expect((await processCommand({ pool, engine, command: pause })).status).toBe("accepted");
    expect(await cycle(subject, worldId)).toMatchObject({ state: "paused" });
    expect((await listSeasons(pool, worldId)).at(-1)?.season.status).toBe("paused");
    const metrics = subject.metricsText();
    expect(metrics).toContain(`civ_runner_world_state{world="${worldId}",state="paused"} 1`);
    expect(metrics).toContain(`civ_runner_lease_held{world="${worldId}"} 1`);
    expect(metrics).toMatch(/civ_runner_ticks_advanced_total \d+/);
  });
});

/**
 * A pool whose k-th COMMIT fails: "before" throws instead of committing (the
 * transaction rolls back); "after" commits and then throws, as if the
 * process died before seeing the result.
 */
function faultyPool(
  target: Pool,
  plan: { commits: number; failAt: number; mode: "before" | "after"; fired: boolean },
): Pool {
  const wrapClient = (client: PoolClient): PoolClient =>
    new Proxy(client, {
      get(object, property, receiver) {
        if (property !== "query") return Reflect.get(object, property, receiver);
        return async (...args: unknown[]) => {
          const text = typeof args[0] === "string" ? args[0] : "";
          if (text.trim().toUpperCase() !== "COMMIT") return (object.query as (...a: unknown[]) => unknown)(...args);
          plan.commits += 1;
          if (plan.commits === plan.failAt && plan.mode === "before") {
            plan.fired = true;
            throw new Error("injected crash before COMMIT");
          }
          const result = await (object.query as (...a: unknown[]) => Promise<unknown>)(...args);
          if (plan.commits === plan.failAt && plan.mode === "after") {
            plan.fired = true;
            throw new Error("injected crash after COMMIT");
          }
          return result;
        };
      },
    });
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === "connect") return async () => wrapClient(await object.connect());
      const value = Reflect.get(object, property, receiver) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(object) : value;
    },
  });
}
