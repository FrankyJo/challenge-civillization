import { actorSchema, parseContract, type Actor } from "@civ/contracts";
import type pg from "pg";
import { FencingError, IdempotencyConflictError, NotFoundError, StaleWriteError } from "./errors.js";
import { toIso, toSafeInt, withTransaction, type Queryable } from "./transaction.js";
import { appendAudit } from "./worlds.js";

/**
 * World runner storage (docs/RUNNER.md): the world lease with its fencing
 * token, the schedule segment, the catch-up ceiling, runner status and the
 * operator control queue. All lease decisions use the database clock
 * (`now()`), so runner hosts with skewed clocks cannot both believe they
 * hold a lease.
 */
export interface LeaseFence {
  readonly holder: string;
  readonly token: number;
}

export type RunnerState = "standby" | "idle" | "running" | "held" | "paused" | "completed" | "failed";

export interface WorldRunnerRow {
  readonly worldId: string;
  readonly leaseHolder: string | null;
  readonly leaseToken: number;
  readonly leaseExpiresAt: string | null;
  readonly schedule: { readonly anchorTick: number; readonly anchorAtMs: number; readonly endsAtMs: number };
  readonly catchUpCeilingTicks: number;
  readonly catchUpApprovedTo: number | null;
  readonly state: RunnerState;
  readonly backlogTicks: number;
  readonly lastCycleAt: string | null;
  readonly lastError: string | null;
}

interface RunnerDbRow {
  world_id: string;
  lease_holder: string | null;
  lease_token: string | number;
  lease_expires_at: Date | null;
  schedule_anchor_tick: string | number;
  schedule_anchor_at: Date;
  schedule_ends_at: Date;
  catch_up_ceiling_ticks: number;
  catch_up_approved_to: string | number | null;
  state: RunnerState;
  backlog_ticks: string | number;
  last_cycle_at: Date | null;
  last_error: string | null;
}

function mapRunner(row: RunnerDbRow): WorldRunnerRow {
  return {
    worldId: row.world_id,
    leaseHolder: row.lease_holder,
    leaseToken: toSafeInt(row.lease_token, "lease_token"),
    leaseExpiresAt: row.lease_expires_at === null ? null : toIso(row.lease_expires_at, "lease_expires_at"),
    schedule: {
      anchorTick: toSafeInt(row.schedule_anchor_tick, "schedule_anchor_tick"),
      anchorAtMs: row.schedule_anchor_at.getTime(),
      endsAtMs: row.schedule_ends_at.getTime(),
    },
    catchUpCeilingTicks: row.catch_up_ceiling_ticks,
    catchUpApprovedTo:
      row.catch_up_approved_to === null ? null : toSafeInt(row.catch_up_approved_to, "catch_up_approved_to"),
    state: row.state,
    backlogTicks: toSafeInt(row.backlog_ticks, "backlog_ticks"),
    lastCycleAt: row.last_cycle_at === null ? null : toIso(row.last_cycle_at, "last_cycle_at"),
    lastError: row.last_error,
  };
}

function assertHolder(holder: string): void {
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(holder))
    throw new TypeError("lease holder must be 3–128 characters [A-Za-z0-9._:-]");
}

function assertTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 100 || ttlMs > 600_000) {
    throw new RangeError("lease TTL must be 100–600,000 ms");
  }
}

/**
 * Inside a transaction: require that `fence` holds the world's lease and
 * that it has not expired, and share-lock the lease row until commit, so a
 * takeover (which updates the row) waits for this transaction.
 */
