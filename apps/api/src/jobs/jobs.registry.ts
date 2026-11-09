import { Injectable } from '@nestjs/common';
import type { JobPayloads, QueueName } from './queues';

export type JobHandler<Q extends QueueName> = (data: JobPayloads[Q]) => Promise<void>;

export interface RegisteredJob {
  queue: QueueName;
  handler: JobHandler<QueueName>;
  /** Repeatable schedule (cron pattern or every-ms). */
  repeat?: { pattern: string } | { every: number };
}

/**
 * Modules register handlers in onModuleInit:
 *   this.registry.register(QUEUES.weatherRefresh, (d) => this.refresh(d), { pattern: '0 *\/6 * * *' })
 * The worker entrypoint starts a BullMQ Worker per registered queue; the API only enqueues.
 */
@Injectable()
export class JobsRegistry {
  private readonly jobs = new Map<QueueName, RegisteredJob>();

  register<Q extends QueueName>(queue: Q, handler: JobHandler<Q>, repeat?: RegisteredJob['repeat']): void {
    this.jobs.set(queue, { queue, handler: handler as JobHandler<QueueName>, repeat });
  }

  get(queue: QueueName): RegisteredJob | undefined {
    return this.jobs.get(queue);
  }

  all(): RegisteredJob[] {
    return [...this.jobs.values()];
  }
}
