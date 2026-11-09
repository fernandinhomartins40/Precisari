import { Injectable } from '@nestjs/common';
import type { JobPayloads, QueueName } from './queues';

/**
 * Enqueue port. FOUNDATION VERSION: no-op placeholder; the core workstream implements BullMQ
 * (retries with exponential backoff, dead-letter, dedup by jobId) and an inline mode when JOBS_ENABLED=false.
 */
@Injectable()
export class JobQueueService {
  async enqueue<Q extends QueueName>(_queue: Q, _data: JobPayloads[Q], _opts?: { jobId?: string; delayMs?: number }): Promise<void> {}
}
