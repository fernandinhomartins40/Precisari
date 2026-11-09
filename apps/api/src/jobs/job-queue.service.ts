import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { JobsRegistry } from './jobs.registry';
import type { JobPayloads, QueueName } from './queues';

/** Queue receiving permanently failed jobs (docs/prd.md §10: retry with exponential backoff + DLQ). */
export const DEAD_LETTER_QUEUE = 'dead-letter';

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export interface EnqueueOptions {
  /** Dedup key: BullMQ ignores a job whose id is already waiting/active. */
  jobId?: string;
  delayMs?: number;
}

/**
 * Enqueue port backed by BullMQ (Redis). With JOBS_ENABLED=false handlers run INLINE through the
 * JobsRegistry (dev/tests without Redis); inline errors are logged, never thrown to the caller.
 */
@Injectable()
export class JobQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly queues = new Map<string, Queue>();
  private connection: Redis | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly registry: JobsRegistry,
  ) {}

  get enabled(): boolean {
    return this.env.JOBS_ENABLED;
  }

  async enqueue<Q extends QueueName>(queue: Q, data: JobPayloads[Q], opts: EnqueueOptions = {}): Promise<void> {
    if (!this.enabled) {
      await this.runInline(queue, data);
      return;
    }
    // BullMQ forbids ':' in custom job ids.
    const jobId = opts.jobId?.replace(/:/g, '_');
    await this.queue(queue).add(queue, data, { ...DEFAULT_JOB_OPTIONS, jobId, delay: opts.delayMs });
  }

  /** Shared ioredis connection (BullMQ requires maxRetriesPerRequest: null). */
  redis(): Redis {
    if (!this.connection) {
      this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
      this.connection.on('error', (err) => this.logger.warn(`redis: ${err.message}`));
    }
    return this.connection;
  }

  queue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis(), defaultJobOptions: DEFAULT_JOB_OPTIONS });
      this.queues.set(name, q);
    }
    return q;
  }

  private async runInline<Q extends QueueName>(queue: Q, data: JobPayloads[Q]): Promise<void> {
    const job = this.registry.get(queue);
    if (!job) {
      this.logger.debug(`inline: no handler registered for ${queue}; skipped`);
      return;
    }
    try {
      await job.handler(data);
    } catch (err) {
      this.logger.error({ err, queue }, `inline job ${queue} failed`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
    if (this.connection) {
      await this.connection.quit().catch(() => undefined);
      this.connection = null;
    }
  }
}
