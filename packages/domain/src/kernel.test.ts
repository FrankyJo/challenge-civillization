import { type Command, type Digest } from "@civ/contracts";
import { createContractBuilders } from "@civ/testing";
import { describe, expect, it } from "vitest";
import { instantAt, SEASON_ONE_SPAN, type CalendarSpan } from "./calendar.js";
import { canonicalHash } from "./hash.js";
import { WorldDataError } from "./data-guard.js";
import { createEngine, replay, type Engine, type WorldState } from "./kernel.js";
import { createSystemSchedule, DAILY, YEARLY, type SimulationSystem } from "./systems.js";

const WORLD = "wld_golden0001";
const SEED = "9e3779b97f4a7c15";
const CONTENT: Digest = `sha256:${"c".repeat(64)}`;

/** Test world data: per-system tallies so stream effects are observable. */
interface Tally {
  readonly harvest: number;
  readonly census: readonly number[];
  readonly weather: number;
}

const harvest = (drawsPerTick: number): SimulationSystem<Tally> => ({
  id: "harvest",
  order: 10,
  cadence: DAILY,
  description: "test system: adds random yield every day",
  run: (data, { random }) => {
    let total = data.harvest;
    for (let i = 0; i < drawsPerTick; i += 1) total += random.nextInt(0, 100);
    return { data: { ...data, harvest: total }, events: [] };
  },
});

const census: SimulationSystem<Tally> = {
  id: "census",
  order: 20,
  cadence: YEARLY,
  description: "test system: records a random count on the first day of each year",
  run: (data, { random, instant }) => ({
    data: { ...data, census: [...data.census, instant.year * 1_000 + random.nextInt(0, 1_000)] },
    events: [],
  }),
};

const weather: SimulationSystem<Tally> = {
  id: "weather",
  order: 5,
  cadence: { every: 7, offset: 3 },
  description: "test system: weekly random weather index",
  run: (data, { random }) => ({ data: { ...data, weather: random.nextInt(0, 10) }, events: [] }),
};

function engineWith(systems: SimulationSystem<Tally>[], options: { seed?: string; span?: CalendarSpan } = {}) {
  return createEngine<Tally>({
    worldId: WORLD,
    seed: options.seed ?? SEED,
    span: options.span ?? SEASON_ONE_SPAN,
    contentVersion: CONTENT,
    schedule: createSystemSchedule(systems),
  });
}

const EMPTY: Tally = { harvest: 0, census: [], weather: 0 };

/** Commands for a world: advance in batches, pause/resume in between. */
function script(engine: Engine<Tally>, steps: readonly (number | "pause" | "resume")[]): Command[] {
  const build = createContractBuilders({ worldId: WORLD });
  const commands: Command[] = [];
  let clock = 0;
  for (const step of steps) {
    const common = { versions: engine.versions, instant: instantAt(engine.span, clock) };
    if (step === "pause" || step === "resume") {
      commands.push(build.command({ ...common, type: `world.${step}`, payload: { reason: `scripted ${step}` } }));
    } else {
      commands.push(
        build.command({
          ...common,
          type: "world.advance",
          actor: { kind: "system", component: "scheduler" },
          payload: { fromTick: clock, toTick: step },
        }),
      );
      clock = step;
    }
  }
  return commands;
}

const STEPS = [400, "pause", "resume", 365 * 10, 365 * 12 + 17] as const;

function run(systems: SimulationSystem<Tally>[], options: { seed?: string } = {}) {
  const engine = engineWith(systems, options);
  const result = replay(engine, engine.initialState(EMPTY), script(engine, STEPS));
  return { engine, ...result, stateHash: canonicalHash(result.state), eventHash: canonicalHash(result.events) };
}

