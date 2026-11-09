import { addDays, easterSunday } from '../common/text';
import type { HealthStatus, HolidaysProvider, NationalHoliday } from '../ports';

/** Deterministic national holidays (fixed dates + Easter-based ones), mirroring BrasilAPI's shape. */
export class FakeHolidaysProvider implements HolidaysProvider {
  readonly provider = 'fake';

  async nationalHolidays(year: number): Promise<NationalHoliday[]> {
    const easter = easterSunday(year);
    const rows: NationalHoliday[] = [
      { date: `${year}-01-01`, name: 'Confraternização mundial', type: 'national' },
      { date: addDays(easter, -47), name: 'Carnaval', type: 'national' },
      { date: addDays(easter, -2), name: 'Sexta-feira Santa', type: 'national' },
      { date: easter, name: 'Páscoa', type: 'national' },
      { date: `${year}-04-21`, name: 'Tiradentes', type: 'national' },
      { date: `${year}-05-01`, name: 'Dia do trabalho', type: 'national' },
      { date: addDays(easter, 60), name: 'Corpus Christi', type: 'national' },
      { date: `${year}-09-07`, name: 'Independência do Brasil', type: 'national' },
      { date: `${year}-10-12`, name: 'Nossa Senhora Aparecida', type: 'national' },
      { date: `${year}-11-02`, name: 'Finados', type: 'national' },
      { date: `${year}-11-15`, name: 'Proclamação da República', type: 'national' },
      { date: `${year}-11-20`, name: 'Dia da consciência negra', type: 'national' },
      { date: `${year}-12-25`, name: 'Natal', type: 'national' },
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake' };
  }
}
