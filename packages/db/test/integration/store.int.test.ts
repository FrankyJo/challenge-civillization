import { createEphemeralDatabase, LedgerScript, requireTestEnv, type EphemeralDatabase } from "@civ/testing";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AlreadyExistsError,
  catchUp,
  commitCommand,
  consumeBatch,
  consumerLag,
  createPool,
  createSeason,
  createWorld,
  findCommandByKey,
  findEvent,
  getWorld,
  IdempotencyConflictError,
  latestCheckpoint,
  LedgerIntegrityError,
  listSeasons,
  loadWorldState,
  migrateUp,
  outboxBacklog,
  processOnce,
  readCommands,
  readEvents,
  relayOutbox,
  StaleWriteError,
  UnknownWorldError,
  updateSeason,
  type CommitCommandInput,
  type OutboxMessage,
  type Pool,
  type PoolClient,
} from "../../src/index.js";

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
let db: EphemeralDatabase;
let pool: Pool;

beforeAll(async () => {
  db = await createEphemeralDatabase(adminUrl);
  pool = createPool({ connectionString: db.url, max: 12 });
  await migrateUp(pool);
});

afterAll(async () => {
  await pool.end();
  await db.drop();
});

let worldCounter = 0;
/** A fresh world (unique ID) created in the store, with its script. */
async function newWorld(): Promise<LedgerScript> {
  worldCounter += 1;
  const script = new LedgerScript({ worldId: `wld_store${worldCounter.toString(36).padStart(4, "0")}` });
  await createWorld(pool, {
    world: script.world,
    initialState: script.state,
    stateHash: script.stateHash,
    correlationId: `create-${script.world.worldId}`,
  });
  return script;
}

const asInput = (step: unknown) => step as CommitCommandInput;

/** Commit a step and advance the script on success. */
async function commit(script: LedgerScript, step: ReturnType<LedgerScript["pause"]>) {
  const result = await commitCommand(pool, asInput(step));
  if (result.status === "committed") script.commit(step);
  return result;
}

async function counts(worldId: string) {
  const result = await pool.query<{ commands: number; events: number; outbox: number; checkpoints: number }>(
    `SELECT (SELECT count(*)::int FROM civ.command_log WHERE world_id = $1) AS commands,
            (SELECT count(*)::int FROM civ.domain_events WHERE world_id = $1) AS events,
            (SELECT count(*)::int FROM civ.outbox WHERE world_id = $1) AS outbox,
            (SELECT count(*)::int FROM civ.checkpoints WHERE world_id = $1) AS checkpoints`,
    [worldId],
  );
  return result.rows[0];
}

