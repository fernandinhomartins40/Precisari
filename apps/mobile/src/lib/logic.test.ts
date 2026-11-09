import { describe, expect, it } from 'vitest';
import type { NightDto } from '@precisari/shared';
import { t } from '@/i18n';
import { addDays, formatLongDay, formatShortDay, weekdayOf } from './dates';
import { dayPeriod, firstName, greeting } from './greeting';
import { buildMonthGrids, demandLevel, mondayIndex } from './heat-grid';
import { centsToMaskedDisplay, maskBRLInput } from './money-mask';
import { applyOtpBackspace, applyOtpInput, emptyOtp, isOtpComplete, otpCode, resendSecondsLeft } from './otp';
import { factorPct, factorWeights, formatFactorPct } from './factors';

describe('i18n', () => {
  it('interpolates params', () => {
    expect(t('today.stackCounter', { index: 1, total: 3 })).toBe('1 de 3');
  });
});

describe('greeting', () => {
  it('maps hours to periods', () => {
    expect(dayPeriod(5)).toBe('morning');
    expect(dayPeriod(11)).toBe('morning');
    expect(dayPeriod(12)).toBe('afternoon');
    expect(dayPeriod(17)).toBe('afternoon');
    expect(dayPeriod(18)).toBe('evening');
    expect(dayPeriod(2)).toBe('evening');
  });
  it('uses the first name', () => {
    expect(firstName('  carla souza ')).toBe('Carla');
    expect(firstName('')).toBeNull();
    expect(greeting('Carla Souza', new Date(2026, 10, 9, 8))).toBe('Bom dia, Carla.');
    expect(greeting('Carla', new Date(2026, 10, 9, 14))).toBe('Boa tarde, Carla.');
    expect(greeting(null, new Date(2026, 10, 9, 21))).toBe('Boa noite.');
  });
});

describe('dates', () => {
  it('formats short and long days in pt-BR', () => {
    expect(formatShortDay('2026-11-14')).toBe('SÁB, 14 NOV');
    expect(formatLongDay('2026-11-14')).toBe('Sábado, 14 de novembro');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf('2026-11-09')).toBe(1);
  });
});

describe('money mask', () => {
  it('keeps whole reais as cents', () => {
    expect(maskBRLInput('249')).toEqual({ cents: 24900, display: '249' });
    expect(maskBRLInput('R$ 1.249')).toEqual({ cents: 124900, display: '1.249' });
    expect(maskBRLInput('1249,90')).toEqual({ cents: 124900, display: '1.249' });
    expect(maskBRLInput('00120')).toEqual({ cents: 12000, display: '120' });
    expect(maskBRLInput('abc')).toEqual({ cents: null, display: '' });
    expect(maskBRLInput('')).toEqual({ cents: null, display: '' });
  });
  it('caps length and renders existing values', () => {
    expect(maskBRLInput('123456789').display).toBe('1.234.567');
    expect(centsToMaskedDisplay(1249900)).toBe('12.499');
    expect(centsToMaskedDisplay(null)).toBe('');
  });
});

describe('otp input', () => {
  it('auto-advances on single digits', () => {
    const s = applyOtpInput(emptyOtp(), 0, '4');
    expect(s.digits[0]).toBe('4');
    expect(s.focus).toBe(1);
  });
  it('fills forward on paste and ignores non-digits', () => {
    const s = applyOtpInput(emptyOtp(), 0, '12-34 56');
    expect(otpCode(s.digits)).toBe('123456');
    expect(isOtpComplete(s.digits)).toBe(true);
    expect(s.focus).toBe(5);
  });
  it('replaces an existing digit with the newest one', () => {
    const d = ['1', '', '', '', '', ''];
    expect(applyOtpInput(d, 0, '17').digits[0]).toBe('7');
  });
  it('clears a box when emptied', () => {
    const s = applyOtpInput(['1', '2', '', '', '', ''], 1, '');
    expect(s.digits).toEqual(['1', '', '', '', '', '']);
  });
  it('backspace moves to previous box when empty', () => {
    const s = applyOtpBackspace(['1', '2', '', '', '', ''], 2);
    expect(s.focus).toBe(1);
    expect(s.digits[1]).toBe('');
    const s2 = applyOtpBackspace(['1', '2', '3', '', '', ''], 2);
    expect(s2.focus).toBe(2);
    expect(s2.digits[2]).toBe('');
  });
  it('is incomplete with gaps', () => {
    expect(isOtpComplete(['1', '2', '', '4', '5', '6'])).toBe(false);
  });
  it('counts down the resend timer', () => {
    expect(resendSecondsLeft(0, 0)).toBe(30);
    expect(resendSecondsLeft(0, 10_500)).toBe(20);
    expect(resendSecondsLeft(0, 40_000)).toBe(0);
  });
});