describe("deterministic replay", () => {
  /**
   * Golden values: frozen in this file and checked on every platform CI runs
   * (snapshots are never written under CI=true). A change here means replay
   * of existing worlds would change: bump ENGINE_VERSION deliberately.
   */
  it("reproduces the frozen golden event and state hashes (cross-platform)", () => {
    const result = run([harvest(1), census, weather]);
    expect(result.rejections).toEqual([]);
    expect({
      configVersion: result.engine.versions.configVersion,
      eventHash: result.eventHash,
      stateHash: result.stateHash,
      data: result.state.data,
    }).toMatchInlineSnapshot(`
      {
        "configVersion": "sha256:62a5c6e2f8f822987457740eeada6dcc28276c6ce23f17ed25a5fce9b3808c68",
        "data": {
          "census": [
            1276,
            2308,
            3627,
            4961,
            5382,
            6401,
            7514,
            8171,
            9716,
            10035,
            11991,
            12650,
            13858,
          ],
          "harvest": 215820,
          "weather": 1,
        },
        "eventHash": "sha256:f88fece20d05bf8f8be4123a6841abd2afbe580d58dd49e05e9c1517c6fa0669",
        "stateHash": "sha256:c622ca08b837d76c2003b4a77caeabc08b213489d7c5ddb1aef3b1a3ad3e857b",
      }
    `);
    expect(result.engine.checkpoint(result.state)).toMatchInlineSnapshot(`
      {
        "checkpointId": "chk_35jxu97lxsnw3mfw",
        "eventPosition": 5,
        "instant": {
          "dayOfYear": 18,
          "tick": 4397,
          "year": 13,
        },
        "schemaVersion": 1,
        "stateHash": "sha256:c622ca08b837d76c2003b4a77caeabc08b213489d7c5ddb1aef3b1a3ad3e857b",
        "versions": {
          "configVersion": "sha256:62a5c6e2f8f822987457740eeada6dcc28276c6ce23f17ed25a5fce9b3808c68",
          "contentVersion": "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "engineVersion": "0.2.0",
        },
        "worldId": "wld_golden0001",
      }
    `);
  });

  it("is identical across repeated runs", () => {
    const a = run([harvest(1), census, weather]);
    const b = run([harvest(1), census, weather]);
    expect(b.eventHash).toBe(a.eventHash);
    expect(b.stateHash).toBe(a.stateHash);
  });

  it("does not depend on system registration order", () => {
    expect(run([weather, census, harvest(1)]).stateHash).toBe(run([harvest(1), census, weather]).stateHash);
  });

  it("isolates streams: extra draws in one system leave other systems unchanged", () => {
    const base = run([harvest(1), census, weather]).state.data;
    const noisy = run([harvest(9), census, weather]).state.data;
    expect(noisy.harvest).not.toBe(base.harvest);
    expect(noisy.census).toEqual(base.census);
    expect(noisy.weather).toBe(base.weather);
  });

  it("diverges for a different seed without violating invariants", () => {
    const a = run([harvest(1), census, weather]);
    const b = run([harvest(1), census, weather], { seed: "0123456789abcdef" });
    expect(b.stateHash).not.toBe(a.stateHash);
    expect(b.state.data.census).toHaveLength(a.state.data.census.length);
    expect(b.state.clock).toBe(a.state.clock);
    expect(b.events.map((event) => event.type)).toEqual(a.events.map((event) => event.type));
  });

  it("runs yearly systems exactly on year boundaries", () => {
    const { state } = run([census]);
    // ticks 0..4396 cover the first day of years 1–13.
    expect(state.data.census.map((value) => Math.floor(value / 1_000))).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
  });
});

