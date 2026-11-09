/**
 * Weather rule (D-0..D-7 only):
 * - BEACH: precipProb > 70% → 0.85 ("Chuva prevista"); a sunny day (precipProb ≤ 30%) after
 *   a rainy week (≥ 4 rainy days among the 7 previous days with data) → 1.05.
 * - MOUNTAIN: intense cold (tempMin ≤ 5 °C) → 1.10.
 * - URBAN, RURAL, CULTURAL: neutral.
 */
import { WEATHER } from './constants';
import { LABELS } from './labels';
import type { DestinationType, WeatherInput } from './types';

export interface WeatherAdjustment {
  /** Raw (unscaled) multiplier. */
  raw: number;
  label: string;
}

export function isRainyDay(w: WeatherInput): boolean {
  return w.precipProb > WEATHER.rainProbThreshold || (w.precipMm ?? 0) >= WEATHER.rainyMinPrecipMm;
}

/**
 * @param byDay forecast/observations indexed by day number
 * @param night day number of the night
 * @param today day number of D-0
 */
export function weatherAdjustment(
  type: DestinationType,
  byDay: ReadonlyMap<number, WeatherInput>,
  night: number,
  today: number,
): WeatherAdjustment | null {
  const offset = night - today;
  if (offset < 0 || offset > WEATHER.maxOffsetDays) return null;
  const w = byDay.get(night);
  if (!w) return null;
  if (type === 'BEACH') {
    if (w.precipProb > WEATHER.rainProbThreshold) return { raw: WEATHER.beachRain, label: LABELS.rain };
    if (w.precipProb <= WEATHER.sunnyMaxPrecipProb) {
      let rainy = 0;
      for (let d = night - 7; d < night; d++) {
        const prev = byDay.get(d);
        if (prev && isRainyDay(prev)) rainy++;
      }
      if (rainy >= WEATHER.rainyWeekMinDays) {
        return { raw: WEATHER.beachSunAfterRain, label: LABELS.sunAfterRain };
      }
    }
    return null;
  }
  if (type === 'MOUNTAIN' && w.tempMin <= WEATHER.coldMaxTempMin) {
    return { raw: WEATHER.mountainCold, label: LABELS.intenseCold };
  }
  return null;
}