export async function assertFence(client: Queryable, worldId: string, fence: LeaseFence): Promise<void> {
  const result = await client.query<{ lease_holder: string | null; lease_token: string; live: boolean }>(
    `SELECT lease_holder, lease_token, coalesce(lease_expires_at > now(), false) AS live
       FROM civ.world_runners WHERE world_id = $1 FOR SHARE`,
    [worldId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new FencingError(`world ${worldId} has no runner lease`);
  if (row.lease_holder !== fence.holder || toSafeInt(row.lease_token, "lease_token") !== fence.token) {
    throw new FencingError(`fencing token ${fence.token} of ${fence.holder} is stale for world ${worldId}`);
  }
  if (!row.live) throw new FencingError(`the lease of ${fence.holder} on world ${worldId} has expired`);
}

/** Create the runner row of a world from its season schedule, if missing; keep its catch-up ceiling current. */
export async function ensureWorldRunner(
  db: Queryable,
  input: {
    readonly worldId: string;
    readonly startsAtMs: number;
    readonly endsAtMs: number;
    readonly catchUpCeilingTicks: number;
  },
): Promise<WorldRunnerRow> {
  if (!Number.isSafeInteger(input.catchUpCeilingTicks) || input.catchUpCeilingTicks < 0) {
    throw new RangeError("catch-up ceiling must be a non-negative integer");
  }
  await db.query(
    `INSERT INTO civ.world_runners (world_id, schedule_anchor_tick, schedule_anchor_at, schedule_ends_at, catch_up_ceiling_ticks)
     VALUES ($1, 0, $2, $3, $4)
     ON CONFLICT (world_id) DO UPDATE SET catch_up_ceiling_ticks = EXCLUDED.catch_up_ceiling_ticks, updated_at = now()
       WHERE civ.world_runners.catch_up_ceiling_ticks <> EXCLUDED.catch_up_ceiling_ticks`,
    [input.worldId, new Date(input.startsAtMs), new Date(input.endsAtMs), input.catchUpCeilingTicks],
  );
  return readWorldRunner(db, input.worldId);
}

export async function readWorldRunner(db: Queryable, worldId: string): Promise<WorldRunnerRow> {
  const result = await db.query<RunnerDbRow>("SELECT * FROM civ.world_runners WHERE world_id = $1", [worldId]);
  const row = result.rows[0];
  if (row === undefined) throw new NotFoundError(`world ${worldId} has no runner row`);
  return mapRunner(row);
}

/**
 * Acquire or renew the world's lease. A holder renewing its own live lease
 * keeps its token; any new acquisition (including re-acquiring an expired
 * own lease) increments it, which fences out everything written under the
 * previous token. Returns null while another holder's lease is live.
 */
export async function acquireLease(
  db: Queryable,
  input: { readonly worldId: string; readonly holder: string; readonly ttlMs: number },
): Promise<(LeaseFence & { readonly expiresAt: string }) | null> {
  assertHolder(input.holder);
  assertTtl(input.ttlMs);
  const result = await db.query<{ lease_token: string; lease_expires_at: Date }>(
    `UPDATE civ.world_runners
        SET lease_token = CASE WHEN lease_holder = $2 AND lease_expires_at > now() THEN lease_token ELSE lease_token + 1 END,
            lease_holder = $2,
            lease_expires_at = now() + make_interval(secs => $3::double precision / 1000),
            updated_at = now()
      WHERE world_id = $1
        AND (lease_holder IS NULL OR lease_expires_at <= now() OR lease_holder = $2)
      RETURNING lease_token, lease_expires_at`,
    [input.worldId, input.holder, input.ttlMs],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    holder: input.holder,
    token: toSafeInt(row.lease_token, "lease_token"),
    expiresAt: toIso(row.lease_expires_at, "lease_expires_at"),
  };
}

/** Give the lease up (graceful shutdown). The token is kept, so it stays fenced. */
export async function releaseLease(db: Queryable, input: { readonly worldId: string } & LeaseFence): Promise<boolean> {
  const result = await db.query(
    `UPDATE civ.world_runners SET lease_holder = NULL, lease_expires_at = NULL, state = 'standby', updated_at = now()
      WHERE world_id = $1 AND lease_holder = $2 AND lease_token = $3`,
    [input.worldId, input.holder, input.token],
  );
  return (result.rowCount ?? 0) === 1;
}

/** Record the runner's status (fenced: only the live holder may write it). */
export async function recordRunnerStatus(
  db: Queryable,
  input: {
    readonly worldId: string;
    readonly fence: LeaseFence;
    readonly state: RunnerState;
    /** Null keeps the stored backlog (e.g. when a failed cycle could not compute it). */
    readonly backlogTicks: number | null;
    readonly lastError: string | null;
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE civ.world_runners
        SET state = $4, backlog_ticks = coalesce($5, backlog_ticks), last_error = $6, last_cycle_at = now(), updated_at = now()
      WHERE world_id = $1 AND lease_holder = $2 AND lease_token = $3 AND lease_expires_at > now()`,
    [
      input.worldId,
      input.fence.holder,
      input.fence.token,
      input.state,
      input.backlogTicks,
      input.lastError?.slice(0, 500) ?? null,
    ],
  );
  return (result.rowCount ?? 0) === 1;
}

// -------------------------------------------------------------- controls

export const RUNNER_CONTROL_ACTIONS = ["pause", "resume", "step", "extend", "approve_catch_up"] as const;
export type RunnerControlAction = (typeof RUNNER_CONTROL_ACTIONS)[number];

export interface RunnerControl {
  readonly id: number;
  readonly worldId: string;
  readonly requestKey: string;
  readonly action: RunnerControlAction;
  readonly ticks: number | null;
  readonly extraMs: number | null;
  readonly requestedBy: Actor;
  readonly reason: string;
  readonly requestedAt: string;
  readonly status: "pending" | "applied" | "rejected";
  readonly result: string | null;
}

interface ControlRow {
  id: string | number;
  world_id: string;
  request_key: string;
  action: RunnerControlAction;
  ticks: number | null;
  extra_ms: string | number | null;
  requested_by: unknown;
  reason: string;
  requested_at: Date;
  status: RunnerControl["status"];
  result: string | null;
}

function mapControl(row: ControlRow): RunnerControl {
  return {
    id: toSafeInt(row.id, "id"),
    worldId: row.world_id,
    requestKey: row.request_key,
    action: row.action,
    ticks: row.ticks,
    extraMs: row.extra_ms === null ? null : toSafeInt(row.extra_ms, "extra_ms"),
    requestedBy: parseContract("control actor", actorSchema, row.requested_by),
    reason: row.reason,
    requestedAt: toIso(row.requested_at, "requested_at"),
    status: row.status,
    result: row.result,
  };
}

/**
 * Queue an operator control (idempotent by request key). Only operators may
 * request controls; parameters are checked here and again when applied.
 */
export async function submitControl(
  pool: pg.Pool,
  input: {
    readonly worldId: string;
    readonly requestKey: string;
    readonly action: RunnerControlAction;
    readonly ticks?: number;
    readonly extraMs?: number;
    readonly actor: Actor;
    readonly reason: string;
    readonly correlationId: string;
  },
): Promise<RunnerControl> {
  const actor = parseContract("control actor", actorSchema, input.actor);
  if (actor.kind !== "operator") throw new TypeError("runner controls must be requested by an operator");
  if (!RUNNER_CONTROL_ACTIONS.includes(input.action)) throw new TypeError(`unknown control ${String(input.action)}`);
  if ((input.action === "step") !== (input.ticks !== undefined))
    throw new TypeError("step (and only step) takes ticks");
  if ((input.action === "extend") !== (input.extraMs !== undefined))
    throw new TypeError("extend (and only extend) takes extraMs");
  return withTransaction(pool, async (client) => {
    const inserted = await client.query<ControlRow>(
      `INSERT INTO civ.runner_controls (world_id, request_key, action, ticks, extra_ms, requested_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (world_id, request_key) DO NOTHING
       RETURNING *`,
      [
        input.worldId,
        input.requestKey,
        input.action,
        input.ticks ?? null,
        input.extraMs ?? null,
        JSON.stringify(actor),
        input.reason,
      ],
    );
    if (inserted.rows[0] !== undefined) {
      await appendAudit(client, {
        actor,
        action: `runner.control.requested`,
        worldId: input.worldId,
        subjectId: String(inserted.rows[0].id),
        correlationId: input.correlationId,
        reason: input.reason,
        details: { control: input.action, ticks: input.ticks ?? null, extraMs: input.extraMs ?? null },
      });
      return mapControl(inserted.rows[0]);
    }
    const existing = await client.query<ControlRow>(
      "SELECT * FROM civ.runner_controls WHERE world_id = $1 AND request_key = $2",
      [input.worldId, input.requestKey],
    );
    const control = mapControl(existing.rows[0] as ControlRow);
    if (
      control.action !== input.action ||
      control.ticks !== (input.ticks ?? null) ||
      control.extraMs !== (input.extraMs ?? null) ||
      control.reason !== input.reason
    ) {
      throw new IdempotencyConflictError(
        `control request key ${input.requestKey} was already used for a different request`,
      );
    }
    return control;
  });
}

export async function pendingControls(db: Queryable, worldId: string, limit = 20): Promise<RunnerControl[]> {
  const result = await db.query<ControlRow>(
    "SELECT * FROM civ.runner_controls WHERE world_id = $1 AND status = 'pending' ORDER BY id LIMIT $2",
    [worldId, limit],
  );
  return result.rows.map(mapControl);
}

export async function readControl(db: Queryable, id: number): Promise<RunnerControl> {
  const result = await db.query<ControlRow>("SELECT * FROM civ.runner_controls WHERE id = $1", [id]);
  if (result.rows[0] === undefined) throw new NotFoundError(`runner control ${id} does not exist`);
  return mapControl(result.rows[0]);
}

/** Lock the runner row and check the fence (inside a transaction). */
async function lockFenced(client: Queryable, worldId: string, fence: LeaseFence): Promise<WorldRunnerRow> {
  const result = await client.query<RunnerDbRow>("SELECT * FROM civ.world_runners WHERE world_id = $1 FOR UPDATE", [
    worldId,
  ]);
  const row = result.rows[0];
  if (row === undefined) throw new FencingError(`world ${worldId} has no runner lease`);
  const runner = mapRunner(row);
  const live = await client.query<{ live: boolean }>("SELECT $1::timestamptz > now() AS live", [row.lease_expires_at]);
  if (runner.leaseHolder !== fence.holder || runner.leaseToken !== fence.token || live.rows[0]?.live !== true) {
    throw new FencingError(`fencing token ${fence.token} of ${fence.holder} is stale for world ${worldId}`);
  }
  return runner;
}

/**
 * Record a control's final decision (fenced), with an audit row. Optional
 * `apply` runs in the same transaction for decisions with state changes.
 */
export async function decideControl(
  pool: pg.Pool,
  input: {
    readonly control: RunnerControl;
    readonly fence: LeaseFence;
    readonly status: "applied" | "rejected";
    readonly result: string;
    readonly correlationId: string;
    readonly apply?: (client: Queryable, runner: WorldRunnerRow) => Promise<void>;
  },
): Promise<void> {
  await withTransaction(pool, async (client) => {
    const runner = await lockFenced(client, input.control.worldId, input.fence);
    if (input.apply !== undefined) await input.apply(client, runner);
    const updated = await client.query(
      `UPDATE civ.runner_controls SET status = $2, result = $3, decided_at = now(), decided_token = $4
        WHERE id = $1 AND status = 'pending'`,
      [input.control.id, input.status, input.result.slice(0, 500), input.fence.token],
    );
    if ((updated.rowCount ?? 0) !== 1)
      throw new StaleWriteError(`runner control ${input.control.id} was already decided`);
    await appendAudit(client, {
      actor: input.control.requestedBy,
      action: `runner.control.${input.status}`,
      worldId: input.control.worldId,
      subjectId: String(input.control.id),
      correlationId: input.correlationId,
      reason: input.control.reason,
      details: { control: input.control.action, result: input.result.slice(0, 500), fencingToken: input.fence.token },
    });
  });
}

/** Approve catching up to `approvedTo` ticks despite the ceiling (inside `decideControl`). */
export async function setCatchUpApproval(client: Queryable, worldId: string, approvedTo: number): Promise<void> {
  await client.query("UPDATE civ.world_runners SET catch_up_approved_to = $2, updated_at = now() WHERE world_id = $1", [
    worldId,
    approvedTo,
  ]);
}

/**
 * Apply an audited schedule extension (inside `decideControl`): re-anchor
 * the runner's segment and move the public season end, with a status note.
 * Revision-checked against the season row.
 */
export async function applyScheduleExtension(
  client: Queryable,
  input: {
    readonly worldId: string;
    readonly anchorTick: number;
    readonly anchorAtMs: number;
    readonly endsAtMs: number;
    readonly statusNote: string;
    readonly actor: Actor;
    readonly at: string;
    readonly correlationId: string;
    readonly reason: string;
  },
): Promise<void> {
  const season = await client.query<{ season_id: string; revision: number; ends_at: Date }>(
    `SELECT season_id, revision, ends_at FROM civ.seasons WHERE world_id = $1 ORDER BY number DESC LIMIT 1 FOR UPDATE`,
    [input.worldId],
  );
  const row = season.rows[0];
  if (row === undefined) throw new NotFoundError(`world ${input.worldId} has no season`);
  await client.query(
    `UPDATE civ.seasons SET ends_at = $2, status_note = $3, updated_at = $4, updated_by = $5, revision = revision + 1
      WHERE season_id = $1`,
    [row.season_id, new Date(input.endsAtMs), input.statusNote, input.at, JSON.stringify(input.actor)],
  );
  await client.query(
    `UPDATE civ.world_runners
        SET schedule_anchor_tick = $2, schedule_anchor_at = $3, schedule_ends_at = $4, catch_up_approved_to = NULL, updated_at = now()
      WHERE world_id = $1`,
    [input.worldId, input.anchorTick, new Date(input.anchorAtMs), new Date(input.endsAtMs)],
  );
  await appendAudit(client, {
    actor: input.actor,
    action: "season.schedule_extended",
    worldId: input.worldId,
    subjectId: row.season_id,
    correlationId: input.correlationId,
    reason: input.reason,
    details: {
      previousEndsAt: toIso(row.ends_at, "ends_at"),
      endsAt: new Date(input.endsAtMs).toISOString(),
      anchorTick: input.anchorTick,
      anchorAt: new Date(input.anchorAtMs).toISOString(),
    },
  });
}

/**
 * Move a world's latest season to a new status (fenced, audited), e.g.
 * scheduled → live at its start, live ↔ paused with the world, → completed
 * when the clock reaches the end.
 */
export async function setSeasonStatus(
  pool: pg.Pool,
  input: {
    readonly worldId: string;
    readonly fence: LeaseFence;
    readonly status: "live" | "paused" | "completed";
    readonly statusNote: string | null;
    readonly actor: Actor;
    readonly at: string;
    readonly correlationId: string;
    readonly reason: string;
  },
): Promise<void> {
  await withTransaction(pool, async (client) => {
    await lockFenced(client, input.worldId, input.fence);
    const season = await client.query<{ season_id: string; status: string }>(
      "SELECT season_id, status FROM civ.seasons WHERE world_id = $1 ORDER BY number DESC LIMIT 1 FOR UPDATE",
      [input.worldId],
    );
    const row = season.rows[0];
    if (row === undefined) throw new NotFoundError(`world ${input.worldId} has no season`);
    if (row.status === input.status) return;
    await client.query(
      `UPDATE civ.seasons SET status = $2, status_note = $3, updated_at = $4, updated_by = $5, revision = revision + 1
        WHERE season_id = $1`,
      [row.season_id, input.status, input.statusNote, input.at, JSON.stringify(input.actor)],
    );
    await appendAudit(client, {
      actor: input.actor,
      action: "season.status_changed",
      worldId: input.worldId,
      subjectId: row.season_id,
      correlationId: input.correlationId,
      reason: input.reason,
      details: { from: row.status, to: input.status, statusNote: input.statusNote },
    });
  });
}

/** Seasons the runner drives: scheduled, live or paused, latest season per world. */
export async function listActiveSeasons(
  db: Queryable,
): Promise<{ worldId: string; seasonId: string; status: string; startsAtMs: number; endsAtMs: number }[]> {
  const result = await db.query<{
    world_id: string;
    season_id: string;
    status: string;
    starts_at: Date;
    ends_at: Date;
  }>(
    `SELECT DISTINCT ON (world_id) world_id, season_id, status, starts_at, ends_at
       FROM civ.seasons ORDER BY world_id, number DESC`,
  );
  return result.rows
    .filter((row) => row.status === "scheduled" || row.status === "live" || row.status === "paused")
    .map((row) => ({
      worldId: row.world_id,
      seasonId: row.season_id,
      status: row.status,
      startsAtMs: row.starts_at.getTime(),
      endsAtMs: row.ends_at.getTime(),
    }));
}

/** Clear a catch-up approval once the world has reached it (fenced). */
export async function clearCatchUpApproval(
  db: Queryable,
  input: { readonly worldId: string; readonly fence: LeaseFence },
): Promise<void> {
  await db.query(
    `UPDATE civ.world_runners SET catch_up_approved_to = NULL, updated_at = now()
      WHERE world_id = $1 AND lease_holder = $2 AND lease_token = $3 AND lease_expires_at > now()`,
    [input.worldId, input.fence.holder, input.fence.token],
  );
}

/** The database clock (ms since the epoch): the runner's schedule clock in production. */
export async function databaseNow(db: Queryable): Promise<number> {
  const result = await db.query<{ now: Date }>("SELECT now() AS now");
  return (result.rows[0] as { now: Date }).now.getTime();
}
