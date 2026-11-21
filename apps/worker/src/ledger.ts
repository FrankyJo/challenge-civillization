import { LEDGER_APPENDED_TOPIC, ledgerNotificationSchema } from "@civ/contracts";
import { consumerLag, outboxBacklog, relayOutbox, WORLD_STATUS_CONSUMER, type OutboxMessage, type Pool } from "@civ/db";
import type { Logger } from "@civ/telemetry";
import { withCorrelationId } from "@civ/telemetry";
import { Queue, UnrecoverableError, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import { UnknownJobError } from "./jobs.js";
import { projectWorldStatus } from "./world-status.js";

/** Queue carrying ledger notifications from the outbox relay to projection consumers. */
export const LEDGER_QUEUE = "ledger";

/**
 * Jobs are notifications (no facts), retried with backoff; completed jobs are
 * kept briefly so a re-published key within the hour is deduplicated by ID.
 */
export const LEDGER_JOB_OPTIONS: JobsOptions = {
  attempts: 8,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
};

export function createLedgerQueue(connection: ConnectionOptions, queueName = LEDGER_QUEUE): Queue {
  return new Queue(queueName, { connection, defaultJobOptions: LEDGER_JOB_OPTIONS });
}

/** Outbox publisher: one BullMQ job per row, job ID = outbox message key. */
export function publishToQueue(queue: Queue): (message: OutboxMessage) => Promise<void> {
  return async (message) => {
    if (message.topic !== LEDGER_APPENDED_TOPIC) throw new UnknownJobError(message.topic);
    await queue.add(message.topic, ledgerNotificationSchema.parse(message.payload), { jobId: message.messageKey });
  };
}

export interface LedgerWorkerOptions {
  readonly connection: ConnectionOptions;
  readonly pool: Pool;
  readonly logger: Logger;
  readonly concurrency?: number;
  readonly queueName?: string;
}

/**
 * Projection consumer. Each notification triggers a catch-up of the world's
 * projection from its durable cursor, so duplicates, reordering and lost
 * notifications are all harmless: the ledger, not the job, is the input.
 */
export function startLedgerWorker(options: LedgerWorkerOptions): Worker {
  const worker = new Worker(
    options.queueName ?? LEDGER_QUEUE,
    async (job) =>
      withCorrelationId(job.id ?? "unknown-job", async () => {
        // Malformed or unknown jobs can never succeed: fail them without retries.
        if (job.name !== LEDGER_APPENDED_TOPIC) throw new UnrecoverableError(new UnknownJobError(job.name).message);
        const parsed = ledgerNotificationSchema.safeParse(job.data);
        if (!parsed.success) throw new UnrecoverableError("invalid ledger notification payload");
        const notification = parsed.data;
        const result = await projectWorldStatus(options.pool, notification.worldId);
        return { worldId: notification.worldId, applied: result.applied, position: result.position };
      }),
    { connection: options.connection, concurrency: options.concurrency ?? 1 },
  );
  worker.on("failed", (job, error) => {
    options.logger.error(
      { err: error, jobId: job?.id, jobName: job?.name, attemptsMade: job?.attemptsMade },
      "ledger job failed",
    );
  });
  worker.on("error", (error) => options.logger.error({ err: error }, "ledger worker error"));
  return worker;
}

export interface PeriodicTask {
  /** Run one cycle now (waits for an in-flight cycle first). */
  runOnce(): Promise<void>;
  /** Stop scheduling and wait for the in-flight cycle. */
  stop(): Promise<void>;
}

/** Run `cycle` every `intervalMs`, never overlapping; errors are logged, not fatal. */
export function startPeriodic(
  name: string,
  intervalMs: number,
  logger: Logger,
  cycle: () => Promise<void>,
): PeriodicTask {
  let running: Promise<void> = Promise.resolve();
  let stopped = false;
  const run = (): Promise<void> => {
    running = running.then(async () => {
      try {
        await cycle();
      } catch (error) {
        logger.error({ err: error, task: name }, "periodic task failed");
      }
    });
    return running;
  };
  const timer = setInterval(() => {
    if (!stopped) void run();
  }, intervalMs);
  timer.unref();
  return {
    runOnce: run,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}

/** Relay pending outbox rows to the ledger queue every `intervalMs`. */
export function startOutboxRelay(options: {
  readonly pool: Pool;
  readonly queue: Queue;
  readonly logger: Logger;
  readonly intervalMs: number;
}): PeriodicTask {
  const publish = publishToQueue(options.queue);
  return startPeriodic("outbox-relay", options.intervalMs, options.logger, async () => {
    for (;;) {
      const result = await relayOutbox(options.pool, { publish });
      if (result.failed > 0) options.logger.warn({ ...result }, "outbox publish failures; will retry");
      if (result.published === 0) break;
    }
  });
}

/**
 * Safety net independent of Redis: find worlds whose projection lags the
 * ledger head and catch them up directly. Covers notifications lost with a
 * Redis restart or flush, and reports relay/consumer lag.
 */
export function startReconciler(options: {
  readonly pool: Pool;
  readonly logger: Logger;
  readonly intervalMs: number;
}): PeriodicTask {
  return startPeriodic("projection-reconciler", options.intervalMs, options.logger, async () => {
    const backlog = await outboxBacklog(options.pool);
    const lagging = (await consumerLag(options.pool, WORLD_STATUS_CONSUMER)).filter((world) => world.lag > 0);
    let failures = 0;
    // One broken world (integrity error, reducer defect) must not block the
    // safety net for every other world: isolate failures per world.
    for (const world of lagging) {
      try {
        await projectWorldStatus(options.pool, world.worldId);
      } catch (error) {
        failures += 1;
        options.logger.error({ err: error, worldId: world.worldId, lag: world.lag }, "projection reconcile failed");
      }
    }
    options.logger.info(
      {
        outbox: backlog,
        laggingWorlds: lagging.length,
        maxLag: lagging.reduce((max, world) => Math.max(max, world.lag), 0),
        failures,
      },
      "projection reconcile",
    );
  });
}
