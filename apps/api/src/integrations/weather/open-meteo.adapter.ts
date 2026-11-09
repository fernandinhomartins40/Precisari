import { z } from 'zod';
import { fetchJson, type FetchFn } from '../common/http';
import type { DailyForecast, HealthStatus, WeatherProvider } from '../ports';

const nums = z.array(z.number().nullable());

export const OpenMeteoForecast = z
  .object({
    daily: z.object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
      precipitation_probability_max: nums,
      precipitation_sum: nums,
      temperature_2m_min: nums,
      temperature_2m_max: nums,
    }),
  })
  .refine((r) => {
    const n = r.daily.time.length;
    return (
      r.daily.precipitation_probability_max.length === n &&
      r.daily.precipitation_sum.length === n &&
      r.daily.temperature_2m_min.length === n &&
      r.daily.temperature_2m_max.length === n
    );
  }, 'daily arrays must have the same length');

/** Open-Meteo daily forecast (https://open-meteo.com/en/docs). Commercial plan required in production. */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly provider = 'open-meteo';

  constructor(
    private readonly baseUrl = 'https://api.open-meteo.com',
    private readonly fetchFn?: FetchFn,
  ) {}

  async forecast(
    lat: number,
    lng: number,
    opts: { days?: number; pastDays?: number; timezone?: string } = {},
  ): Promise<DailyForecast[]> {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      daily: 'precipitation_probability_max,precipitation_sum,temperature_2m_min,temperature_2m_max',
      forecast_days: String(Math.min(Math.max(opts.days ?? 16, 1), 16)),
      past_days: String(Math.min(Math.max(opts.pastDays ?? 0, 0), 92)),
      timezone: opts.timezone ?? 'America/Sao_Paulo',
    });
    const res = await fetchJson('weather', `${this.baseUrl}/v1/forecast?${params.toString()}`, OpenMeteoForecast, {
      fetchFn: this.fetchFn,
      timeoutMs: 10_000,
    });
    const d = res.daily;
    const out: DailyForecast[] = [];
    d.time.forEach((date, i) => {
      const tempMin = d.temperature_2m_min[i];
      const tempMax = d.temperature_2m_max[i];
      if (tempMin == null || tempMax == null) return; // incomplete day: skip
      const precipMm = d.precipitation_sum[i] ?? null;
      const prob = d.precipitation_probability_max[i];
      // Past days have observed precipitation but no probability: derive 0/100 from the observed amount.
      const precipProb = prob ?? (precipMm != null && precipMm >= 1 ? 100 : 0);
      out.push({ date, precipProb, precipMm, tempMin, tempMax });
    });
    return out;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const rows = await this.forecast(-23.55, -46.63, { days: 1 });
      return { ok: rows.length > 0, detail: null };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}
