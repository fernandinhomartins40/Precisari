import type { DailyForecast, HealthStatus, WeatherProvider } from '../ports';

/** Deterministic pseudo-forecast (varies by date and location) for dev/tests. */
export class FakeWeatherProvider implements WeatherProvider {
  readonly provider = 'fake';
  calls = 0;

  async forecast(lat: number, lng: number, opts: { days?: number; pastDays?: number } = {}): Promise<DailyForecast[]> {
    this.calls++;
    const days = opts.days ?? 16;
    const past = opts.pastDays ?? 0;
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const seed = Math.abs(Math.round(lat * 10) * 31 + Math.round(lng * 10));
    return Array.from({ length: days + past }, (_, i) => {
      const t = today + (i - past) * 86_400_000;
      const date = new Date(t).toISOString().slice(0, 10);
      const k = (Math.floor(t / 86_400_000) + seed) % 100;
      const precipProb = (k * 37) % 100;
      return { date, precipProb, precipMm: precipProb / 10, tempMin: 16 + (k % 5), tempMax: 25 + (k % 7) };
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
