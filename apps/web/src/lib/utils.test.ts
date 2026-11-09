import { describe, expect, it } from 'vitest';
import { buildMonthGrid, monthsInRange, moveByKey, nightsBetween, weekdayOrder } from './calendar-grid';
import { addDays, addMonths, diffDays, formatAgo, formatMonthYear, formatNightLong, formatNightShort, todayIso, weekdayOf } from './dates';
import { heatGroup, heatLabel, legendExamples } from './heat';
import { isValidTaxId, maskTaxId } from './tax-id';
import { springToLinear, buildDerivedCss } from './theme-css';
import { priceForClipboard } from './clipboard';
import { safeNext } from './auth';
import type { NightDto } from '@precisari/shared';

describe('calendar grid builder', () => {
  it('builds November 2026 Monday-first (1st is a Sunday)', () => {
    const weeks = buildMonthGrid('2026-11', 1);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[5]?.[0]).toBe('2026-11-30');
    expect(weeks[5]?.slice(1).every((c) => c === null)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });
  it('builds Sunday-first grids and handles leap years', () => {
    expect(buildMonthGrid('2026-11', 0)[0]?.[0]).toBe('2026-11-01');
    expect(buildMonthGrid('2028-02', 1).flat().filter(Boolean)).toHaveLength(29);
    expect(buildMonthGrid('2027-02', 1)).toHaveLength(4); // Feb 2027 starts on Monday
  });
  it('orders weekdays and lists months/nights in range', () => {
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(monthsInRange('2026-11-09', addDays('2026-11-09', 179))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(nightsBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
  it('moves selection with arrow keys', () => {
    expect(moveByKey('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(moveByKey('2026-11-03', 'ArrowUp')).toBe('2026-10-27');
    expect(moveByKey('2026-11-03', 'Enter')).toBeNull();
  });
});

describe('dates', () => {
  it('does UTC-safe arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(diffDays('2026-11-09', '2026-11-14')).toBe(5);
    expect(weekdayOf('2026-11-14')).toBe(6);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
  it('formats in pt-BR via i18n', () => {
    expect(formatNightLong('2026-11-14')).toBe('Sábado, 14 de novembro');
    expect(formatNightShort('2026-11-14')).toBe('SÁB, 14 NOV');
    expect(formatMonthYear('2026-11')).toBe('Novembro 2026');
    expect(todayIso('America/Sao_Paulo', new Date('2026-11-10T02:00:00Z'))).toBe('2026-11-09');
    const now = new Date('2026-11-09T12:00:00Z');
    expect(formatAgo('2026-11-09T11:48:00Z', now)).toBe('há 12 minutos');
    expect(formatAgo(null, now)).toBe('ainda não sincronizado');
  });
});

describe('heat helpers', () => {
  const night = (heat: number, price: number, status: NightDto['status'] = 'free'): NightDto => ({
    date: '2026-11-14', status, suggestedPrice: price, currentPrice: 24900, minStay: 1, factors: [], heat, explanation: null, headline: null, isOrphan: false,
  });
  it('maps heat to labels and groups', () => {
    expect(heatLabel(0.95)).toBe('Alta procura');
    expect(heatLabel(0.1)).toBe('Baixa procura');
    expect(heatGroup(0.5)).toBe('mid');
  });
  it('derives legend examples from free nights only', () => {
    const ex = legendExamples([night(0.1, 19900), night(0.5, 24900), night(0.9, 34900), night(0.9, 28900), night(0.1, 9900, 'booked')]);
    expect(ex).toEqual({ low: 19900, mid: 24900, high: 28900 });
  });
});

describe('tax id (CPF/CNPJ)', () => {
  it('validates check digits', () => {
    expect(isValidTaxId('529.982.247-25')).toBe(true);
    expect(isValidTaxId('529.982.247-24')).toBe(false);
    expect(isValidTaxId('111.111.111-11')).toBe(false);
    expect(isValidTaxId('11.222.333/0001-81')).toBe(true);
    expect(isValidTaxId('11.222.333/0001-80')).toBe(false);
    expect(isValidTaxId('123')).toBe(false);
  });
  it('masks progressively', () => {
    expect(maskTaxId('52998224725')).toBe('529.982.247-25');
    expect(maskTaxId('11222333000181')).toBe('11.222.333/0001-81');
    expect(maskTaxId('5299')).toBe('529.9');
  });
});

describe('theme css from tokens', () => {
  it('turns a spring into a CSS linear() easing that overshoots and settles at 1', () => {
    const { easing, durationMs } = springToLinear({ damping: 12, stiffness: 180, mass: 0.8 });
    expect(easing.startsWith('linear(0,')).toBe(true);
    expect(easing.endsWith(', 1)')).toBe(true);
    const values = easing.slice(7, -1).split(',').map(Number);
    expect(Math.max(...values)).toBeGreaterThan(1); // bouncy
    expect(durationMs).toBeGreaterThan(200);
    expect(durationMs).toBeLessThan(2000);
  });
  it('emits shadows, letter-spacing and springs for both themes', () => {
    const css = buildDerivedCss();
    expect(css).toContain('--shadow-card:');
    expect(css).toContain('--spring-price-rise:');
    expect(css).toContain("[data-theme='dark']");
  });
});

describe('misc', () => {
  it('copies whole reais for Airbnb', () => expect(priceForClipboard(34900)).toBe('349'));
  it('sanitizes post-login redirects', () => {
    expect(safeNext('/app/calendario')).toBe('/app/calendario');
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext(null)).toBe('/app');
  });
});
