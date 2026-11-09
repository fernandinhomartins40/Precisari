import { Injectable } from '@nestjs/common';
import type { Prisma, Property } from '@prisma/client';
import type { NightRecommendation } from '@precisari/pricing-engine';
import { dateToIso, isoToDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { generateActionPlans, type ActionPlan } from './action-generator';
import { PriceStateService } from './price-state.service';

export interface SyncActionsResult {
  created: number;
  updated: number;
  removed: number;
  expired: number;
}

const planKey = (date: string, type: string): string => `${date}|${type}`;

/**
 * Turns engine output into Action rows (RF-40), keeping exactly one PENDING action per (property, date, type):
 * changed plans update the existing card, obsolete PENDING cards are removed, past-date PENDING cards expire
 * (DISMISSED without decidedAt, so they don't count as host decisions), and a plan the host already dismissed
 * with the same target value is not re-proposed.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceState: PriceStateService,
  ) {}

  async syncActions(property: Property, recs: readonly NightRecommendation[], today: string): Promise<SyncActionsResult> {
    const result: SyncActionsResult = { created: 0, updated: 0, removed: 0, expired: 0 };
    const todayDate = isoToDate(today);
    const expired = await this.prisma.action.updateMany({
      where: { propertyId: property.id, status: 'PENDING', date: { lt: todayDate } },
      data: { status: 'DISMISSED' },
    });
    result.expired = expired.count;
    if (recs.length === 0) return result;

    const end = recs[recs.length - 1]?.date ?? today;
    const state = await this.priceState.load(property, today, end);
    const plans = generateActionPlans({
      recommendations: recs,
      currentPrice: state.price,
      knownMinStay: state.minStay,
      minPrice: property.minPrice,
      maxPrice: property.maxPrice,
    });

    const [pending, dismissed] = await Promise.all([
      this.prisma.action.findMany({ where: { propertyId: property.id, status: 'PENDING', date: { gte: todayDate } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.action.findMany({
        where: { propertyId: property.id, status: 'DISMISSED', decidedAt: { not: null }, date: { gte: todayDate } },
        select: { date: true, type: true, toValue: true },
      }),
    ]);
    const dismissedKeys = new Set(dismissed.map((d) => `${planKey(dateToIso(d.date), d.type)}|${d.toValue}`));
    const byKey = new Map<string, (typeof pending)[number]>();
    const toDelete: string[] = [];
    for (const a of pending) {
      const k = planKey(dateToIso(a.date), a.type);
      if (byKey.has(k)) toDelete.push(a.id);
      else byKey.set(k, a);
    }

    const creates: Prisma.ActionCreateManyInput[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const kept = new Set<string>();
    for (const plan of plans) {
      const k = planKey(plan.date, plan.type);
      if (dismissedKeys.has(`${k}|${plan.toValue}`)) continue;
      const existing = byKey.get(k);
      if (existing) {
        kept.add(existing.id);
        if (differs(existing, plan)) {
          updates.push(
            this.prisma.action.update({
              where: { id: existing.id },
              data: {
                fromValue: plan.fromValue,
                toValue: plan.toValue,
                estimatedGain: plan.estimatedGain,
                factors: plan.factors as unknown as Prisma.InputJsonArray,
                headline: null,
                explanation: null,
              },
            }),
          );
        }
        continue;
      }
      creates.push({
        propertyId: property.id,
        date: isoToDate(plan.date),
        type: plan.type,
        fromValue: plan.fromValue,
        toValue: plan.toValue,
        estimatedGain: plan.estimatedGain,
        factors: plan.factors as unknown as Prisma.InputJsonArray,
      });
    }
    for (const a of byKey.values()) if (!kept.has(a.id)) toDelete.push(a.id);

    await this.prisma.$transaction([
      ...updates,
      ...(creates.length ? [this.prisma.action.createMany({ data: creates })] : []),
      ...(toDelete.length ? [this.prisma.action.deleteMany({ where: { id: { in: toDelete } } })] : []),
    ]);
    result.created = creates.length;
    result.updated = updates.length;
    result.removed = toDelete.length;
    return result;
  }
}

function differs(a: { fromValue: number; toValue: number; estimatedGain: number }, p: ActionPlan): boolean {
  return a.fromValue !== p.fromValue || a.toValue !== p.toValue || a.estimatedGain !== p.estimatedGain;
}
