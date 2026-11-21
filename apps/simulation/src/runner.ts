import { commandRegistry, type Actor, type Command, type WorldRecord } from "@civ/contracts";
import {
  acquireLease,
  applyScheduleExtension,
  decideControl,
  ensureWorldRunner,
  FencingError,
  findCommandByKey,
  getWorld,
  listActiveSeasons,
  listSeasons,
  clearCatchUpApproval,
  loadWorldState,
  pendingControls,
  readWorldRunner,
  recordRunnerStatus,
  releaseLease,
  setCatchUpApproval,
  setSeasonStatus,
  type LeaseFence,
  type Pool,
  type RunnerControl,
  type RunnerState,
} from "@civ/db";
import {
  canonicalHash,
  deriveId,
  extendSegment,
  instantAt,
  segmentTicksDueAt,
  type Engine,
  type ScheduleSegment,
} from "@civ/domain";
import { type Logger } from "@civ/telemetry";
import { processCommand } from "./command-processor.js";

/**
 * The headless world runner (docs/RUNNER.md).
 *
 * Every cycle, for each world with an active season: acquire or renew the
 * world lease, apply pending operator controls, compute the ticks due from
 * the schedule segment, and commit at most one bounded `world.advance`
 * batch under the lease's fencing token. Wall time comes from the injected
 * clock; lease expiry uses the database clock. Nothing in the browser or API
 * drives advancement.
 */
export interface RunnerOptions {
  readonly pool: Pool;
  /** Stable, unique identity of this runner process (lease holder). */
  readonly holder: string;
  /**
   * Schedule clock (ms since the epoch). Production reads the database clock,
   * the same clock that decides lease expiry, so a skewed runner host cannot
   * advance early.
   */
  readonly now: () => number | Promise<number>;
  readonly logger: Logger;
  /** The engine a world runs with; its versions must equal the world's launch versions. */
  readonly engineFor: (world: WorldRecord) => Promise<Engine<unknown>>;
  readonly leaseTtlMs: number;
  /** Largest `world.advance` the runner submits (also bounded by the engine). */
  readonly maxTicksPerBatch: number;
  /** A backlog above this is not caught up automatically: the world is held for an operator decision. */
  readonly catchUpCeilingTicks: number;
  /** A backlog above this is reported as an alert. */
  readonly backlogAlertTicks: number;
  /** Single-step controls are honoured only when true (never in production). */
  readonly allowStep: boolean;
  /** Operators whose controls are honoured ("any" only outside production). Others are rejected. */
  readonly controlOperators: ReadonlySet<string> | "any";
  /** Largest schedule extension one control may request. */
  readonly maxExtensionMs: number;
  readonly checkpointIntervalTicks?: number;
}

export interface WorldCycleReport {
  readonly worldId: string;
  readonly state: RunnerState;
  readonly clock: number | null;
  readonly due: number | null;
  readonly backlog: number;
  readonly advanced: number;
  readonly controls: number;
  readonly leaseToken: number | null;
  readonly error?: string;
}

const SCHEDULER: Actor = { kind: "system", component: "scheduler" };

export class EngineMismatchError extends Error {}

export class SimulationRunner {
  readonly #options: RunnerOptions;
  readonly #engines = new Map<string, Engine<unknown>>();
  readonly #held = new Map<string, LeaseFence>();
  #lastSuccessAt: number | null = null;
  #lastFailure: string | null = null;
  #nowMs = 0;
  readonly #reports = new Map<string, WorldCycleReport>();
  #advancedTotal = 0;
  #cycles = 0;
  #lastCycleMs = 0;

  constructor(options: RunnerOptions) {
    if (!Number.isSafeInteger(options.maxTicksPerBatch) || options.maxTicksPerBatch < 1) {
      throw new RangeError("maxTicksPerBatch must be a positive integer");
    }
    this.#options = options;
  }

  /** Wall time of the last cycle that completed without an unexpected error. */
  get lastSuccessAt(): number | null {
    return this.#lastSuccessAt;
  }

  get lastFailure(): string | null {
    return this.#lastFailure;
  }

