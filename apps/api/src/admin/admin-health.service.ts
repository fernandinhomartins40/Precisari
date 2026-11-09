import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import type { AdminHealthDto } from '@precisari/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { QUEUES } from '../jobs/queues';
import {
  BILLING_PROVIDER, CHANNEX_PROVIDER, EMAIL_SENDER, GEO_PROVIDER, HOLIDAYS_PROVIDER, LLM_PROVIDER, PUSH_PROVIDER, WEATHER_PROVIDER,
  type IntegrationAdapter,
} from '../integrations/ports';
import { withTimeout } from '../integrations/common/http';

type IntegrationHealth = AdminHealthDto['integrations'][number];
type JobHealth = AdminHealthDto['jobs'][number];

const HEALTH_TIMEOUT_MS = 3_000;
const REDIS_TIMEOUT_MS = 1_500;
const CACHE_TTL_MS = 60_000;

export function redisConnectionOptions(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname || 'localhost',
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    db: Number(u.pathname.replace('/', '') || 0),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_TIMEOUT_MS,
    retryStrategy: () => null,
  };
}

/** RF-82: integrations + jobs health. Degrades gracefully when Redis is unreachable. */
@Injectable()
export class AdminHealthService {
  private readonly log = new Logger('AdminHealthService');
  private integrationsCache: { at: number; value: IntegrationHealth[] } | null = null;
  private readonly adapters: [string, IntegrationAdapter][];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_SENDER) email: IntegrationAdapter,
    @Inject(HOLIDAYS_PROVIDER) holidays: IntegrationAdapter,
    @Inject(WEATHER_PROVIDER) weather: IntegrationAdapter,
    @Inject(GEO_PROVIDER) geo: IntegrationAdapter,
    @Inject(LLM_PROVIDER) llm: IntegrationAdapter,
    @Inject(PUSH_PROVIDER) push: IntegrationAdapter,
    @Inject(BILLING_PROVIDER) billing: IntegrationAdapter,
    @Inject(CHANNEX_PROVIDER) channex: IntegrationAdapter,
  ) {
    this.adapters = [
      ['email', email], ['holidays', holidays], ['weather', weather], ['geo', geo],
      ['llm', llm], ['push', push], ['billing', billing], ['channex', channex],
    ];
  }

  async health(): Promise<AdminHealthDto> {
    const [jobs, integrations, brokenCalendars] = await Promise.all([
      this.jobs(),
      this.integrations(),
      this.prisma.calendarSource.count({ where: { status: 'ERROR', property: { deletedAt: null } } }),
    ]);
    return { jobs: jobs.jobs, integrations: [...integrations, jobs.redis], brokenCalendars };
  }

  async integrations(): Promise<IntegrationHealth[]> {
    if (this.integrationsCache && Date.now() - this.integrationsCache.at < CACHE_TTL_MS) return this.integrationsCache.value;
    const value = await Promise.all(
      this.adapters.map(async ([name, a]): Promise<IntegrationHealth> => {
        const provider = a.provider ?? 'unknown';
        if (!a.healthCheck) return { name, provider, ok: true, detail: null };
        try {
          const r = await withTimeout(a.healthCheck(), HEALTH_TIMEOUT_MS, 'timeout');
          return { name, provider, ok: r.ok, detail: r.detail };
        } catch (err) {
          return { name, provider, ok: false, detail: (err as Error).message };
        }
      }),
    );
    this.integrationsCache = { at: Date.now(), value };
    return value;
  }

  async jobs(): Promise<{ jobs: JobHealth[]; redis: IntegrationHealth }> {
    const conn = redisConnectionOptions(this.env.REDIS_URL);
    const ping = new IORedis({ ...(conn as object), lazyConnect: true, enableOfflineQueue: false });
    ping.on('error', () => undefined);
    try {
      await withTimeout(ping.connect().then(() => ping.ping()), REDIS_TIMEOUT_MS, 'redis timeout');
    } catch (err) {
      ping.disconnect();
      return { jobs: [], redis: { name: 'redis', provider: 'bullmq', ok: false, detail: (err as Error).message } };
    }
    ping.disconnect();

    const queues = Object.values(QUEUES).map((name) => {
      const q = new Queue(name, { connection: conn });
      q.on('error', () => undefined);
      return q;
    });
    try {
      const jobs = await withTimeout(
        Promise.all(
          queues.map(async (q): Promise<JobHealth> => {
            const counts = await q.getJobCounts('waiting', 'delayed', 'active', 'failed', 'completed');
            const [last] = await q.getCompleted(0, 0);
            return {
              name: q.name,
              waiting: (counts.waiting ?? 0) + (counts.delayed ?? 0),
              active: counts.active ?? 0,
              failed: counts.failed ?? 0,
              completed: counts.completed ?? 0,
              lastFinishedAt: last?.finishedOn ? new Date(last.finishedOn).toISOString() : null,
            };
          }),
        ),
        REDIS_TIMEOUT_MS * 2,
        'bullmq timeout',
      );
      return { jobs, redis: { name: 'redis', provider: 'bullmq', ok: true, detail: null } };
    } catch (err) {
      this.log.warn(`job counts failed: ${(err as Error).message}`);
      return { jobs: [], redis: { name: 'redis', provider: 'bullmq', ok: false, detail: (err as Error).message } };
    } finally {
      await Promise.allSettled(queues.map((q) => withTimeout(q.close(), REDIS_TIMEOUT_MS)));
    }
  }
}
