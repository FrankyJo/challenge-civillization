import type { Logger } from "@civ/telemetry";
import { withCorrelationId } from "@civ/telemetry";
import { Worker, type ConnectionOptions } from "bullmq";
import { processSystemJob, SYSTEM_QUEUE } from "./jobs.js";

export interface SystemWorkerOptions {
  readonly connection: ConnectionOptions;
  readonly logger: Logger;
  readonly concurrency?: number;
  readonly queueName?: string;
}

/** Start the BullMQ consumer for the system queue. Caller owns `close()`. */
export function startSystemWorker(options: SystemWorkerOptions): Worker {
  const worker = new Worker(
    options.queueName ?? SYSTEM_QUEUE,
    async (job) => withCorrelationId(job.id ?? "unknown-job", () => processSystemJob(job.name, job.data)),
    { connection: options.connection, concurrency: options.concurrency ?? 1 },
  );
  worker.on("failed", (job, error) => {
    options.logger.error({ err: error, jobId: job?.id, jobName: job?.name }, "job failed");
  });
  worker.on("error", (error) => options.logger.error({ err: error }, "worker error"));
  return worker;
}
