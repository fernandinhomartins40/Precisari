import { Injectable, Logger } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { DEAD_LETTER_QUEUE, JobQueueService } from './job-queue.service';
import { JobsRegistry } from './jobs.registry';
import type { QueueName } from './queues';

export interface DeadLetterPayload {
  queue: string;
  jobId: string | undefined;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

/**
 * Starts one BullMQ Worker per registered queue, upserts repeatable schedules and forwards jobs that
 * exhausted their retries to the `dead-letter` queue. Used only by the worker entrypoint (src/worker.ts).
 */
@Injectable()
export class JobWorkerRunner {
  private readonly logger = new Logger(JobWorkerRunner.name);
  private readonly workers: Worker[] = [];

  constructor(
    private readonly registry: JobsRegistry,
    private readonly queues: JobQueueService,
  ) {}

  async start(opts: { concurrency?: number } = {}): Promise<void> {
    const connection = this.queues.redis();
    for (const job of this.registry.all()) {
      const worker = new Worker(
        job.queue,
        async (j: Job) => {
          await job.handler(j.data as never);
        },
        { connection, concurrency: opts.concurrency ?? 2 },
      );
      worker.on('failed', (j, err) => void this.onFailed(job.queue, j, err));
      worker.on('error', (err) => this.logger.error({ err, queue: job.queue }, 'worker error'));
      this.workers.push(worker);

      const schedulerId = `${job.queue}:schedule`;
      if (job.repeat) {
        await this.queues.queue(job.queue).upsertJobScheduler(schedulerId, job.repeat, { name: job.queue, data: {} });
        this.logger.log(`schedule ${job.queue} → ${JSON.stringify(job.repeat)}`);
      } else {
        await this.queues.queue(job.queue).removeJobScheduler(schedulerId).catch(() => undefined);
      }
    }
    this.logger.log(`worker started for ${this.workers.length} queues: ${this.registry.all().map((j) => j.queue).join(', ')}`);
  }

  private async onFailed(queue: QueueName, job: Job | undefined, err: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    this.logger.warn({ queue, jobId: job.id, attempt: job.attemptsMade, err: err.message }, 'job failed');
    if (job.attemptsMade < attempts) return;
    const payload: DeadLetterPayload = {
      queue,
      jobId: job.id,
      data: job.data,
      failedReason: err.message,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    };
    await this.queues
      .queue(DEAD_LETTER_QUEUE)
      .add(queue, payload, { removeOnComplete: false, removeOnFail: false })
      .catch((e: Error) => this.logger.error({ err: e }, 'dead-letter enqueue failed'));
  }

  async stop(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers.length = 0;
  }
}
