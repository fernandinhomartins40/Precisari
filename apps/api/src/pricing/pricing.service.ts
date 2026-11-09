import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NightPrice, Prisma, Property } from '@prisma/client';
import { ENGINE_VERSION, computeRecommendations, type NightRecommendation } from '@precisari/pricing-engine';
import { sha256 } from '../common/crypto';
import { addDays, dateToIso, isoToDate, todayInTz } from '../common/dates';
import { PlanService } from '../common/plan.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationsService, type SyncActionsResult } from '../recommendations/recommendations.service';
import { PricingContextBuilder } from './pricing-context.builder';

/** NightPrices older than this are recomputed lazily on read. */
export const STALE_AFTER_MS = 24 * 3600_000;

export interface RecomputeResult {
  propertyId: string;
  nights: number;
  changedNights: number;
  actions: SyncActionsResult;
  today: string;
}

/** Cache key for LLM explanations: changes only when the price, minimum stay or factors change. */
export function factorsHash(rec: Pick<NightRecommendation, 'suggestedPrice' | 'minStay' | 'factors' | 'status' | 'discountPct'>): string {
  return sha256(
    JSON.stringify({ p: rec.suggestedPrice, m: rec.minStay, s: rec.status, d: rec.discountPct ?? null, f: rec.factors.map((f) => [f.key, f.multiplier, f.label]) }),
  );
}

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: PricingContextBuilder,
    private readonly plans: PlanService,
    private readonly recommendations: RecommendationsService,
    private readonly jobs: JobQueueService,
    private readonly registry: JobsRegistry,
  ) {}

  onModuleInit(): void {
    // RF-31: daily recompute (03:00 São Paulo) + on demand (calendar change, settings change, data refresh).
    this.registry.register(
      QUEUES.pricingRecompute,
      async (d) => {
        if (d.propertyId) await this.recompute(d.propertyId);
        else await this.recomputeAll();
      },
      { pattern: '0 3 * * *', tz: 'America/Sao_Paulo' },
    );
  }

  async recomputeAll(): Promise<void> {
    const props = await this.prisma.property.findMany({ where: { deletedAt: null, user: { deletedAt: null } }, select: { id: true } });
    for (const p of props) {
      await this.recompute(p.id).catch((err: unknown) => this.logger.error({ err, propertyId: p.id }, 'recompute failed'));
    }
    this.logger.log(`recomputed ${props.length} properties`);
  }

  /** Runs the engine for the plan horizon, upserts NightPrice rows and regenerates actions. */
  async recompute(propertyId: string, now: Date = new Date()): Promise<RecomputeResult | null> {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, deletedAt: null } });
    if (!property) return null;
    const { horizonDays } = await this.plans.limitsFor(property.userId);
    const { ctx, today, end } = await this.builder.build(property, horizonDays, now);
    const started = Date.now();
    const recs = computeRecommendations(ctx);
    const engineMs = Date.now() - started;

    const changedNights = await this.upsertNights(property, recs, today, end);
    const actions = await this.recommendations.syncActions(property, recs, today);
    if (actions.created + actions.updated > 0 || changedNights > 0) {
      await this.jobs.enqueue(QUEUES.explanationsGenerate, { propertyId }, { jobId: `explain:${propertyId}` });
    }
    this.logger.debug({ propertyId, nights: recs.length, changedNights, engineMs, actions }, 'recomputed');
    return { propertyId, nights: recs.length, changedNights, actions, today };
  }

  private async upsertNights(property: Property, recs: NightRecommendation[], today: string, end: string): Promise<number> {
    const existing = await this.prisma.nightPrice.findMany({
      where: { propertyId: property.id, date: { gte: isoToDate(today), lte: isoToDate(end) } },
      select: { id: true, date: true, factorsHash: true },
    });
    const byDate = new Map(existing.map((n) => [dateToIso(n.date), n]));
    const now = new Date();
    const creates: Prisma.NightPriceCreateManyInput[] = [];
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const unchangedIds: string[] = [];
    for (const rec of recs) {
      const hash = factorsHash(rec);
      const data = {
        status: rec.status,
        suggestedPrice: rec.suggestedPrice,
        minStay: rec.minStay,
        discountPct: rec.discountPct ?? null,
        factors: rec.factors as unknown as Prisma.InputJsonArray,
        heat: rec.heat,
        isOrphan: rec.isOrphan,
        factorsHash: hash,
        computedAt: now,
        engineVersion: ENGINE_VERSION,
      };
      const prev = byDate.get(rec.date);
      if (!prev) {
        creates.push({ ...data, propertyId: property.id, date: isoToDate(rec.date) });
      } else if (prev.factorsHash !== hash) {
        // Explanation no longer matches the price/factors: clear it so the LLM job regenerates it.
        ops.push(this.prisma.nightPrice.update({ where: { id: prev.id }, data: { ...data, headline: null, explanation: null } }));
      } else {
        unchangedIds.push(prev.id);
      }
    }
    if (creates.length) ops.push(this.prisma.nightPrice.createMany({ data: creates, skipDuplicates: true }));
    if (unchangedIds.length) {
      ops.push(this.prisma.nightPrice.updateMany({ where: { id: { in: unchangedIds } }, data: { computedAt: now, engineVersion: ENGINE_VERSION } }));
    }
    await this.prisma.$transaction(ops);
    return recs.length - unchangedIds.length;
  }

  /**
   * Lazy freshness check for reads (onboarding "wow" heat map works before any job ran):
   * recompute when today's night is missing, the horizon is not covered or rows are stale (> 24 h).
   */
  async ensureFresh(property: Property): Promise<void> {
    const today = todayInTz(property.timezone);
    const { horizonDays } = await this.plans.limitsFor(property.userId);
    const end = addDays(today, horizonDays - 1);
    const agg = await this.prisma.nightPrice.aggregate({
      where: { propertyId: property.id, date: { gte: isoToDate(today), lte: isoToDate(end) } },
      _count: { _all: true },
      _min: { computedAt: true },
    });
    const oldest: NightPrice['computedAt'] | null = agg._min.computedAt;
    const stale = !oldest || Date.now() - oldest.getTime() > STALE_AFTER_MS;
    if (agg._count._all < horizonDays || stale) await this.recompute(property.id);
  }
}
