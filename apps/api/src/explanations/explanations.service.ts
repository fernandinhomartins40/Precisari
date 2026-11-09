import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { DestinationType } from '@precisari/shared';
import { PrismaService } from '../prisma/prisma.service';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { LLM_PROVIDER, type ExplanationInput, type ExplanationOutput, type LlmProvider } from '../integrations/ports';
import { templateExplanation } from '../integrations/llm/templates';
import { toIsoDate, weekdayLabel } from '../integrations/common/text';

const StoredFactors = z.array(z.object({ key: z.string(), multiplier: z.number(), label: z.string() })).catch([]);
const NightStatus = z.enum(['free', 'booked', 'blocked']).catch('free');

export const EXPLANATION_BATCH_SIZE = 5;
export const EXPLANATION_MAX_PER_RUN = 60;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** ExplanationCache.cacheKey = sha256(propertyId|date|factorsHash). */
export function explanationCacheKey(propertyId: string, date: string, factorsHash: string): string {
  return sha256(`${propertyId}|${date}|${factorsHash}`);
}

/** Fallback hash when the engine did not persist NightPrice.factorsHash. */
export function computeFactorsHash(factors: unknown, price: number, minStay: number): string {
  return sha256(JSON.stringify({ factors, price, minStay }));
}

/**
 * RF-32: short pt-BR explanations by LLM (never prices), cached by (property, date, factorsHash).
 * Runs as `explanations.generate` after a recompute and can be called synchronously.
 */
@Injectable()
export class ExplanationsService implements OnModuleInit {
  private readonly log = new Logger('ExplanationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobsRegistry,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(QUEUES.explanationsGenerate, (d) => this.generateForProperty(d.propertyId).then(() => undefined));
  }

  /** Cached explanation for one night; calls the LLM only on cache miss. Never throws. */
  async explain(propertyId: string, factorsHash: string, input: ExplanationInput): Promise<ExplanationOutput & { cached: boolean }> {
    const cacheKey = explanationCacheKey(propertyId, input.date, factorsHash);
    const hit = await this.prisma.explanationCache.findUnique({ where: { cacheKey } });
    if (hit) return { headline: hit.headline, text: hit.text, cached: true };
    let out: ExplanationOutput;
    let model = this.llm.model;
    try {
      out = await this.llm.explain(input);
    } catch (err) {
      this.log.warn(`LLM explain failed, using template: ${(err as Error).message}`);
      out = templateExplanation(input);
      model = 'template';
    }
    await this.prisma.explanationCache.upsert({
      where: { cacheKey },
      create: { cacheKey, headline: out.headline, text: out.text, model },
      update: {},
    });
    return { ...out, cached: false };
  }

  /** Explain PENDING actions (and their nights) lacking an explanation for the current factors. */
  async generateForProperty(propertyId: string): Promise<{ generated: number; fromCache: number; skipped: number }> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { id: true, name: true, destinationType: true },
    });
    if (!property) return { generated: 0, fromCache: 0, skipped: 0 };

    const actions = await this.prisma.action.findMany({
      where: { propertyId, status: 'PENDING' },
      orderBy: [{ estimatedGain: 'desc' }, { date: 'asc' }],
      take: EXPLANATION_MAX_PER_RUN,
    });
    if (actions.length === 0) return { generated: 0, fromCache: 0, skipped: 0 };
    const nights = await this.prisma.nightPrice.findMany({
      where: { propertyId, date: { in: actions.map((a) => a.date) } },
    });
    const nightByDate = new Map(nights.map((n) => [toIsoDate(n.date), n]));

    let generated = 0;
    let fromCache = 0;
    let skipped = 0;
    for (let i = 0; i < actions.length; i += EXPLANATION_BATCH_SIZE) {
      const batch = actions.slice(i, i + EXPLANATION_BATCH_SIZE);
      await Promise.all(
        batch.map(async (action) => {
          const date = toIsoDate(action.date);
          const night = nightByDate.get(date);
          const factors = StoredFactors.parse(night?.factors ?? action.factors);
          const price = night?.suggestedPrice ?? action.toValue;
          const minStay = night?.minStay ?? (action.type === 'MIN_STAY' ? action.toValue : 1);
          const factorsHash = night?.factorsHash ?? computeFactorsHash(factors, price, minStay);
          const cacheKey = explanationCacheKey(propertyId, date, factorsHash);
          const cached = await this.prisma.explanationCache.findUnique({ where: { cacheKey } });
          const upToDate =
            cached && action.headline === cached.headline && action.explanation === cached.text &&
            (!night || (night.headline === cached.headline && night.explanation === cached.text));
          if (upToDate) {
            skipped++;
            return;
          }
          const isPrice = action.type !== 'MIN_STAY';
          const out = cached
            ? { headline: cached.headline, text: cached.text, cached: true }
            : await this.explain(propertyId, factorsHash, {
                date,
                weekdayLabel: weekdayLabel(date),
                status: NightStatus.parse(night?.status),
                fromPrice: isPrice ? action.fromValue : price,
                toPrice: isPrice ? action.toValue : price,
                minStay,
                destinationType: property.destinationType as DestinationType,
                propertyName: property.name,
                factors,
              });
          if (out.cached) fromCache++;
          else generated++;
          await this.prisma.action.update({ where: { id: action.id }, data: { headline: out.headline, explanation: out.text } });
          if (night) {
            await this.prisma.nightPrice.update({
              where: { id: night.id },
              data: { headline: out.headline, explanation: out.text, ...(night.factorsHash ? {} : { factorsHash }) },
            });
          }
        }),
      );
    }
    return { generated, fromCache, skipped };
  }
}
