import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, eachDate, monthBounds, todayInTz, weekdayLabel } from './dates';
import { haversineKm, weatherGrid } from './geo';
import { effectivePlan } from './plans';

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(diffDays('2026-11-01', '2026-11-30')).toBe(29);
    expect(eachDate('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });
  it('computes "today" in the property timezone', () => {
    const t = new Date('2026-11-10T02:30:00Z'); // 23:30 on the 9th in São Paulo (UTC−3)
    expect(todayInTz('America/Sao_Paulo', t)).toBe('2026-11-09');
    expect(todayInTz('UTC', t)).toBe('2026-11-10');
  });
  it('handles months', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29', days: 29 });
  });
  it('labels weekdays in pt-BR', () => {
    expect(weekdayLabel('2026-11-14')).toBe('Sábado');
  });
});

describe('geo & plans', () => {
  it('haversine distance', () => {
    // Campeche → Lagoa da Conceição ≈ 11 km
    expect(haversineKm(-27.6789, -48.4867, -27.6036, -48.4719)).toBeGreaterThan(8);
    expect(haversineKm(-27.6789, -48.4867, -27.6036, -48.4719)).toBeLessThan(10);
    expect(weatherGrid(-27.6789)).toBe(-27.7);
  });
  it('paid plans only count while entitled', () => {
    expect(effectivePlan(null)).toBe('FREE');
    expect(effectivePlan({ plan: 'PRO', status: 'TRIALING' })).toBe('PRO');
    expect(effectivePlan({ plan: 'PRO', status: 'CANCELED' })).toBe('FREE');
  });
});