function night(date: string, heat: number, extra: Partial<NightDto> = {}): NightDto {
  return {
    date,
    status: 'free',
    suggestedPrice: 24900,
    currentPrice: 24900,
    minStay: 1,
    factors: [],
    heat,
    explanation: null,
    headline: null,
    isOrphan: false,
    ...extra,
  };
}

describe('heat-map grid', () => {
  it('maps heat to demand levels', () => {
    expect(demandLevel(0)).toBe('low');
    expect(demandLevel(0.39)).toBe('low');
    expect(demandLevel(0.5)).toBe('medium');
    expect(demandLevel(0.95)).toBe('high');
  });
  it('builds Monday-first weeks per month', () => {
    expect(mondayIndex('2026-11-09')).toBe(0);
    expect(mondayIndex('2026-11-01')).toBe(6);
    const nights: NightDto[] = [];
    for (let i = 0; i < 30; i += 1) nights.push(night(addDays('2026-11-15', i), (i % 10) / 10));
    const grids = buildMonthGrids(nights, { today: '2026-11-15' });
    expect(grids.map((g) => g.key)).toEqual(['2026-11', '2026-12']);
    const nov = grids[0]!;
    expect(nov.monthIndex).toBe(10);
    // Nov 15 2026 is a Sunday: first rendered week ends with it.
    expect(nov.weeks[0]![6]!.date).toBe('2026-11-15');
    expect(nov.weeks[0]![6]!.isToday).toBe(true);
    expect(nov.weeks[0]!.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(nov.weeks.every((w) => w.length === 7)).toBe(true);
    const dec = grids[1]!;
    // Dec 1 2026 is a Tuesday.
    expect(dec.weeks[0]![0]).toBeNull();
    expect(dec.weeks[0]![1]!.day).toBe(1);
  });
  it('applies filters without changing the grid shape', () => {
    const nights = [
      night('2026-11-09', 0.1),
      night('2026-11-10', 0.9, { status: 'booked' }),
      night('2026-11-11', 0.7, { suggestedPrice: 34900 }),
      night('2026-11-12', 0.5),
    ];
    const free = buildMonthGrids(nights, { filter: 'free' })[0]!.weeks.flat().filter(Boolean);
    expect(free.map((c) => c!.matches)).toEqual([true, false, true, true]);
    const sugg = buildMonthGrids(nights, { filter: 'suggested', pendingDates: new Set(['2026-11-12']) })[0]!
      .weeks.flat()
      .filter(Boolean);
    expect(sugg.map((c) => c!.matches)).toEqual([false, false, true, true]);
  });
});

describe('factors', () => {
  it('formats signed percentages and relative weights', () => {
    expect(factorPct(1.3)).toBe(30);
    expect(formatFactorPct(0.85)).toBe('−15%');
    expect(formatFactorPct(1)).toBe('0%');
    const w = factorWeights([
      { key: 'weekday', multiplier: 1.15, label: 'a' },
      { key: 'event', multiplier: 1.3, label: 'b' },
    ]);
    expect(w[0]!.factor.key).toBe('event');
    expect(w[0]!.weight).toBe(1);
    expect(w[1]!.weight).toBeCloseTo(0.5);
  });
});