describe("events and state", () => {
  const { engine, events, state } = run([harvest(1), census, weather]);

  it("assign contiguous ledger sequences and derived IDs, all caused by their command", () => {
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));
    expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length);
    expect(state.eventPosition).toBe(events.length);
    expect(events.map((event) => event.type)).toEqual([
      "world.advanced",
      "world.paused",
      "world.resumed",
      "world.advanced",
      "world.advanced",
    ]);
    for (const event of events) {
      expect(event.causationId).toMatch(/^cmd_/);
      expect(event.versions).toEqual(engine.versions);
    }
  });

  it("stamp events with calendar-consistent instants", () => {
    const last = events.at(-1);
    expect(last?.instant).toEqual(instantAt(SEASON_ONE_SPAN, 365 * 12 + 17));
    expect(last?.payload).toEqual({ fromTick: 3650, toTick: 4397 });
  });

  it("hash state canonically regardless of key order", () => {
    const reordered = Object.fromEntries(Object.entries(state).reverse()) as unknown as WorldState<Tally>;
    expect(canonicalHash(reordered)).toBe(canonicalHash(state));
    expect(engine.checkpoint(reordered).stateHash).toBe(engine.checkpoint(state).stateHash);
  });

  it("do not mutate the input state", () => {
    const initial = engine.initialState(EMPTY);
    const before = canonicalHash(initial);
    replay(engine, initial, script(engine, [10]));
    expect(canonicalHash(initial)).toBe(before);
  });
});

