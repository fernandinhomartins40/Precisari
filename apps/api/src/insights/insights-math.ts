import type { MonthMetrics } from '@precisari/shared';
import { eachDate } from '../common/dates';

export interface StayInput {
  checkIn: string;
  /** Exclusive. */
  checkOut: string;
  status: 'BOOKED' | 'BLOCKED';
}

export interface CostInput {
  cleaningFee: number;
  platformFeePct: number;
  monthlyFixedCosts: number;
}

export interface WindowTotals {
  days: number;
  nightsAvailable: number;
  nightsBooked: number;
  revenue: number;
  stays: number;
}

/**
 * Totals over a date window (RF-60/62). MVP revenue = booked nights × price(date), where price is the
 * approved price for the night, else the suggested, else the base (resolved by the caller).
 * BLOCKED nights are not available for sale; stays are counted by check-in inside the window (cleaning cost).
 */
export function windowTotals(dates: readonly string[], stays: readonly StayInput[], priceFor: (date: string) => number): WindowTotals {
  const inWindow = new Set(dates);
  const nightStatus = new Map<string, 'BOOKED' | 'BLOCKED'>();
  let staysCount = 0;
  for (const s of stays) {
    if (s.checkOut <= s.checkIn) continue;
    if (s.status === 'BOOKED' && inWindow.has(s.checkIn)) staysCount++;
    for (let d = s.checkIn; d < s.checkOut; d = nextDay(d)) {
      if (!inWindow.has(d)) continue;
      if (s.status === 'BOOKED' || !nightStatus.has(d)) nightStatus.set(d, s.status);
    }
  }
  let booked = 0;
  let blocked = 0;
  let revenue = 0;
  for (const [d, st] of nightStatus) {
    if (st === 'BOOKED') {
      booked++;
      revenue += priceFor(d);
    } else blocked++;
  }
  return { days: dates.length, nightsAvailable: dates.length - blocked, nightsBooked: booked, revenue, stays: staysCount };
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Profit = revenue − cleaning per stay − platform fee − monthly fixed costs (scaled by `fixedCostShare`). */
export function toMonthMetrics(month: string, t: WindowTotals, costs: CostInput, fixedCostShare = 1): MonthMetrics {
  const occupancy = t.nightsAvailable > 0 ? t.nightsBooked / t.nightsAvailable : 0;
  const adr = t.nightsBooked > 0 ? Math.round(t.revenue / t.nightsBooked) : 0;
  const profit =
    t.revenue - t.stays * costs.cleaningFee - Math.round(t.revenue * costs.platformFeePct) - Math.round(costs.monthlyFixedCosts * fixedCostShare);
  return {
    month,
    nightsAvailable: t.nightsAvailable,
    nightsBooked: t.nightsBooked,
    occupancy: Math.round(occupancy * 1000) / 1000,
    adr,
    revenue: t.revenue,
    estimatedProfit: profit,
  };
}

/** Scales window totals to a month of `monthDays` days (baseline = 90 days before signup, RF-61). */
export function normalizeTotals(t: WindowTotals, monthDays: number): WindowTotals {
  const f = t.days > 0 ? monthDays / t.days : 0;
  return {
    days: monthDays,
    nightsAvailable: Math.round(t.nightsAvailable * f),
    nightsBooked: Math.round(t.nightsBooked * f),
    revenue: Math.round(t.revenue * f),
    stays: Math.round(t.stays * f),
  };
}

export function monthDates(first: string, last: string): string[] {
  return eachDate(first, last);
}

/** Approval rate over decided actions (expired cards without a decision are excluded). */
export function approvalRate(approved: number, dismissed: number): number {
  const total = approved + dismissed;
  return total > 0 ? Math.round((approved / total) * 1000) / 1000 : 0;
}
