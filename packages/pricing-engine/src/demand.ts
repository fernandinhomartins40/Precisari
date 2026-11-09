/**
 * Demand reading: events, school vacations and the combination rule.
 *
 * COMBINATION RULE (documented in README): calendar signals (holiday, long weekend,
 * Carnival, Réveillon) describe the same phenomenon, so only the strongest of them is kept
 * per night (done in calendar.ts). That calendar signal, every event and the school
 * vacation are then combined as:
 *
 *   demand = s₁ × Π_{i≥2} (1 + 0.5 × (sᵢ − 1))      (signals already scaled, s₁ the largest)
 *
 * capped at 2.5 (unless s₁ alone is higher). When capped, the secondary factors are shrunk
 * proportionally in log space so the factors still multiply to the final demand.
 */
import { DEMAND, AGGRESSIVENESS_K } from './constants';
import { LABELS } from './labels';
import type { Aggressiveness, EventInput, Factor, FactorKey } from './types';

export interface DemandSignal {
  key: FactorKey;
  /** Raw (unscaled) multiplier. */
  raw: number;
  label: string;
}

/** m_eff = 1 + (m − 1) × k. */
export function scaleMultiplier(m: number, aggressiveness: Aggressiveness | number): number {
  const k = typeof aggressiveness === 'number' ? aggressiveness : AGGRESSIVENESS_K[aggressiveness];
  return 1 + (m - 1) * k;
}

/** Rounds a multiplier to 4 decimals (the precision used in factors and in the price). */
export function round4(m: number): number {
  return Math.round(m * 10_000) / 10_000;
}

/**
 * Distance decay of an event: weight = 1 − (d / R)² inside the radius, 0 outside.
 * Nearby events keep almost all of their effect (2 km of 5 km → 84%).
 */
export function eventDistanceWeight(distanceKm: number, radiusKm: number = DEMAND.eventRadiusKm): number {
  const radius = radiusKm > 0 ? radiusKm : DEMAND.eventRadiusKm;
  const d = Math.max(0, distanceKm);
  if (d >= radius) return 0;
  return 1 - (d / radius) ** 2;
}

/** Raw multiplier of an event after distance decay (1 when out of range). */
export function eventMultiplier(event: Pick<EventInput, 'size' | 'distanceKm' | 'radiusKm'>): number {
  const base = DEMAND.events[event.size];
  return 1 + (base - 1) * eventDistanceWeight(event.distanceKm, event.radiusKm);
}

/** Demand signal of an event (or null when the property is outside the impact radius). */
export function eventSignal(event: EventInput): DemandSignal | null {
  const raw = eventMultiplier(event);
  if (raw <= 1) return null;
  return { key: 'event', raw, label: LABELS.event(event.name, event.distanceKm) };
}

export function schoolVacationSignal(): DemandSignal {
  return { key: 'schoolVacation', raw: DEMAND.schoolVacation, label: LABELS.schoolVacation };
}

/**
 * Scales each signal by aggressiveness and combines them (see module doc). Returns the
 * factors (multipliers rounded to 4 decimals, neutral ones omitted) and their product.
 */
export function combineDemand(
  signals: readonly DemandSignal[],
  k: number,
): { factors: Factor[]; multiplier: number } {
  if (signals.length === 0) return { factors: [], multiplier: 1 };
  const scaled = signals
    .map((s) => ({ ...s, eff: scaleMultiplier(s.raw, k) }))
    .sort((a, b) => b.eff - a.eff);
  const [first, ...rest] = scaled as [(typeof scaled)[number], ...typeof scaled];
  let secondary = rest.map((s) => 1 + DEMAND.secondaryWeight * (s.eff - 1));
  const product = secondary.reduce((acc, m) => acc * m, first.eff);
  const target = Math.max(DEMAND.cap, first.eff);
  if (product > target) {
    const ratio = Math.log(target / first.eff) / Math.log(product / first.eff);
    secondary = secondary.map((m) => m ** ratio);
  }
  const factors: Factor[] = [{ key: first.key, multiplier: round4(first.eff), label: first.label }];
  rest.forEach((s, i) => {
    factors.push({ key: s.key, multiplier: round4(secondary[i] ?? 1), label: s.label });
  });
  const kept = factors.filter((f) => f.multiplier !== 1);
  return { factors: kept, multiplier: kept.reduce((acc, f) => acc * f.multiplier, 1) };
}