describe("worlds", () => {
  it("creates a world with its partition, state and audit row; refuses duplicates", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    expect(await getWorld(pool, worldId)).toEqual(script.world);
    const current = await loadWorldState(pool, worldId);
    expect(current.state).toEqual(script.state);
    expect(current.stateHash).toBe(script.stateHash);
    expect(current.commandPosition).toBe(0);

    const partitions = await pool.query(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'civ.domain_events'::regclass AND pg_get_expr(c.relpartbound, c.oid) LIKE $1`,
      [`%${worldId}%`],
    );
    expect(partitions.rowCount).toBe(1);

    const audit = await pool.query("SELECT action FROM civ.audit_log WHERE world_id = $1", [worldId]);
    expect(audit.rows).toEqual([{ action: "world.created" }]);

    await expect(
      createWorld(pool, {
        world: script.world,
        initialState: script.state,
        stateHash: script.stateHash,
        correlationId: "again",
      }),
    ).rejects.toBeInstanceOf(AlreadyExistsError);
    await expect(loadWorldState(pool, "wld_missing00")).rejects.toBeInstanceOf(UnknownWorldError);
  });

  it("rejects an initial state whose hash does not match", async () => {
    const script = new LedgerScript({ worldId: "wld_badhash00" });
    await expect(
      createWorld(pool, {
        world: script.world,
        initialState: script.state,
        stateHash: `sha256:${"0".repeat(64)}`,
        correlationId: "bad",
      }),
    ).rejects.toBeInstanceOf(LedgerIntegrityError);
    expect(await getWorld(pool, "wld_badhash00")).toBeNull();
  });
});

describe("commitCommand", () => {
  it("atomically records command, events, state and outbox notification", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    const step = script.pause();
    const result = await commit(script, step);
    expect(result).toMatchObject({
      status: "committed",
      record: { position: 0, outcome: "accepted", eventFrom: 0, eventTo: 1, rejection: null },
    });
    expect(await counts(worldId)).toEqual({ commands: 1, events: 1, outbox: 1, checkpoints: 0 });

    const current = await loadWorldState(pool, worldId);
    expect(current.state).toEqual(step.outcome.state);
    expect(current.commandPosition).toBe(1);

    const page = await readEvents(pool, { worldId, after: 0, limit: 10 });
    expect(page.events).toEqual(step.outcome.events);
    expect(await findEvent(pool, worldId, step.outcome.events[0]?.eventId ?? "")).toEqual(step.outcome.events[0]);

    const logged = await readCommands(pool, { worldId, after: 0, limit: 10 });
    expect(logged.map((entry) => entry.command)).toEqual([step.command]);

    const outbox = await pool.query("SELECT message_key, topic, payload FROM civ.outbox WHERE world_id = $1", [
      worldId,
    ]);
    expect(outbox.rows).toEqual([
      {
        message_key: `ledger.${worldId}.1`,
        topic: "ledger.appended",
        payload: { schemaVersion: 1, worldId, fromPosition: 0, toPosition: 1 },
      },
    ]);

    const audit = await pool.query("SELECT action, reason FROM civ.audit_log WHERE world_id = $1 ORDER BY id", [
      worldId,
    ]);
    expect(audit.rows).toEqual([
      { action: "world.created", reason: null },
      { action: "command.world.pause", reason: "maintenance" },
    ]);
  });

  it("gives duplicate deliveries exactly one effect, including retries with a new command ID", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    const step = script.pause();
    expect((await commit(script, step)).status).toBe("committed");
    const again = await commitCommand(pool, asInput(step));
    expect(again).toMatchObject({ status: "duplicate", record: { position: 0, outcome: "accepted" } });

    // A client retry re-mints commandId/issuedAt; the processor recomputes it
    // on the current (paused) state, and the store still answers "duplicate".
    const reminted: CommitCommandInput = {
      command: { ...step.command, commandId: "cmd_reminted0", issuedAt: "2027-02-01T00:00:00.000Z" } as never,
      basedOn: { version: 1, eventPosition: 1 },
      outcome: { accepted: false, rejection: { code: "already_paused", message: "world is already paused" } },
    };
    expect(await commitCommand(pool, reminted)).toMatchObject({
      status: "duplicate",
      record: { commandId: step.command.commandId, outcome: "accepted" },
    });
    expect(await counts(worldId)).toEqual({ commands: 1, events: 1, outbox: 1, checkpoints: 0 });
    expect((await findCommandByKey(pool, worldId, step.command.idempotencyKey))?.commandId).toBe(
      step.command.commandId,
    );
  });

  it("serialises concurrent duplicate deliveries to one effect", async () => {
    const script = await newWorld();
    const step = script.advance(10);
    const results = await Promise.all(Array.from({ length: 8 }, () => commitCommand(pool, asInput(step))));
    expect(results.filter((r) => r.status === "committed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "duplicate")).toHaveLength(7);
    expect(await counts(script.world.worldId)).toEqual({ commands: 1, events: 1, outbox: 1, checkpoints: 0 });
  });

  it("refuses to reuse an idempotency key or command ID for a different request", async () => {
    const script = await newWorld();
    const first = script.pause();
    await commit(script, first);
    const sameKey = script.resume({ idempotencyKey: first.command.idempotencyKey });
    await expect(commitCommand(pool, asInput(sameKey))).rejects.toBeInstanceOf(IdempotencyConflictError);

    const sameId = script.resume({ commandId: first.command.commandId });
    await expect(commitCommand(pool, asInput(sameId))).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await counts(script.world.worldId)).toMatchObject({ commands: 1, events: 1 });
  });

  it("rejects stale writers and writes nothing for them", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    const a = script.advance(5);
    const b = script.advance(7);
    const results = await Promise.allSettled([commitCommand(pool, asInput(a)), commitCommand(pool, asInput(b))]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(StaleWriteError);
    expect(await counts(worldId)).toEqual({ commands: 1, events: 1, outbox: 1, checkpoints: 0 });
    expect((await loadWorldState(pool, worldId)).state.version).toBe(1);

    // A sequential stale write is rejected the same way.
    const winner = fulfilled.length === 1 && results[0]?.status === "fulfilled" ? a : b;
    script.commit(winner);
    const loser = winner === a ? b : a;
    await expect(commitCommand(pool, asInput(loser))).rejects.toBeInstanceOf(StaleWriteError);
  });

  it("records rejections in order without events or state changes; duplicates repeat them", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    const step = script.resume();
    const input: CommitCommandInput = {
      command: step.command,
      basedOn: step.basedOn,
      outcome: { accepted: false, rejection: { code: "not_paused", message: "world is not paused" } },
    };
    const result = await commitCommand(pool, input);
    expect(result).toMatchObject({
      status: "committed",
      record: { position: 0, outcome: "rejected", rejection: { code: "not_paused" }, eventFrom: 0, eventTo: 0 },
    });
    expect((await commitCommand(pool, input)).status).toBe("duplicate");
    const current = await loadWorldState(pool, worldId);
    expect(current.state).toEqual(script.state);
    expect(current.commandPosition).toBe(1);
    expect(await counts(worldId)).toEqual({ commands: 1, events: 0, outbox: 0, checkpoints: 0 });

    const next = script.pause();
    expect((await commit(script, next)).record.position).toBe(1);
  });

  it("rolls back everything when any write in the transaction fails", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    await commit(script, script.pause());
    const before = await loadWorldState(pool, worldId);

    await pool.query(`
      CREATE FUNCTION civ.test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$;
      CREATE TRIGGER test_fail_outbox BEFORE INSERT ON civ.outbox
        FOR EACH ROW EXECUTE FUNCTION civ.test_fail_outbox();`);
    try {
      await expect(commitCommand(pool, asInput(script.resume()))).rejects.toThrow(/injected outbox failure/);
    } finally {
      await pool.query("DROP TRIGGER test_fail_outbox ON civ.outbox; DROP FUNCTION civ.test_fail_outbox();");
    }
    expect(await counts(worldId)).toEqual({ commands: 1, events: 1, outbox: 1, checkpoints: 0 });
    expect(await loadWorldState(pool, worldId)).toEqual(before);

    // The same command succeeds once the fault is gone: nothing half-applied blocks it.
    expect((await commit(script, script.resume())).status).toBe("committed");
  });

  it("refuses inconsistent outcomes before writing", async () => {
    const script = await newWorld();
    const step = script.pause();
    const wrongSequence = {
      ...step,
      outcome: { ...step.outcome, events: step.outcome.events.map((e) => ({ ...e, sequence: 5 })) },
    };
    await expect(commitCommand(pool, asInput(wrongSequence))).rejects.toBeInstanceOf(LedgerIntegrityError);
    const wrongHash = { ...step, outcome: { ...step.outcome, stateHash: `sha256:${"1".repeat(64)}` } };
    await expect(commitCommand(pool, asInput(wrongHash))).rejects.toBeInstanceOf(LedgerIntegrityError);
    const wrongCause = {
      ...step,
      outcome: { ...step.outcome, events: step.outcome.events.map((e) => ({ ...e, causationId: "cmd_other000" })) },
    };
    await expect(commitCommand(pool, asInput(wrongCause))).rejects.toBeInstanceOf(LedgerIntegrityError);
    expect(await counts(script.world.worldId)).toEqual({ commands: 0, events: 0, outbox: 0, checkpoints: 0 });
  });

  it("stores checkpoints with their state and restores the latest at or before a position", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    const first = script.advance(365, { checkpoint: true });
    await commit(script, first);
    await commit(script, script.advance(30));
    const second = script.advance(335, { checkpoint: true });
    await commit(script, second);

    const latest = await latestCheckpoint(pool, worldId);
    expect(latest?.checkpoint).toEqual(second.outcome.checkpoint);
    expect(latest?.state).toEqual(second.outcome.state);
    expect((await latestCheckpoint(pool, worldId, 2))?.checkpoint).toEqual(first.outcome.checkpoint);
    expect(await latestCheckpoint(pool, worldId, 0)).toBeNull();
  });
});

describe("append-only ledger", () => {
  it("rejects UPDATE, DELETE and TRUNCATE of facts even with direct SQL", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    await commit(script, script.advance(365, { checkpoint: true }));
    const partition = await pool.query<{ name: string }>("SELECT civ.ensure_event_partition($1) AS name", [worldId]);
    const statements = [
      ["UPDATE civ.domain_events SET type = 'x.y' WHERE world_id = $1", [worldId]],
      ["DELETE FROM civ.domain_events WHERE world_id = $1", [worldId]],
      [`DELETE FROM civ.${partition.rows[0]?.name}`, []],
      [`TRUNCATE civ.${partition.rows[0]?.name}`, []],
      ["UPDATE civ.world_state SET version = 0 WHERE world_id = $1", [worldId]],
      ["UPDATE civ.world_state SET clock = 0 WHERE world_id = $1", [worldId]],
      ["DELETE FROM civ.world_state WHERE world_id = $1", [worldId]],
      ["TRUNCATE civ.world_state CASCADE", []],
      ["UPDATE civ.command_log SET outcome = 'rejected' WHERE world_id = $1", [worldId]],
      ["DELETE FROM civ.command_log WHERE world_id = $1", [worldId]],
      ["UPDATE civ.checkpoints SET state_hash = state_hash WHERE world_id = $1", [worldId]],
      ["DELETE FROM civ.audit_log WHERE world_id = $1", [worldId]],
      ["UPDATE civ.worlds SET name = 'renamed' WHERE world_id = $1", [worldId]],
      ["TRUNCATE civ.command_log, civ.audit_log, civ.checkpoints", []],
    ] as const;
    for (const [sql, params] of statements) {
      await expect(pool.query(sql, [...params]), sql).rejects.toMatchObject({ code: "23001" });
    }
    expect(await counts(worldId)).toEqual({ commands: 1, events: 1, outbox: 1, checkpoints: 1 });
  });

  it("has no default partition: a world without its own partition cannot receive events", async () => {
    const partitions = await pool.query(
      "SELECT count(*)::int AS n FROM pg_partitioned_table WHERE partrelid = 'civ.domain_events'::regclass AND partdefid <> 0",
    );
    expect(partitions.rows[0]).toEqual({ n: 0 });
  });

  it("exposes no repository operation that rewrites or deletes facts", async () => {
    const api = Object.keys(await import("../../src/index.js"));
    expect(api.filter((name) => /^(update|delete|remove|rewrite|truncate|edit)/i.test(name))).toEqual(["updateSeason"]);
  });
});

describe("event cursors", () => {
  it("pages are stable, ordered and complete for any page size, even while the ledger grows", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    for (let i = 0; i < 25; i += 1) await commit(script, script.advance(1 + (i % 3)));
    const all = (await readEvents(pool, { worldId, after: 0, limit: 5_000 })).events;
    expect(all.map((e) => e.sequence)).toEqual(Array.from({ length: 25 }, (_, i) => i));

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 0, max: 25 }), async (limit, start) => {
        const collected = [];
        let cursor = start;
        for (;;) {
          const page = await readEvents(pool, { worldId, after: cursor, limit });
          const repeat = await readEvents(pool, { worldId, after: cursor, limit });
          expect(repeat).toEqual(page);
          collected.push(...page.events);
          if (page.events.length === 0) break;
          cursor = page.nextPosition;
        }
        expect(collected).toEqual(all.slice(start));
      }),
      { numRuns: 25 },
    );

    const firstPage = await readEvents(pool, { worldId, after: 0, limit: 10 });
    await commit(script, script.advance(1));
    expect(await readEvents(pool, { worldId, after: 0, limit: 10 })).toEqual(firstPage);
    expect((await readEvents(pool, { worldId, after: 25, limit: 10 })).events.map((e) => e.sequence)).toEqual([25]);
  });

  it("validates page arguments", async () => {
    await expect(readEvents(pool, { worldId: "wld_store0001", after: -1, limit: 1 })).rejects.toThrow(RangeError);
    await expect(readEvents(pool, { worldId: "wld_store0001", after: 0, limit: 0 })).rejects.toThrow(RangeError);
    await expect(readEvents(pool, { worldId: "wld_store0001", after: 0, limit: 5_001 })).rejects.toThrow(RangeError);
  });
});

describe("outbox relay", () => {
  async function pendingKeys(worldId: string): Promise<string[]> {
    const result = await pool.query<{ message_key: string }>(
      "SELECT message_key FROM civ.outbox WHERE world_id = $1 AND published_at IS NULL ORDER BY id",
      [worldId],
    );
    return result.rows.map((row) => row.message_key);
  }

  it("publishes pending rows once, retries failures with backoff, and never drops them", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    await commit(script, script.pause());
    await commit(script, script.resume());
    expect(await pendingKeys(worldId)).toHaveLength(2);

    const failing = await relayOutbox(pool, {
      publish: async (message) => {
        if (message.worldId === worldId) throw new Error("redis down");
      },
    });
    expect(failing.failed).toBeGreaterThanOrEqual(2);
    const retried = await pool.query(
      "SELECT attempts, last_error, next_attempt_at > now() AS deferred FROM civ.outbox WHERE world_id = $1",
      [worldId],
    );
    expect(retried.rows).toEqual([
      { attempts: 1, last_error: "Error: redis down", deferred: true },
      { attempts: 1, last_error: "Error: redis down", deferred: true },
    ]);
    expect((await outboxBacklog(pool)).pending).toBeGreaterThanOrEqual(2);

    await pool.query("UPDATE civ.outbox SET next_attempt_at = now() WHERE world_id = $1", [worldId]);
    const seen: OutboxMessage[] = [];
    await relayOutbox(pool, {
      publish: async (message) => {
        seen.push(message);
      },
    });
    expect(seen.filter((m) => m.worldId === worldId).map((m) => m.messageKey)).toEqual([
      `ledger.${worldId}.1`,
      `ledger.${worldId}.2`,
    ]);
    expect(await pendingKeys(worldId)).toEqual([]);
    seen.length = 0;
    await relayOutbox(pool, { publish: async (message) => void seen.push(message) });
    expect(seen.filter((m) => m.worldId === worldId)).toEqual([]);
  });

  it("bounds a hanging publish and releases nothing until the lease or backoff expires", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    await commit(script, script.pause());
    const result = await relayOutbox(pool, {
      publish: (message) => (message.worldId === worldId ? new Promise<void>(() => undefined) : Promise.resolve()),
      publishTimeoutMs: 100,
    });
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const row = await pool.query("SELECT attempts, last_error, published_at FROM civ.outbox WHERE world_id = $1", [
      worldId,
    ]);
    expect(row.rows).toEqual([
      { attempts: 1, last_error: "PublishTimeoutError: publish did not complete within 100ms", published_at: null },
    ]);
  });

  it("a claimed row is leased: another relay skips it until the lease expires", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    await commit(script, script.pause());
    let release: () => void = () => undefined;
    const seenBySecond: string[] = [];
    const first = relayOutbox(pool, {
      publish: (message) =>
        message.worldId === worldId ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await relayOutbox(pool, { publish: async (message) => void seenBySecond.push(message.worldId) });
    expect(seenBySecond).not.toContain(worldId);
    release();
    await first;
    const row = await pool.query("SELECT published_at IS NOT NULL AS done FROM civ.outbox WHERE world_id = $1", [
      worldId,
    ]);
    expect(row.rows).toEqual([{ done: true }]);
  });

  it("concurrent relays never claim the same row", async () => {
    const script = await newWorld();
    for (let i = 0; i < 20; i += 1) await commit(script, script.advance(1));
    const published: string[] = [];
    const publish = async (message: OutboxMessage) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      published.push(message.messageKey);
    };
    await Promise.all([
      relayOutbox(pool, { publish, batchSize: 7 }),
      relayOutbox(pool, { publish, batchSize: 7 }),
      relayOutbox(pool, { publish, batchSize: 7 }),
    ]);
    while ((await relayOutbox(pool, { publish })).published > 0);
    const mine = published.filter((key) => key.startsWith(`ledger.${script.world.worldId}.`));
    expect(mine).toHaveLength(20);
    expect(new Set(mine).size).toBe(20);
  });
});

describe("ledger consumers", () => {
  beforeAll(async () => {
    await pool.query(
      "CREATE TABLE civ.test_effects (consumer text, world_id text, sequence bigint, PRIMARY KEY (consumer, world_id, sequence))",
    );
  });

  const recordEffects =
    (consumer: string) => async (client: PoolClient, events: readonly { worldId: string; sequence: number }[]) => {
      for (const event of events) {
        await client.query("INSERT INTO civ.test_effects VALUES ($1, $2, $3)", [
          consumer,
          event.worldId,
          event.sequence,
        ]);
      }
    };

  it("applies every event exactly once under concurrent, duplicated deliveries", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    for (let i = 0; i < 30; i += 1) await commit(script, script.advance(1));
    const handle = recordEffects("concurrent");
    const results = await Promise.all(
      Array.from({ length: 6 }, () => catchUp(pool, { consumer: "concurrent", worldId, batchSize: 4, handle })),
    );
    expect(results.reduce((sum, r) => sum + r.applied, 0)).toBe(30);
    const effects = await pool.query("SELECT count(*)::int AS n FROM civ.test_effects WHERE world_id = $1", [worldId]);
    expect(effects.rows[0]).toEqual({ n: 30 });
    expect((await consumerLag(pool, "concurrent")).find((lag) => lag.worldId === worldId)).toEqual({
      worldId,
      position: 30,
      head: 30,
      lag: 0,
    });
  });

  it("does not advance the cursor when the handler fails", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    await commit(script, script.pause());
    await expect(
      consumeBatch(pool, {
        consumer: "failing",
        worldId,
        handle: async (client, events) => {
          await recordEffects("failing")(client, events);
          throw new Error("projection bug");
        },
      }),
    ).rejects.toThrow("projection bug");
    const effects = await pool.query("SELECT count(*)::int AS n FROM civ.test_effects WHERE consumer = 'failing'");
    expect(effects.rows[0]).toEqual({ n: 0 });
    const retry = await consumeBatch(pool, { consumer: "failing", worldId, handle: recordEffects("failing") });
    expect(retry).toEqual({ applied: 1, position: 1 });
  });

  it("processOnce runs a job's effects once per message key", async () => {
    let runs = 0;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        processOnce(pool, { consumer: "mailer", messageKey: "job-1" }, async (client) => {
          runs += 1;
          await client.query("SELECT pg_sleep(0.05)");
          return "sent";
        }),
      ),
    );
    expect(runs).toBe(1);
    expect(results.filter((r) => r.status === "processed")).toEqual([{ status: "processed", result: "sent" }]);

    await expect(
      processOnce(pool, { consumer: "mailer", messageKey: "job-2" }, async () => {
        throw new Error("smtp down");
      }),
    ).rejects.toThrow("smtp down");
    expect(await processOnce(pool, { consumer: "mailer", messageKey: "job-2" }, async () => "retried")).toEqual({
      status: "processed",
      result: "retried",
    });
  });
});

describe("seasons", () => {
  it("creates, lists and revision-checks updates with audit rows", async () => {
    const script = await newWorld();
    const worldId = script.world.worldId;
    const season = script.builders.season({ worldId });
    const created = await createSeason(pool, { season, correlationId: "season-create", reason: null });
    expect(created).toEqual({ season, revision: 0 });
    await expect(createSeason(pool, { season, correlationId: "again", reason: null })).rejects.toBeInstanceOf(
      AlreadyExistsError,
    );

    const operator = { kind: "operator", operatorId: "opr_00000001" } as const;
    const updated = await updateSeason(pool, {
      seasonId: season.seasonId,
      expectedRevision: 0,
      changes: { status: "live" },
      actor: operator as never,
      at: "2027-01-02T00:00:00.000Z",
      correlationId: "go-live",
      reason: "launch",
    });
    expect(updated.revision).toBe(1);
    expect(updated.season.status).toBe("live");
    await expect(
      updateSeason(pool, {
        seasonId: season.seasonId,
        expectedRevision: 0,
        changes: { status: "paused" },
        actor: operator as never,
        at: "2027-01-03T00:00:00.000Z",
        correlationId: "stale",
        reason: "stale",
      }),
    ).rejects.toBeInstanceOf(StaleWriteError);
    expect((await listSeasons(pool, worldId)).map((s) => s.season.status)).toEqual(["live"]);

    const audit = await pool.query(
      "SELECT action, reason, details->'after'->>'status' AS status FROM civ.audit_log WHERE subject_id = $1 ORDER BY id",
      [season.seasonId],
    );
    expect(audit.rows).toEqual([
      { action: "season.created", reason: null, status: null },
      { action: "season.updated", reason: "launch", status: "live" },
    ]);
  });
});