describe("command validation", () => {
  const engine = engineWith([harvest(1)]);
  const initial = engine.initialState(EMPTY);
  const build = createContractBuilders({ worldId: WORLD });
  const advance = (fromTick: number, toTick: number, extra: Record<string, unknown> = {}) =>
    build.command({
      versions: engine.versions,
      instant: instantAt(engine.span, fromTick),
      type: "world.advance",
      actor: { kind: "system", component: "scheduler" },
      payload: { fromTick, toTick },
      ...extra,
    });
  const codeOf = (state: WorldState<Tally>, command: Command) => {
    const result = engine.apply(state, command);
    return result.accepted ? "accepted" : result.rejection.code;
  };

  it("rejects stale clock positions, overruns, pauses and version mismatches", () => {
    expect(codeOf(initial, advance(1, 5))).toBe("clock_mismatch");
    expect(codeOf(initial, advance(0, engine.endTick + 1))).toBe("beyond_end");
    expect(codeOf(initial, advance(0, 5, { expectedVersion: 3 }))).toBe("stale_version");
    expect(codeOf(initial, advance(0, 5, { versions: { ...engine.versions, engineVersion: "9.9.9" } }))).toBe(
      "version_mismatch",
    );
    expect(codeOf(initial, advance(0, 5, { instant: { tick: 0, year: 1, dayOfYear: 2 } }))).toBe(
      "inconsistent_instant",
    );
    expect(codeOf({ ...initial, status: "paused" }, advance(0, 5))).toBe("world_paused");
    expect(
      codeOf(initial, build.command({ versions: engine.versions, type: "world.resume", payload: { reason: "x" } })),
    ).toBe("not_paused");
    expect(codeOf({ ...initial, status: "paused" }, build.command({ versions: engine.versions }))).toBe(
      "already_paused",
    );
    expect(codeOf(initial, advance(0, 5, { worldId: "wld_other0001" }))).toBe("wrong_world");
  });

  it("accepts an advance to exactly the end tick and nothing after", () => {
    const span = { startYear: 2025, endYear: 2026 };
    const short = engineWith([harvest(1)], { span });
    const start = short.initialState(EMPTY);
    const command = build.command({
      versions: short.versions,
      instant: { tick: 0, year: 2025, dayOfYear: 1 },
      type: "world.advance",
      actor: { kind: "system", component: "scheduler" },
      payload: { fromTick: 0, toTick: short.endTick },
    });
    const done = short.apply(start, command);
    expect(done.accepted).toBe(true);
    if (!done.accepted) return;
    expect(done.state.clock).toBe(730);
    expect(done.events.at(-1)?.instant).toEqual({ tick: 730, year: 2027, dayOfYear: 1 });
  });

  it("refuses events that are not registered contracts", () => {
    const rogue = engineWith([
      {
        id: "rogue",
        order: 1,
        cadence: DAILY,
        description: "emits an unknown event",
        run: (data) => ({ data, events: [{ type: "person.born", typeVersion: 1, payload: {} }] }),
      },
    ]);
    expect(() => rogue.apply(rogue.initialState(EMPTY), advance(0, 1, { versions: rogue.versions }))).toThrow(
      /unknown event type person\.born@1/,
    );
  });

  it("bounds the work of one advance", () => {
    expect(codeOf(initial, advance(0, 3_651))).toBe("too_many_ticks");
    expect(codeOf(initial, advance(0, 3_650))).toBe("accepted");
    const wide = createEngine<Tally>({
      worldId: WORLD,
      seed: SEED,
      span: SEASON_ONE_SPAN,
      contentVersion: CONTENT,
      schedule: createSystemSchedule([]),
      maxTicksPerAdvance: 10,
    });
    expect(wide.config.maxTicksPerAdvance).toBe(10);
    expect(wide.versions.configVersion).not.toBe(engineWith([]).versions.configVersion);
    const command = advance(0, 11, { versions: wide.versions });
    const result = wide.apply(wide.initialState(EMPTY), command);
    expect(result.accepted ? "accepted" : result.rejection.code).toBe("too_many_ticks");
    expect(() =>
      createEngine({
        worldId: WORLD,
        seed: SEED,
        span: SEASON_ONE_SPAN,
        contentVersion: CONTENT,
        schedule: createSystemSchedule([]),
        maxTicksPerAdvance: 0,
      }),
    ).toThrow(RangeError);
  });

  it("keeps the input state intact when a system mutates in place and then fails", () => {
    let calls = 0;
    const vandal = engineWith([
      {
        id: "vandal",
        order: 1,
        cadence: DAILY,
        description: "mutates its input, then throws",
        run: (data) => {
          calls += 1;
          (data.census as number[]).push(calls);
          return { data, events: [] };
        },
      },
    ]);
    const start = vandal.initialState(EMPTY);
    const before = canonicalHash(start);
    expect(() => vandal.apply(start, advance(0, 3, { versions: vandal.versions }))).toThrow(TypeError);
    expect(canonicalHash(start)).toBe(before);
    expect(Object.isFrozen(start.data)).toBe(true);
  });

  it("rejects non-JSON world data and reserved event types from systems", () => {
    const bad = (run: SimulationSystem<Tally>["run"]) =>
      engineWith([{ id: "bad", order: 1, cadence: DAILY, description: "defective", run }]);
    const attempt = (engine: Engine<Tally>) => () =>
      engine.apply(engine.initialState(EMPTY), advance(0, 1, { versions: engine.versions }));
    expect(attempt(bad((data) => ({ data: { ...data, weather: Number.NaN }, events: [] })))).toThrow(WorldDataError);
    expect(attempt(bad((data) => ({ data: { ...data, extra: new Map() } as Tally, events: [] })))).toThrow(
      /data\.extra is not a plain object/,
    );
    expect(attempt(bad((data) => ({ data: { ...data, extra: undefined } as Tally, events: [] })))).toThrow(
      WorldDataError,
    );
    expect(
      attempt(bad((data) => ({ data, events: [{ type: "world.paused", typeVersion: 1, payload: { reason: "x" } }] }))),
    ).toThrow(/reserved for the kernel/);
    expect(() => engineWith([]).initialState({ ...EMPTY, weather: 1n } as unknown as Tally)).toThrow(WorldDataError);
  });

  it("validates schedules", () => {
    expect(() => createSystemSchedule([harvest(1), { ...census, order: 10 }])).toThrow(/duplicate system order/);
    expect(() => createSystemSchedule([harvest(1), harvest(2)])).toThrow(/duplicate system id/);
    expect(() => createSystemSchedule([{ ...census, id: "Bad Id" }])).toThrow(/invalid system id/);
    expect(() => createSystemSchedule([{ ...census, cadence: { every: 0, offset: 0 } }])).toThrow(/cadence/);
  });

  it("binds the schedule into the config version", () => {
    expect(engineWith([harvest(1)]).versions.configVersion).not.toBe(
      engineWith([harvest(1), census]).versions.configVersion,
    );
    expect(engineWith([harvest(1)]).versions.configVersion).toBe(engineWith([harvest(3)]).versions.configVersion);
  });
});