  /** One cycle over every world with an active season. */
  async runCycle(): Promise<WorldCycleReport[]> {
    const started = Date.now();
    const reports: WorldCycleReport[] = [];
    let failed: string | null = null;
    try {
      const seasons = await listActiveSeasons(this.#options.pool);
      for (const season of seasons) {
        const report = await this.runWorld(season);
        reports.push(report);
        this.#reports.set(report.worldId, report);
        this.#advancedTotal += report.advanced;
        if (report.state === "failed") failed = `${report.worldId}: ${report.error ?? "failed"}`;
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.#lastFailure = failed;
      if (failed === null) this.#lastSuccessAt = Date.now();
      this.#cycles += 1;
      this.#lastCycleMs = Date.now() - started;
    }
    return reports;
  }

  /**
   * Prometheus text exposition of the runner's gauges and counters: backlog
   * and lease state per world, cycle duration, ticks advanced, cycle age.
   * World IDs are the only label (low cardinality; never person IDs).
   */
  metricsText(): string {
    const lines = [
      "# HELP civ_runner_backlog_ticks Ticks due but not yet simulated, per world.",
      "# TYPE civ_runner_backlog_ticks gauge",
      "# HELP civ_runner_lease_held 1 when this process holds the world's lease.",
      "# TYPE civ_runner_lease_held gauge",
      "# HELP civ_runner_world_state Runner state per world (1 for the current state).",
      "# TYPE civ_runner_world_state gauge",
    ];
    for (const report of [...this.#reports.values()].sort((a, b) => (a.worldId < b.worldId ? -1 : 1))) {
      const world = `world="${report.worldId}"`;
      lines.push(`civ_runner_backlog_ticks{${world}} ${report.backlog}`);
      lines.push(`civ_runner_lease_held{${world}} ${report.state === "standby" ? 0 : 1}`);
      lines.push(`civ_runner_world_state{${world},state="${report.state}"} 1`);
    }
    lines.push(
      "# HELP civ_runner_ticks_advanced_total Ticks advanced by this process.",
      "# TYPE civ_runner_ticks_advanced_total counter",
      `civ_runner_ticks_advanced_total ${this.#advancedTotal}`,
      "# HELP civ_runner_cycles_total Runner cycles completed by this process.",
      "# TYPE civ_runner_cycles_total counter",
      `civ_runner_cycles_total ${this.#cycles}`,
      "# HELP civ_runner_cycle_duration_ms Duration of the last cycle.",
      "# TYPE civ_runner_cycle_duration_ms gauge",
      `civ_runner_cycle_duration_ms ${this.#lastCycleMs}`,
      "# HELP civ_runner_last_success_age_ms Time since the last fully successful cycle (-1: none yet).",
      "# TYPE civ_runner_last_success_age_ms gauge",
      `civ_runner_last_success_age_ms ${this.#lastSuccessAt === null ? -1 : Date.now() - this.#lastSuccessAt}`,
    );
    return `${lines.join("\n")}\n`;
  }

  /** Release every lease this runner holds (graceful shutdown). */
  async release(): Promise<void> {
    for (const [worldId, fence] of this.#held) {
      await releaseLease(this.#options.pool, { worldId, ...fence });
    }
    this.#held.clear();
  }

  async runWorld(season: {
    readonly worldId: string;
    readonly status: string;
    readonly startsAtMs: number;
    readonly endsAtMs: number;
  }): Promise<WorldCycleReport> {
    const { pool, logger } = this.#options;
    const worldId = season.worldId;
    let fence: LeaseFence | null = null;
    try {
      const engine = await this.#engine(worldId);
      await ensureWorldRunner(pool, {
        worldId,
        startsAtMs: season.startsAtMs,
        endsAtMs: season.endsAtMs,
        catchUpCeilingTicks: this.#options.catchUpCeilingTicks,
      });
      const lease = await acquireLease(pool, {
        worldId,
        holder: this.#options.holder,
        ttlMs: this.#options.leaseTtlMs,
      });
      if (lease === null) {
        this.#held.delete(worldId);
        return this.#report(worldId, "standby", { leaseToken: null });
      }
      fence = { holder: lease.holder, token: lease.token };
      const previous = this.#held.get(worldId);
      if (previous === undefined || previous.token !== fence.token) {
        logger.info({ worldId, leaseToken: fence.token }, "runner acquired world lease");
      }
      this.#held.set(worldId, fence);
      const nowMs = await this.#options.now();
      this.#nowMs = nowMs;

      if (season.status === "scheduled" && nowMs >= season.startsAtMs) {
        await this.#seasonStatus(worldId, fence, "live", null, "season start time reached");
      }

      const controls = await pendingControls(pool, worldId);
      for (const control of controls) await this.#applyControl(engine, fence, control);

      const current = await loadWorldState(pool, worldId);
      const clock = current.state.clock;
      // The public season status follows the world (also repairs a crash between a pause/resume and its status).
      const seasonStatus = (await listSeasons(pool, worldId)).at(-1)?.season.status;
      if (current.state.status === "paused" && seasonStatus === "live") {
        await this.#seasonStatus(worldId, fence, "paused", "Paused.", "the world is paused");
      } else if (current.state.status === "running" && seasonStatus === "paused") {
        await this.#seasonStatus(worldId, fence, "live", null, "the world is running");
      }
      const runner = await readWorldRunner(pool, worldId);
      const segment: ScheduleSegment = { ...runner.schedule, totalTicks: engine.endTick };
      const due = Math.max(segment.anchorTick, segmentTicksDueAt(segment, nowMs));
      let backlog = Math.max(0, due - clock);
      const base = { clock, due, controls: controls.length, leaseToken: fence.token };

      if (clock >= engine.endTick) {
        await this.#seasonStatus(
          worldId,
          fence,
          "completed",
          "The season has completed.",
          "clock reached the end tick",
        );
        return await this.#finish(worldId, fence, "completed", { ...base, backlog: 0, advanced: 0 });
      }
      if (current.state.status === "paused") {
        return await this.#finish(worldId, fence, "paused", { ...base, backlog, advanced: 0 });
      }
      const approved = runner.catchUpApprovedTo;
      const overCeiling = backlog > runner.catchUpCeilingTicks;
      if (overCeiling && (approved === null || approved <= clock)) {
        logger.error(
          { alert: "runner_backlog_held", worldId, clock, due, backlog, ceiling: runner.catchUpCeilingTicks },
          "world held: backlog exceeds the catch-up ceiling; approve catch-up or extend the schedule",
        );
        return await this.#finish(worldId, fence, "held", { ...base, backlog, advanced: 0 });
      }
      const target = overCeiling ? Math.min(due, approved ?? due) : due;
      const batch = Math.min(target - clock, this.#options.maxTicksPerBatch, engine.config.maxTicksPerAdvance);
      let advanced = 0;
      if (batch > 0) {
        const result = await processCommand({
          pool,
          engine,
          command: this.#command(
            engine,
            worldId,
            clock,
            "world.advance",
            { fromTick: clock, toTick: clock + batch },
            // The command position changes with every recorded command, so a
            // rejected advance is retried under a new key, while a crash
            // retry (nothing recorded) reuses the same key.
            `adv:${current.commandPosition}:${clock}:${clock + batch}`,
            SCHEDULER,
          ),
          fence,
          ...(this.#options.checkpointIntervalTicks === undefined
            ? {}
            : { checkpointIntervalTicks: this.#options.checkpointIntervalTicks }),
        });
        if (result.status === "rejected") {
          logger.error(
            { alert: "runner_advance_rejected", worldId, clock, batch, rejection: result.rejection },
            "runner advance was rejected",
          );
          const message = `advance rejected: ${result.rejection.code}`;
          await recordRunnerStatus(pool, {
            worldId,
            fence,
            state: "failed",
            backlogTicks: backlog,
            lastError: message,
          });
          return this.#report(worldId, "failed", { leaseToken: fence.token, error: message });
        } else {
          advanced = batch;
          backlog = Math.max(0, due - (clock + batch));
        }
      }
      if (approved !== null && clock + advanced >= approved) await clearCatchUpApproval(pool, { worldId, fence });
      if (backlog > this.#options.backlogAlertTicks) {
        logger.warn(
          { alert: "runner_backlog", worldId, backlog, due, clock: clock + advanced },
          "world is behind its schedule",
        );
      }
      return await this.#finish(worldId, fence, backlog > 0 ? "running" : "idle", { ...base, backlog, advanced });
    } catch (error) {
      if (error instanceof FencingError) {
        logger.warn({ worldId, err: error }, "runner lost the world lease; standing by");
        this.#held.delete(worldId);
        return this.#report(worldId, "standby", { leaseToken: null, error: error.message });
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ worldId, err: error }, "runner cycle failed");
      if (fence !== null) {
        await recordRunnerStatus(pool, {
          worldId,
          fence,
          state: "failed",
          backlogTicks: null,
          lastError: message,
        }).catch(() => false);
      }
      return this.#report(worldId, "failed", { leaseToken: fence?.token ?? null, error: message });
    }
  }

  async #engine(worldId: string): Promise<Engine<unknown>> {
    const cached = this.#engines.get(worldId);
    if (cached !== undefined) return cached;
    const world = await getWorld(this.#options.pool, worldId);
    if (world === null) throw new Error(`world ${worldId} does not exist`);
    const engine = await this.#options.engineFor(world);
    if (canonicalHash(engine.versions) !== canonicalHash(world.versions)) {
      throw new EngineMismatchError(`this build's engine versions differ from world ${worldId}'s launch versions`);
    }
    this.#engines.set(worldId, engine);
    return engine;
  }

  #command(
    engine: Engine<unknown>,
    worldId: string,
    clock: number,
    type: Command["type"],
    payload: object,
    key: string,
    actor: Actor,
  ): Command {
    const idempotencyKey = `${key}`.length >= 8 ? key : `${key}:runner`;
    return commandRegistry.parse({
      schemaVersion: 1,
      commandId: deriveId("command", worldId, idempotencyKey),
      type,
      typeVersion: 1,
      worldId,
      instant: instantAt(engine.span, clock),
      issuedAt: new Date(this.#nowMs).toISOString(),
      actor,
      idempotencyKey,
      expectedVersion: null,
      causationId: null,
      correlationId: `runner.${idempotencyKey}`.slice(0, 128),
      versions: engine.versions,
      payload,
    });
  }

  /** Run a command once per key: a key already in the log (an earlier attempt) is not re-sent. */
  async #once(
    engine: Engine<unknown>,
    fence: LeaseFence,
    worldId: string,
    key: string,
    build: (clock: number) => Command,
  ) {
    const known = await findCommandByKey(this.#options.pool, worldId, key);
    if (known !== null) return known.outcome;
    const clock = (await loadWorldState(this.#options.pool, worldId)).state.clock;
    const result = await processCommand({ pool: this.#options.pool, engine, command: build(clock), fence });
    return result.status === "rejected" ? "rejected" : "accepted";
  }

  async #applyControl(engine: Engine<unknown>, fence: LeaseFence, control: RunnerControl): Promise<void> {
    const { pool, logger } = this.#options;
    const worldId = control.worldId;
    const correlationId = `runner.control.${control.id}`;
    const decide = (
      status: "applied" | "rejected",
      result: string,
      apply?: Parameters<typeof decideControl>[1]["apply"],
    ) =>
      decideControl(pool, { control, fence, status, result, correlationId, ...(apply === undefined ? {} : { apply }) });
    const state = (await loadWorldState(pool, worldId)).state;
    const command = (type: Command["type"], payload: object, suffix: string) => (clock: number) =>
      this.#command(engine, worldId, clock, type, payload, `ctl:${control.id}:${suffix}`, control.requestedBy);
    logger.info({ worldId, control: control.action, controlId: control.id }, "applying runner control");
    const allowed = this.#options.controlOperators;
    const operatorId = control.requestedBy.kind === "operator" ? control.requestedBy.operatorId : "";
    if (allowed !== "any" && !allowed.has(operatorId)) {
      return decide("rejected", `operator ${operatorId || "(none)"} is not authorized for runner controls`);
    }

    switch (control.action) {
      case "pause": {
        // Idempotent across crashes: the season status is set whether or not
        // the pause was committed by an earlier attempt.
        if (state.status !== "paused") {
          const outcome = await this.#once(
            engine,
            fence,
            worldId,
            `ctl:${control.id}:pause`,
            command("world.pause", { reason: control.reason }, "pause"),
          );
          if (outcome === "rejected") return decide("rejected", "the kernel rejected the pause");
        }
        await this.#seasonStatus(
          worldId,
          fence,
          "paused",
          `Paused: ${control.reason}`,
          control.reason,
          control.requestedBy,
        );
        return decide("applied", "world paused");
      }
      case "resume": {
        if (state.status === "paused") {
          const outcome = await this.#once(
            engine,
            fence,
            worldId,
            `ctl:${control.id}:resume`,
            command("world.resume", { reason: control.reason }, "resume"),
          );
          if (outcome === "rejected") return decide("rejected", "the kernel rejected the resume");
        }
        await this.#seasonStatus(worldId, fence, "live", null, control.reason, control.requestedBy);
        return decide("applied", "world resumed");
      }
      case "step": {
        if (!this.#options.allowStep) return decide("rejected", "single-step is disabled in this environment");
        const ticks = control.ticks ?? 0;
        if (state.clock >= engine.endTick) return decide("rejected", "the season has already reached its end");
        if (state.status !== "paused" && (await findCommandByKey(pool, worldId, `ctl:${control.id}:resume`)) === null) {
          return decide("rejected", "single-step requires a paused world");
        }
        if (ticks < 1 || ticks > Math.min(this.#options.maxTicksPerBatch, engine.config.maxTicksPerAdvance)) {
          return decide(
            "rejected",
            `step must be 1–${Math.min(this.#options.maxTicksPerBatch, engine.config.maxTicksPerAdvance)} ticks`,
          );
        }
        await this.#once(
          engine,
          fence,
          worldId,
          `ctl:${control.id}:resume`,
          command("world.resume", { reason: `step: ${control.reason}` }, "resume"),
        );
        let stepped = 0;
        const advanceKey = `ctl:${control.id}:advance`;
        const advanced = await this.#once(engine, fence, worldId, advanceKey, (clock) => {
          stepped = Math.min(ticks, engine.endTick - clock);
          return this.#command(
            engine,
            worldId,
            clock,
            "world.advance",
            { fromTick: clock, toTick: clock + stepped },
            advanceKey,
            control.requestedBy,
          );
        });
        await this.#once(
          engine,
          fence,
          worldId,
          `ctl:${control.id}:pause`,
          command("world.pause", { reason: `step: ${control.reason}` }, "pause"),
        );
        return decide(
          advanced === "rejected" ? "rejected" : "applied",
          advanced === "rejected"
            ? "the kernel rejected the step"
            : `stepped ${stepped > 0 ? String(stepped) : "the requested"} ticks`,
        );
      }
      case "extend": {
        const runner = await readWorldRunner(pool, worldId);
        const nowMs = this.#nowMs;
        if ((control.extraMs ?? 0) > this.#options.maxExtensionMs) {
          return decide(
            "rejected",
            `extensions are limited to ${this.#options.maxExtensionMs / 60_000} minutes per control`,
          );
        }
        let next: ScheduleSegment;
        try {
          next = extendSegment(
            { ...runner.schedule, totalTicks: engine.endTick },
            { clock: state.clock, atMs: nowMs, extraMs: control.extraMs ?? 0 },
          );
        } catch (error) {
          return decide("rejected", error instanceof Error ? error.message : String(error));
        }
        const hours = Math.round(((control.extraMs ?? 0) / 3_600_000) * 10) / 10;
        return decide(
          "applied",
          `schedule re-anchored at tick ${state.clock}; season ends ${new Date(next.endsAtMs).toISOString()}`,
          (client) =>
            applyScheduleExtension(client, {
              worldId,
              anchorTick: next.anchorTick,
              anchorAtMs: next.anchorAtMs,
              endsAtMs: next.endsAtMs,
              statusNote: `Schedule extended by ${hours} h: ${control.reason}`.slice(0, 500),
              actor: control.requestedBy,
              at: new Date(nowMs).toISOString(),
              correlationId,
              reason: control.reason,
            }),
        );
      }
      case "approve_catch_up": {
        const runner = await readWorldRunner(pool, worldId);
        const due = segmentTicksDueAt({ ...runner.schedule, totalTicks: engine.endTick }, this.#nowMs);
        return decide("applied", `catch-up approved up to tick ${due}`, (client) =>
          setCatchUpApproval(client, worldId, due),
        );
      }
    }
  }

  async #seasonStatus(
    worldId: string,
    fence: LeaseFence,
    status: "live" | "paused" | "completed",
    statusNote: string | null,
    reason: string,
    actor: Actor = SCHEDULER,
  ): Promise<void> {
    await setSeasonStatus(this.#options.pool, {
      worldId,
      fence,
      status,
      statusNote: statusNote === null ? null : statusNote.slice(0, 500),
      actor,
      at: new Date(this.#nowMs).toISOString(),
      correlationId: `runner.season.${worldId}`.slice(0, 128),
      reason,
    });
  }

  async #finish(
    worldId: string,
    fence: LeaseFence,
    state: RunnerState,
    values: Omit<WorldCycleReport, "worldId" | "state">,
  ): Promise<WorldCycleReport> {
    await recordRunnerStatus(this.#options.pool, {
      worldId,
      fence,
      state,
      backlogTicks: values.backlog,
      lastError: null,
    });
    const report = { worldId, state, ...values };
    if (values.advanced > 0 || state !== "idle") this.#options.logger.debug({ ...report }, "runner cycle");
    return report;
  }

  #report(worldId: string, state: RunnerState, extra: { leaseToken: number | null; error?: string }): WorldCycleReport {
    return { worldId, state, clock: null, due: null, backlog: 0, advanced: 0, controls: 0, ...extra };
  }
}

/** Run cycles every `intervalMs` until stopped; cycles never overlap. Stop releases held leases. */
export function startRunnerLoop(
  runner: SimulationRunner,
  intervalMs: number,
  logger: Logger,
): { readonly stop: () => Promise<void>; readonly runOnce: () => Promise<void> } {
  let running: Promise<void> = Promise.resolve();
  let stopped = false;
  const run = (): Promise<void> => {
    running = running.then(async () => {
      if (stopped) return;
      try {
        await runner.runCycle();
      } catch (error) {
        logger.error({ err: error }, "runner cycle crashed");
      }
    });
    return running;
  };
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  void run();
  return {
    runOnce: run,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
      await runner.release();
    },
  };
}
