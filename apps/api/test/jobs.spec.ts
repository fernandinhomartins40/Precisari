import IORedis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { DEAD_LETTER_QUEUE, JobQueueService } from '../src/jobs/job-queue.service';
import { JobWorkerRunner } from '../src/jobs/job-worker.runner';
import { JobsRegistry } from '../src/jobs/jobs.registry';

async function redisAvailable(url: string): Promise<boolean> {
  const r = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  try {
    await r.connect();
    await r.ping();
    return true;
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

describe('JobQueueService', () => {
  it('runs handlers inline when JOBS_ENABLED=false and swallows handler errors', async () => {
    const registry = new JobsRegistry();
    const seen: unknown[] = [];
    registry.register('pricing.recompute', async (d) => {
      seen.push(d);
    });
    registry.register('ical.sync', async () => {
      throw new Error('boom');
    });
    const q = new JobQueueService({ ...loadEnv(), JOBS_ENABLED: false }, registry);
    await q.enqueue('pricing.recompute', { propertyId: 'p1' });
    await expect(q.enqueue('ical.sync', {})).resolves.toBeUndefined();
    await expect(q.enqueue('insights.monthly', {})).resolves.toBeUndefined(); // no handler
    expect(seen).toEqual([{ propertyId: 'p1' }]);
  });

  describe('BullMQ mode (requires Redis)', async () => {
    const env = { ...loadEnv(), JOBS_ENABLED: true };
    const available = await redisAvailable(env.REDIS_URL);
    const registry = new JobsRegistry();
    const queues = new JobQueueService(env, registry);
    const runner = new JobWorkerRunner(registry, queues);
    const processed: unknown[] = [];

    beforeAll(async () => {
      if (!available) return;
      registry.register('insights.monthly', async (d) => {
        processed.push(d);
      });
      registry.register('channex.push', async () => {
        throw new Error('always fails');
      });
      await queues.queue('insights.monthly').obliterate({ force: true });
      await queues.queue('channex.push').obliterate({ force: true });
      await queues.queue(DEAD_LETTER_QUEUE).obliterate({ force: true });
      await runner.start({ concurrency: 1 });
    });
    afterAll(async () => {
      if (!available) return;
      await runner.stop();
      await queues.onModuleDestroy();
    });

    it.skipIf(!available)('processes enqueued jobs and moves exhausted ones to the dead-letter queue', async () => {
      await queues.enqueue('insights.monthly', { month: '2026-11' });
      await queues.queue('channex.push').add('channex.push', { actionId: 'a1' }, { attempts: 2, backoff: { type: 'fixed', delay: 10 } });
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const dead = await queues.queue(DEAD_LETTER_QUEUE).getJobCounts('waiting');
        if (processed.length > 0 && (dead.waiting ?? 0) > 0) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(processed).toEqual([{ month: '2026-11' }]);
      const [dead] = await queues.queue(DEAD_LETTER_QUEUE).getJobs(['waiting']);
      expect(dead?.data).toMatchObject({ queue: 'channex.push', data: { actionId: 'a1' }, failedReason: 'always fails', attemptsMade: 2 });
    });
  });
});
