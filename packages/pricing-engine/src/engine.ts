/**
 * computeRecommendations — docs/prd.md §7.
 *
 * raw = base × weekday × seasonality × demand × weather(D-0..D-7) × leadTime(free)
 *            × orphan | adjacent (free)
 * final = keepInsideLimits(roundPsychological(clamp(raw, min, max)))
 *
 * Every multiplier is scaled by aggressiveness (m_eff = 1 + (m − 1) × k) and rounded to 4
 * decimals; the raw price is exactly base × Π factor.multiplier (excluding 'limit' and the
 * informative factors), so every recommendation is auditable from its factors.
 */
import { checkInDays, buildOccupancy, detectGaps } from './occupancy';
import { buildCalendarIndex, type CalendarIndex } from './calendar';
import {
  ADJACENT,
  AGGRESSIVENESS_K,
  DEFAULT_MAX_PRICE_FACTOR,
  MAX_PROTECTED_MIN_STAY,
  ORPHAN,
  defaultWeekdayMultipliers,
  leadTimeMinStay,
  leadTimeMultiplier,
} from './constants';
import { dayOfWeekOf, fromDayNumber, isValidDate, toDayNumber } from './dates';
import { combineDemand, eventSignal, round4, scaleMultiplier, schoolVacationSignal, type DemandSignal } from './demand';
import { heatFromMultiplier } from './heat';
import { LABELS } from './labels';
import { applyLimitsAndRound } from './rounding';
import { regionForState, resolveSeasonality } from './seasonality';
import type {
  Factor,
  NightRecommendation,
  PricingContext,
  PropertyPricingConfig,
  RuleKey,
  WeatherInput,
} from './types';
import { weatherAdjustment } from './weather';

interface DayRange {
  start: number;
  end: number;
}

function toDayRange(startDate: string, endDate: string): DayRange | null {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return null;
  return { start: toDayNumber(startDate), end: toDayNumber(endDate) };
}

/** Weekday curve for a property: a valid host override (7 positive numbers) or the default. */
export function resolveWeekdayMultipliers(property: Pick<PropertyPricingConfig, 'destinationType' | 'rules'>): readonly number[] {
  const override = property.rules?.weekdayMultipliers;
  if (override && override.length === 7 && override.every((m) => Number.isFinite(m) && m > 0)) return override;
  return defaultWeekdayMultipliers(property.destinationType);
}

/** Effective maximum price: maxPrice ?? basePrice × 3, never below minPrice. */
export function resolveMaxPrice(property: Pick<PropertyPricingConfig, 'basePrice' | 'minPrice' | 'maxPrice'>): number {
  return Math.max(property.maxPrice ?? property.basePrice * DEFAULT_MAX_PRICE_FACTOR, property.minPrice);
}

/** Host net per night: price − platform fees − cleaning fee spread over the stay. */
export function netPerNight(price: number, minStay: number, property: Pick<PropertyPricingConfig, 'cleaningFee' | 'platformFeePct'>): number {
  return price - price * property.platformFeePct - property.cleaningFee / minStay;
}

function weekdayLabel(dow: number): string {
  if (dow === 5 || dow === 6) return LABELS.weekend;
  if (dow === 0) return LABELS.sunday;
  return LABELS.weekday;
}

