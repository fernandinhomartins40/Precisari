import { describe, expect, it } from 'vitest';
import { approvalRate, monthDates, normalizeTotals, toMonthMetrics, windowTotals, type StayInput } from './insights-math';

const november = monthDates('2026-11-01', '2026-11-30');
const costs = { cleaningFee: 9000, platformFeePct: 0.03, monthlyFixedCosts: 30000 };

describe('insights math', () => {
  const stays: StayInput[] = [
    { checkIn: '2026-10-30', checkOut: '2026-11-02', status: 'BOOKED' }, // 1 Nov night only (Oct 30/31 outside); check-in outside ⇒ no cleaning
    { checkIn: '2026-11-13', checkOut: '2026-11-16', status: 'BOOKED' }, // 3 nights
    { checkIn: '2026-11-20', checkOut: '2026-11-22', status: 'BLOCKED' }, // 2 blocked nights
    { checkIn: '2026-11-29', checkOut: '2026-12-02', status: 'BOOKED' }, // 2 Nov nights (29, 30)
  ];
  const price = (d: string): number => (d === '2026-11-14' ? 30000 : 25000);

  it('counts booked/blocked nights, revenue and stays inside the window', () => {
    const t = windowTotals(november, stays, price);
    expect(t).toEqual({ days: 30, nightsAvailable: 28, nightsBooked: 6, revenue: 5 * 25000 + 30000, stays: 2 });
  });

  it('computes occupancy, ADR and estimated profit', () => {
    const m = toMonthMetrics('2026-11', windowTotals(november, stays, price), costs);
    const revenue = 155000;
    expect(m).toEqual({
      month: '2026-11',
      nightsAvailable: 28,
      nightsBooked: 6,
      occupancy: Math.round((6 / 28) * 1000) / 1000,
      adr: Math.round(revenue / 6),
      revenue,
      estimatedProfit: revenue - 2 * 9000 - Math.round(revenue * 0.03) - 30000,
    });
  });

  it('booked wins over blocked on overlapping nights and empty months are zero', () => {
    const t = windowTotals(november, [
      { checkIn: '2026-11-05', checkOut: '2026-11-07', status: 'BLOCKED' },
      { checkIn: '2026-11-06', checkOut: '2026-11-07', status: 'BOOKED' },
    ], () => 10000);
    expect(t.nightsBooked).toBe(1);
    expect(t.nightsAvailable).toBe(29);
    const empty = toMonthMetrics('2026-11', windowTotals(november, [], () => 1), { ...costs, monthlyFixedCosts: 0 });
    expect(empty).toMatchObject({ occupancy: 0, adr: 0, revenue: 0, estimatedProfit: 0 });
  });

  it('normalizes a 90-day baseline to a month', () => {
    const t = normalizeTotals({ days: 90, nightsAvailable: 90, nightsBooked: 45, revenue: 900000, stays: 15 }, 30);
    expect(t).toEqual({ days: 30, nightsAvailable: 30, nightsBooked: 15, revenue: 300000, stays: 5 });
  });

  it('approval rate', () => {
    expect(approvalRate(3, 1)).toBe(0.75);
    expect(approvalRate(0, 0)).toBe(0);
  });
});
