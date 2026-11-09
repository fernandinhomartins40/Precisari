import type { WeatherDto } from '@precisari/shared';

/** Simple icon condition from a daily forecast (precipProb 0..100, °C, mm). */
export function weatherCondition(w: { precipProb: number; precipMm: number | null; tempMin: number; tempMax: number }): WeatherDto['condition'] {
  if (w.precipProb >= 70 && (w.precipMm ?? 0) >= 20) return 'storm';
  if (w.precipProb >= 60) return 'rain';
  if (w.tempMax <= 12 || w.tempMin <= 5) return 'cold';
  if (w.precipProb >= 35) return 'cloud';
  if (w.precipProb >= 15) return 'partly';
  return 'sun';
}
