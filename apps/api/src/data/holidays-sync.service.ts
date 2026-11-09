import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { HOLIDAYS_PROVIDER, type HolidaysProvider } from '../integrations/ports';
import { addDays, easterSunday, fromIsoDate, normalize } from '../integrations/common/text';
import { upsertHoliday, type HolidayRow } from './holiday-store';
import { PricingTriggersService } from './pricing-triggers.service';

/** Rows derived from Easter / fixed dates that BrasilAPI does not mark as we need (Carnival, Réveillon). */
export function derivedNationalRows(year: number): HolidayRow[] {
  const easter = easterSunday(year);
  const base = { scope: 'NATIONAL' as const, state: null, ibgeCode: null };
  return [
    { ...base, date: addDays(easter, -48), name: 'Carnaval (segunda-feira)', kind: 'CARNIVAL' },
    { ...base, date: addDays(easter, -47), name: 'Carnaval (terça-feira)', kind: 'CARNIVAL' },
    { ...base, date: addDays(easter, -46), name: 'Quarta-feira de Cinzas (meio período)', kind: 'CARNIVAL' },
    { ...base, date: `${year}-12-31`, name: 'Réveillon', kind: 'NEW_YEAR' },
  ];
}

/** `holidays.sync`: national holidays from BrasilAPI → Holiday (scope NATIONAL), current and next year. */
@Injectable()
export class HolidaysSyncService implements OnModuleInit {
  private readonly log = new Logger('HolidaysSyncService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobsRegistry,
    private readonly triggers: PricingTriggersService,
    @Inject(HOLIDAYS_PROVIDER) private readonly provider: HolidaysProvider,
  ) {}

  onModuleInit(): void {
    // Yearly on Jan 1st (plus on boot when a year is missing — see DataSeedService).
    this.registry.register(QUEUES.holidaysSync, (d) => this.sync(d.year).then(() => undefined), { pattern: '0 6 1 1 *' });
  }

  async sync(year?: number, now = new Date()): Promise<{ created: number; years: number[] }> {
    const current = now.getUTCFullYear();
    const years = year ? [year] : [current, current + 1];
    let created = 0;
    for (const y of years) {
      const national = await this.provider.nationalHolidays(y);
      const rows: HolidayRow[] = national
        .filter((h) => h.date.startsWith(`${y}-`))
        .map((h) => ({
          date: h.date,
          scope: 'NATIONAL',
          state: null,
          ibgeCode: null,
          name: h.name,
          kind: normalize(h.name).includes('carnaval') ? 'CARNIVAL' : 'REGULAR',
        }));
      for (const r of rows) if (await upsertHoliday(this.prisma, r)) created++;
      for (const r of derivedNationalRows(y)) {
        // Skip a derived Carnival day if the provider already returned a Carnival row on that date.
        const sameDay = await this.prisma.holiday.findFirst({
          where: { date: fromIsoDate(r.date), scope: 'NATIONAL', kind: r.kind, NOT: { name: r.name } },
          select: { id: true },
        });
        if (sameDay) continue;
        if (await upsertHoliday(this.prisma, r)) created++;
      }
    }
    if (created > 0) {
      this.log.log(`holidays.sync: ${created} national holiday rows created for ${years.join(', ')}`);
      await this.triggers.forAll('holidays');
    }
    return { created, years };
  }

  /** Years (current/next) without any national holiday row. */
  async missingYears(now = new Date()): Promise<number[]> {
    const current = now.getUTCFullYear();
    const out: number[] = [];
    for (const y of [current, current + 1]) {
      const n = await this.prisma.holiday.count({
        where: { scope: 'NATIONAL', date: { gte: fromIsoDate(`${y}-01-01`), lte: fromIsoDate(`${y}-12-31`) } },
      });
      if (n === 0) out.push(y);
    }
    return out;
  }
}
