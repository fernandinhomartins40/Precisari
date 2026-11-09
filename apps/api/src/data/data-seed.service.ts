import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { fromIsoDate } from '../integrations/common/text';
import { MUNICIPAL_HOLIDAYS, STATE_HOLIDAYS, ruleDate } from './curated-holidays';
import { schoolVacationSeeds } from './school-vacations';
import { upsertHoliday } from './holiday-store';
import { HolidaysSyncService } from './holidays-sync.service';

export interface SeedResult {
  stateHolidays: number;
  municipalHolidays: number;
  schoolVacations: number;
}

/** Curated data seed (state/municipal holidays, school vacations). Idempotent: only inserts missing rows. */
@Injectable()
export class DataSeedService implements OnApplicationBootstrap {
  private readonly log = new Logger('DataSeedService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidaysSync: HolidaysSyncService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.DATA_SEED_ON_BOOT) return;
    // Never block or crash the boot on data seeding / third-party calls.
    void this.seedOnBoot().catch((err: unknown) => this.log.warn(`boot seed failed: ${(err as Error).message}`));
  }

  async seedOnBoot(): Promise<void> {
    const [curatedHolidays, vacations] = await Promise.all([
      this.prisma.holiday.count({ where: { scope: { in: ['STATE', 'MUNICIPAL'] } } }),
      this.prisma.schoolVacation.count(),
    ]);
    if (curatedHolidays === 0 || vacations === 0) {
      const r = await this.seedCuratedData();
      this.log.log(`curated data seeded: ${JSON.stringify(r)}`);
    }
    const missing = await this.holidaysSync.missingYears();
    for (const y of missing) await this.holidaysSync.sync(y);
  }

  async seedCuratedData(years?: number[]): Promise<SeedResult> {
    const current = new Date().getUTCFullYear();
    const ys = years ?? [current, current + 1];
    const result: SeedResult = { stateHolidays: 0, municipalHolidays: 0, schoolVacations: 0 };

    for (const y of ys) {
      for (const [state, rules] of Object.entries(STATE_HOLIDAYS)) {
        for (const rule of rules) {
          const created = await upsertHoliday(this.prisma, {
            date: ruleDate(rule, y), scope: 'STATE', state, ibgeCode: null, name: rule.name, kind: 'REGULAR',
          });
          if (created) result.stateHolidays++;
        }
      }
      for (const city of MUNICIPAL_HOLIDAYS) {
        for (const rule of city.rules) {
          const created = await upsertHoliday(this.prisma, {
            date: ruleDate(rule, y), scope: 'MUNICIPAL', state: city.state, ibgeCode: city.ibgeCode, name: rule.name, kind: 'REGULAR',
          });
          if (created) result.municipalHolidays++;
        }
      }
    }

    for (const v of schoolVacationSeeds()) {
      const startDate = fromIsoDate(v.startDate);
      const exists = await this.prisma.schoolVacation.findFirst({ where: { state: v.state, startDate, year: v.year }, select: { id: true } });
      if (exists) continue;
      await this.prisma.schoolVacation.create({ data: { state: v.state, startDate, endDate: fromIsoDate(v.endDate), year: v.year } });
      result.schoolVacations++;
    }
    return result;
  }
}