export function computeRecommendations(ctx: PricingContext): NightRecommendation[] {
  const horizon = Math.max(0, Math.floor(ctx.horizonDays));
  if (horizon === 0) return [];
  const today = toDayNumber(ctx.today);
  const last = today + horizon - 1;
  const p = ctx.property;
  const rules = p.rules ?? {};
  const on = (rule: RuleKey): boolean => rules.enabled?.[rule] !== false;
  const k = AGGRESSIVENESS_K[p.aggressiveness] ?? 1;
  const maxPrice = resolveMaxPrice(p);
  const minProfit = rules.minProfitPerNight ?? 0;

  const weekdayTable = resolveWeekdayMultipliers(p);
  const seasonTable = resolveSeasonality(p.destinationType, regionForState(p.state), rules.seasonality);

  const occupancy = buildOccupancy(ctx.bookings, today - 1, last + 1);
  const checkIns = checkInDays(ctx.bookings);
  const orphanGap = new Map<number, number>();
  for (const gap of detectGaps(ctx.bookings, ctx.today, horizon)) {
    if (gap.length <= ORPHAN.maxGapNights) {
      for (const d of gap.dates) orphanGap.set(toDayNumber(d), gap.length);
    }
  }

  const calendar: CalendarIndex = buildCalendarIndex(ctx.holidays ?? [], today, last, {
    carnivalMultiplier: rules.carnivalMultiplier,
    newYearMultiplier: rules.newYearMultiplier,
  });
  const events = (ctx.events ?? [])
    .map((e) => ({ e, range: toDayRange(e.startDate, e.endDate) }))
    .filter((x): x is { e: (typeof x)['e']; range: DayRange } => x.range !== null);
  const vacations = (ctx.schoolVacations ?? [])
    .map((v) => toDayRange(v.startDate, v.endDate))
    .filter((r): r is DayRange => r !== null);
  const weatherByDay = new Map<number, WeatherInput>();
  for (const w of ctx.weather ?? []) {
    if (isValidDate(w.date)) weatherByDay.set(toDayNumber(w.date), w);
  }

  const adjacentPct = Math.min(ADJACENT.maxPct, Math.max(ADJACENT.minPct, Math.round(ADJACENT.basePct * k)));
  const out: NightRecommendation[] = [];
  let checkInIdx = 0;

  for (let n = today; n <= last; n++) {
    const date = fromDayNumber(n);
    const status = occupancy.get(n) ?? 'free';
    const free = status === 'free';
    const daysOut = n - today;
    const factors: Factor[] = [];
    const push = (key: Factor['key'], raw: number, label: string): void => {
      const multiplier = round4(scaleMultiplier(raw, k));
      if (multiplier !== 1) factors.push({ key, multiplier, label });
    };

    if (on('weekday')) push('weekday', weekdayTable[dayOfWeekOf(n)] ?? 1, weekdayLabel(dayOfWeekOf(n)));
    if (on('seasonality')) {
      const m = seasonTable[Number(date.slice(5, 7)) - 1] ?? 1;
      push('seasonality', m, m > 1 ? LABELS.highSeason : LABELS.lowSeason);
    }
    if (on('demand')) {
      const signals: DemandSignal[] = [];
      const cal = calendar.signals.get(n);
      if (cal) signals.push(cal);
      for (const { e, range } of events) {
        if (n < range.start || n > range.end) continue;
        const s = eventSignal(e);
        if (s) signals.push(s);
      }
      if (vacations.some((r) => n >= r.start && n <= r.end)) signals.push(schoolVacationSignal());
      factors.push(...combineDemand(signals, k).factors);
    }
    if (on('weather')) {
      const w = weatherAdjustment(p.destinationType, weatherByDay, n, today);
      if (w) push('weather', w.raw, w.label);
    }

    const orphanLen = free && on('orphan') ? orphanGap.get(n) : undefined;
    let discountPct: number | undefined;
    if (free) {
      if (on('leadTime')) {
        const m = leadTimeMultiplier(daysOut);
        push('leadTime', m, m < 1 ? LABELS.dateApproaching : LABELS.earlyBooking);
      }
      if (orphanLen !== undefined) {
        const m = round4(scaleMultiplier(ORPHAN.multiplier, k));
        factors.push({ key: 'orphan', multiplier: m, label: LABELS.orphan });
        discountPct = Math.round((1 - m) * 100);
      } else if (on('adjacent')) {
        const afterCheckOut = occupancy.has(n - 1);
        const beforeCheckIn = occupancy.has(n + 1);
        if (afterCheckOut || beforeCheckIn) {
          factors.push({
            key: 'adjacent',
            multiplier: round4(1 - adjacentPct / 100),
            label: afterCheckOut ? LABELS.adjacentCheckOut : LABELS.adjacentCheckIn,
          });
          discountPct = adjacentPct;
        }
      }
    }

    const multiplier = factors.reduce((acc, f) => acc * f.multiplier, 1);
    const raw = p.basePrice * multiplier;
    const heat = heatFromMultiplier(multiplier);
    const { price, clamped } = applyLimitsAndRound(raw, p.minPrice, maxPrice);
    if (clamped) {
      const bound = clamped === 'max' ? maxPrice : p.minPrice;
      factors.push({
        key: 'limit',
        multiplier: raw > 0 ? round4(bound / raw) : 1,
        label: clamped === 'max' ? LABELS.maxLimit : LABELS.minLimit,
      });
    }

    let minStay = 1;
    if (free) {
      while (checkInIdx < checkIns.length && (checkIns[checkInIdx] ?? Infinity) <= n) checkInIdx++;
      const nextCheckIn = checkIns[checkInIdx];
      const available = nextCheckIn === undefined ? Infinity : nextCheckIn - n;
      if (on('minStay')) {
        const lw = calendar.longWeekends.get(n);
        minStay = lw ? lw.length : leadTimeMinStay(daysOut);
      }
      if (orphanLen !== undefined) {
        minStay = orphanLen;
      } else if (minStay > available) {
        minStay = available;
        factors.push({ key: 'minStay', multiplier: 1, label: LABELS.minStayGap });
      }
      if (on('profitProtection')) {
        const ceiling = Math.min(available, MAX_PROTECTED_MIN_STAY);
        const before = minStay;
        while (minStay < ceiling && netPerNight(price, minStay, p) < minProfit) minStay++;
        if (minStay > before) {
          factors.push({ key: 'profitProtection', multiplier: 1, label: LABELS.profitProtection });
        }
      }
    }

    const rec: NightRecommendation = {
      date,
      status,
      suggestedPrice: price,
      minStay,
      factors,
      heat,
      isOrphan: orphanLen !== undefined,
    };
    if (discountPct !== undefined) rec.discountPct = discountPct;
    out.push(rec);
  }
  return out;
}
