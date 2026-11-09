import { Injectable } from '@nestjs/common';
import type { JobPayloads, QueueName } from './queues';

export type JobHandler<Q extends QueueName> = (data: JobPayloads[Q]) => Promise<void>;

/** Repeatable schedule: cron pattern (optionally in an IANA timezone) or a fixed interval in ms. */
export type JobRepeat = { pattern: string; tz?: string } | { every: number };

export interface RegisteredJob {
  queue: QueueName;
  handler: JobHandler<QueueName>;
  repeat?: JobRepeat;
}

/**
 * Modules register handlers in onModuleInit:
 *   this.registry.register(QUEUES.weatherRefresh, (d) => this.refresh(d), { pattern: '0 *\/6 * * *' })
 * The worker entrypoint starts a BullMQ Worker per registered queue and upserts the repeatable schedules;
 * the API only enqueues (or runs handlers inline when JOBS_ENABLED=false).
 */
@Injectable()
export class JobsRegistry {
  private readonly jobs = new Map<QueueName, RegisteredJob>();

  register<Q extends QueueName>(queue: Q, handler: JobHandler<Q>, repeat?: JobRepeat): void {
    this.jobs.set(queue, { queue, handler: handler as JobHandler<QueueName>, repeat });
  }

  get(queue: QueueName): RegisteredJob | undefined {
    return this.jobs.get(queue);
  }

  all(): RegisteredJob[] {
    return [...this.jobs.values()];
  }
}
