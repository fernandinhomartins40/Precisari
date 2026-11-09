import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { InsightsDto, MonthMetrics } from '@precisari/shared';
import { addDays, addMonths, dateToIso, isoToDate, monthBounds, monthOf, todayInTz } from '../common/dates';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { PRICE_FAMILY } from '../recommendations/action-generator';
import { approvalRate, monthDates, normalizeTotals, toMonthMetrics, windowTotals, type StayInput } from './insights-math';

const HISTORY_MONTHS = 6;
const BASELINE_DAYS = 90;

@Injectable()
export class InsightsService implements OnModuleInit {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly registry: JobsRegistry,
  ) {}

  onModuleInit(): void {
    // Insights are computed on read (cheap); the monthly job is a hook for future consolidation/snapshots.
    this.registry.register(
      QUEUES.insightsMonthly,
      async (d) => {
        this.logger.log(`insights.monthly ${d.month ?? 'previous month'}: computed on read, nothing to consolidate`);
      },
      { pattern: '0 4 1 * *', tz: 'America/Sao_Paulo' },
    );
  }

  async get(userId: string, propertyId: string, month?: string): Promise<InsightsDto> {
    const p = await this.properties.getOwned(userId, propertyId);
    const today = todayInTz(p.timezone);
    const target = month ?? monthOf(today);
    const historyStart = monthBounds(addMonths(target, -(HISTORY_MONTHS - 1))).first;
    const targetEnd = monthBounds(target).last;
    const createdDate = todayInTz(p.timezone, p.createdAt);
    const baselineFrom = addDays(createdDate, -BASELINE_DAYS);
    const baselineTo = addDays(createdDate, -1);
    const loadFrom = baselineFrom < historyStart ? baselineFrom : historyStart;

    const [bookings, approved, monthActions] = await Promise.all([
      this.prisma.booking.findMany({
        where: { propertyId, status: { in: ['BOOKED', 'BLOCKED'] }, checkOut: { gt: isoToDate(loadFrom) }, checkIn: { lte: isoToDate(targetEnd) } },
        select: { checkIn: true, checkOut: true, status: true },
      }),
      this.prisma.action.findMany({
        where: { propertyId, status: { in: ['APPROVED', 'APPLIED'] }, type: { in: [...PRICE_FAMILY] }, date: { gte: isoToDate(historyStart), lte: isoToDate(targetEnd) } },
        orderBy: { decidedAt: 'desc' },
        select: { date: true, toValue: true },
      }),
      this.prisma.action.findMany({
        where: { propertyId, date: { gte: isoToDate(`${target}-01`), lte: isoToDate(targetEnd) } },
        select: { status: true, estimatedGain: true, decidedAt: true },
      }),
    ]);

    const approvedPrice = new Map<string, number>();
    for (const a of approved) {
      const d = dateToIso(a.date);
      if (!approvedPrice.has(d)) approvedPrice.set(d, a.toValue);
    }
    // RF-42/RF-62: a night earns the last approved price, else the base. Never the suggestion: the host did not charge it.
    const priceFor = (d: string): number => approvedPrice.get(d) ?? p.basePrice;
    const stays: StayInput[] = bookings.map((b) => ({
      checkIn: dateToIso(b.checkIn),
      checkOut: dateToIso(b.checkOut),
      status: b.status === 'BLOCKED' ? 'BLOCKED' : 'BOOKED',
    }));
    const costs = { cleaningFee: p.cleaningFee, platformFeePct: p.platformFeePct, monthlyFixedCosts: p.monthlyFixedCosts ?? 0 };

    const metricsFor = (m: string): MonthMetrics => {
      const { first, last } = monthBounds(m);
      return toMonthMetrics(m, windowTotals(monthDates(first, last), stays, priceFor), costs);
    };

    const history = Array.from({ length: HISTORY_MONTHS }, (_, i) => metricsFor(addMonths(target, i - (HISTORY_MONTHS - 1))));
    const current = history[history.length - 1] ?? metricsFor(target);
    const prevMonth = addMonths(target, -1);
    const previousRaw = history[history.length - 2] ?? metricsFor(prevMonth);
    const previous = monthBounds(prevMonth).last < createdDate && previousRaw.nightsBooked === 0 ? null : previousRaw;

    // Baseline: 90 days before signup at base price (no recommendations then), normalized to the target month length.
    const baselineTotals = windowTotals(monthDates(baselineFrom, baselineTo), stays, () => p.basePrice);
    const baseline =
      baselineTotals.nightsBooked > 0
        ? toMonthMetrics(monthOf(baselineTo), normalizeTotals(baselineTotals, monthBounds(target).days), costs)
        : null;

    const ifApprovedAllGain = monthActions
      .filter((a) => a.status === 'PENDING' || a.status === 'DISMISSED')
      .reduce((s, a) => s + a.estimatedGain, 0);
    const approvedCount = monthActions.filter((a) => a.status === 'APPROVED' || a.status === 'APPLIED').length;
    const dismissedCount = monthActions.filter((a) => a.status === 'DISMISSED' && a.decidedAt !== null).length;

    return {
      propertyId,
      current,
      previous,
      baseline,
      ifApprovedAllGain,
      approvalRate: approvalRate(approvedCount, dismissedCount),
      history,
    };
  }
}
