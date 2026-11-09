import { z } from 'zod';
import { fetchJson, type FetchFn } from '../common/http';
import type { HealthStatus, HolidaysProvider, NationalHoliday } from '../ports';

export const BrasilApiHolidays = z.array(
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string().min(1),
    type: z.string().default('national'),
  }),
);

/** National holidays from BrasilAPI (https://brasilapi.com.br/docs#tag/Feriados-Nacionais). */
export class BrasilApiHolidaysProvider implements HolidaysProvider {
  readonly provider = 'brasilapi';

  constructor(
    private readonly baseUrl = 'https://brasilapi.com.br/api',
    private readonly fetchFn?: FetchFn,
  ) {}

  async nationalHolidays(year: number): Promise<NationalHoliday[]> {
    const rows = await fetchJson('holidays', `${this.baseUrl}/feriados/v1/${year}`, BrasilApiHolidays, {
      fetchFn: this.fetchFn,
      timeoutMs: 8_000,
    });
    return rows.map((r) => ({ date: r.date, name: r.name, type: r.type }));
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const rows = await this.nationalHolidays(new Date().getUTCFullYear());
      return { ok: rows.length > 0, detail: `${rows.length} feriados` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}
