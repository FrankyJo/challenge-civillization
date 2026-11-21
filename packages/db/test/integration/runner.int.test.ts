import { createEphemeralDatabase, LedgerScript, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireLease,
  commitCommand,
  createPool,
  createWorld,
  decideControl,
  ensureWorldRunner,
  FencingError,
  IdempotencyConflictError,
  migrateUp,
  pendingControls,
  readControl,
  readWorldRunner,
  recordRunnerStatus,
  releaseLease,
  submitControl,
  type CommitCommandInput,
  type Pool,
} from "../../src/index.js";

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
let db: EphemeralDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await createEphemeralDatabase(adminUrl);
  pool = createPool({ connectionString: db.url, max: 16 });
  await migrateUp(pool);
});

afterAll(async () => {
  await pool.end();
  await db.drop();
});

const START = Date.UTC(2027, 0, 1);
let counter = 0;
async function world(): Promise<LedgerScript> {
  counter += 1;
  const script = new LedgerScript({ worldId: `wld_lease${counter.toString(36).padStart(4, "0")}` });
  await createWorld(pool, {
    world: script.world,
    initialState: script.state,
    stateHash: script.stateHash,
    correlationId: `create-${script.world.worldId}`,
  });
  await ensureWorldRunner(pool, {
    worldId: script.world.worldId,
    startsAtMs: START,
    endsAtMs: START + 1_000_000,
    catchUpCeilingTicks: 100,
  });
  return script;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const operator = { kind: "operator" as const, operatorId: "opr_00000001" as never };

describe("world lease", () => {
  it("is granted to exactly one of many concurrent contenders", async () => {
    const { worldId } = (await world()).world;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        acquireLease(pool, { worldId, holder: `contender-${index}`, ttlMs: 5_000 }),
      ),
    );
    const winners = results.filter((result) => result !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.token).toBe(1);
    expect((await readWorldRunner(pool, worldId)).leaseHolder).toBe(winners[0]?.holder);
  });

  it("keeps the token on renewal and increments it on every takeover", async () => {
    const { worldId } = (await world()).world;
    const first = await acquireLease(pool, { worldId, holder: "holder-a", ttlMs: 200 });
    const renewed = await acquireLease(pool, { worldId, holder: "holder-a", ttlMs: 200 });
    expect(renewed?.token).toBe(first?.token);
    expect(await acquireLease(pool, { worldId, holder: "holder-b", ttlMs: 200 })).toBeNull();
    await sleep(300);
    const taken = await acquireLease(pool, { worldId, holder: "holder-b", ttlMs: 5_000 });
    expect(taken?.token).toBe((first?.token ?? 0) + 1);
    // The old holder re-acquiring later gets yet another token.
    expect(await releaseLease(pool, { worldId, holder: "holder-a", token: first?.token ?? 0 })).toBe(false);
    expect(await releaseLease(pool, { worldId, holder: "holder-b", token: taken?.token ?? 0 })).toBe(true);
    expect((await acquireLease(pool, { worldId, holder: "holder-a", ttlMs: 5_000 }))?.token).toBe(
      (first?.token ?? 0) + 2,
    );
  });

  it("fences commits: stale, foreign or expired tokens write nothing", async () => {
    const script = await world();
    const { worldId } = script.world;
    const lease = await acquireLease(pool, { worldId, holder: "fenced", ttlMs: 300 });
    const fence = { holder: "fenced", token: lease?.token ?? 0 };
    const step = script.advance(10);
    await expect(
      commitCommand(pool, { ...(step as unknown as CommitCommandInput), fence: { ...fence, token: fence.token + 1 } }),
    ).rejects.toThrow(FencingError);
    await expect(
      commitCommand(pool, {
        ...(step as unknown as CommitCommandInput),
        fence: { holder: "intruder", token: fence.token },
      }),
    ).rejects.toThrow(FencingError);
    const ok = await commitCommand(pool, { ...(step as unknown as CommitCommandInput), fence });
    expect(ok.status).toBe("committed");
    script.commit(step);
    await sleep(400);
    const next = script.advance(5);
    await expect(commitCommand(pool, { ...(next as unknown as CommitCommandInput), fence })).rejects.toThrow(/expired/);
    const log = await pool.query("SELECT count(*)::int AS n FROM civ.command_log WHERE world_id = $1", [worldId]);
    expect(log.rows[0]).toEqual({ n: 1 });
    expect(await recordRunnerStatus(pool, { worldId, fence, state: "idle", backlogTicks: 0, lastError: null })).toBe(
      false,
    );
  });

  it("only moves forward and is never deleted", async () => {
    const { worldId } = (await world()).world;
    await acquireLease(pool, { worldId, holder: "forward", ttlMs: 5_000 });
    for (const sql of [
      "UPDATE civ.world_runners SET lease_token = 0 WHERE world_id = $1",
      "UPDATE civ.world_runners SET schedule_anchor_tick = schedule_anchor_tick - 1 WHERE world_id = $1",
      "DELETE FROM civ.world_runners WHERE world_id = $1",
    ]) {
      await expect(pool.query(sql, [worldId]), sql).rejects.toMatchObject({ code: "23001" });
    }
  });
});

describe("runner controls", () => {
  it("are operator-only, idempotent per request key, and decided exactly once", async () => {
    const { worldId } = (await world()).world;
    const request = {
      worldId,
      requestKey: "pause-request-1",
      action: "pause" as const,
      actor: operator,
      reason: "maintenance",
      correlationId: "c1",
    };
    await expect(
      submitControl(pool, { ...request, actor: { kind: "system", component: "scheduler" } }),
    ).rejects.toThrow(/operator/);
    await expect(submitControl(pool, { ...request, action: "step" })).rejects.toThrow(/takes ticks/);
    const first = await submitControl(pool, request);
    expect(await submitControl(pool, request)).toEqual(first);
    await expect(submitControl(pool, { ...request, reason: "something else" })).rejects.toThrow(
      IdempotencyConflictError,
    );
    expect(await pendingControls(pool, worldId)).toHaveLength(1);

    const lease = await acquireLease(pool, { worldId, holder: "decider", ttlMs: 5_000 });
    const fence = { holder: "decider", token: lease?.token ?? 0 };
    await expect(
      decideControl(pool, {
        control: first,
        fence: { ...fence, token: 99 },
        status: "applied",
        result: "x",
        correlationId: "c2",
      }),
    ).rejects.toThrow(FencingError);
    await decideControl(pool, {
      control: first,
      fence,
      status: "applied",
      result: "world paused",
      correlationId: "c2",
    });
    await expect(
      decideControl(pool, { control: first, fence, status: "rejected", result: "again", correlationId: "c3" }),
    ).rejects.toThrow(/already decided/);
    expect(await readControl(pool, first.id)).toMatchObject({ status: "applied", result: "world paused" });
    await expect(
      pool.query("UPDATE civ.runner_controls SET reason = 'edited' WHERE id = $1", [first.id]),
    ).rejects.toMatchObject({ code: "23001" });
    const audit = await pool.query("SELECT action FROM civ.audit_log WHERE world_id = $1 ORDER BY id", [worldId]);
    expect(audit.rows.map((row: { action: string }) => row.action)).toEqual(
      expect.arrayContaining(["runner.control.requested", "runner.control.applied"]),
    );
  });
});
