import './env-setup';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataModule } from '../../src/data/data.module';
import { HolidaysSyncService, derivedNationalRows } from '../../src/data/holidays-sync.service';
import { WeatherRefreshService, gridRound, isMaterialChange, weekendShift } from '../../src/data/weather-refresh.service';
import { EventsIngestService } from '../../src/data/events/events-ingest.service';
import { DataSeedService } from '../../src/data/data-seed.service';
import { JobsRegistry } from '../../src/jobs/jobs.registry';
import { STATE_HOLIDAYS } from '../../src/data/curated-holidays';
import { schoolVacationSeeds } from '../../src/data/school-vacations';
import type { DailyForecast, WeatherProvider } from '../../src/integrations/ports';
import { addDays, localDateHour } from '../../src/integrations/common/text';
import { createProperty, createTestApp, createUser, resetDb, type TestApp } from './helpers';

/** Controllable weather stub. */
class StubWeather implements WeatherProvider {
  readonly provider = 'stub';
  rows: DailyForecast[] = [];
  calls: { lat: number; lng: number; opts: unknown }[] = [];
  async forecast(lat: number, lng: number, opts?: unknown): Promise<DailyForecast[]> {
    this.calls.push({ lat, lng, opts });
    return this.rows.map((r) => ({ ...r }));
  }
}

describe('Curated data and sync jobs (M3)', () => {
  let t: TestApp;
  const weather = new StubWeather();

  beforeAll(async () => {
    t = await createTestApp([DataModule], { weather });
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.enqueued.length = 0;
    t.fakes.push.sent.length = 0;
    weather.calls.length = 0;
  });

  it('registers job handlers with schedules', () => {
    const r = t.get(JobsRegistry);
    expect(r.get('weather.refresh')?.repeat).toEqual({ pattern: '0 */6 * * *' });
    expect(r.get('holidays.sync')?.repeat).toEqual({ pattern: '0 6 1 1 *' });
    expect(r.get('events.ingest')?.repeat).toBeDefined();
  });

  it('curated tables cover all 27 UFs', () => {
    expect(Object.keys(STATE_HOLIDAYS)).toHaveLength(27);
    expect(new Set(schoolVacationSeeds().map((s) => s.state)).size).toBe(27);
    expect(schoolVacationSeeds().every((s) => s.startDate <= s.endDate)).toBe(true);
  });

  it('holidays.sync upserts national holidays + Carnival/Réveillon rows idempotently', async () => {
    const user = await createUser(t.prisma);
    const prop = await createProperty(t.prisma, user.id);
    const svc = t.get(HolidaysSyncService);
    expect(await svc.missingYears(new Date('2027-03-01T00:00:00Z'))).toEqual([2027, 2028]);
    const r = await svc.sync(undefined, new Date('2027-03-01T00:00:00Z'));
    expect(r.years).toEqual([2027, 2028]);
    expect(r.created).toBeGreaterThan(20);
    expect(t.enqueued.map((e) => e.data)).toEqual([{ propertyId: prop.id, reason: 'holidays' }]);

    const carnival = await t.prisma.holiday.findMany({
      where: { kind: 'CARNIVAL', date: { gte: new Date('2027-01-01'), lte: new Date('2027-12-31') } },
      orderBy: { date: 'asc' },
    });
    // fake provider returns "Carnaval" on Tuesday; derived Monday + Ash Wednesday are added, Tuesday not duplicated
    expect(carnival.map((h) => [h.date.toISOString().slice(0, 10), h.name])).toEqual([
      ['2027-02-08', 'Carnaval (segunda-feira)'],
      ['2027-02-09', 'Carnaval'],
      ['2027-02-10', 'Quarta-feira de Cinzas (meio período)'],
    ]);
    const nye = await t.prisma.holiday.findFirst({ where: { kind: 'NEW_YEAR', date: new Date('2027-12-31T00:00:00Z') } });
    expect(nye).toMatchObject({ name: 'Réveillon', scope: 'NATIONAL', state: null });

    const again = await svc.sync(undefined, new Date('2027-03-01T00:00:00Z'));
    expect(again.created).toBe(0);
    expect(derivedNationalRows(2026).map((d) => d.date)).toEqual(['2026-02-16', '2026-02-17', '2026-02-18', '2026-12-31']);
  });

  it('seedCuratedData is idempotent', async () => {
    const seed = t.get(DataSeedService);
    const a = await seed.seedCuratedData([2027]);
    expect(a.stateHolidays).toBe(Object.values(STATE_HOLIDAYS).flat().length);
    expect(await seed.seedCuratedData([2027])).toEqual({ stateHolidays: 0, municipalHolidays: 0, schoolVacations: 0 });
  });

  it('weather.refresh upserts by 0.1° grid, recomputes only on material D-0..D-7 change and alerts strong weekend shifts', async () => {
    const user = await createUser(t.prisma);
    await t.prisma.deviceToken.create({ data: { userId: user.id, expoPushToken: 'ExponentPushToken[w]', platform: 'ios' } });
    const beach = await createProperty(t.prisma, user.id, { lat: -27.6789, lng: -48.4867 });
    const sameCell = await createProperty(t.prisma, user.id, { lat: -27.6612, lng: -48.4701, destinationType: 'URBAN' });
    const far = await createProperty(t.prisma, user.id, { lat: -29.3787, lng: -50.8744, city: 'Gramado', state: 'RS', destinationType: 'MOUNTAIN' });

    const now = new Date();
    const today = localDateHour(now, 'America/Sao_Paulo').date;
    weather.rows = Array.from({ length: 23 }, (_, i) => ({ date: addDays(today, i - 7), precipProb: 10, precipMm: 0, tempMin: 18, tempMax: 28 }));

    const r1 = await t.get(WeatherRefreshService).refresh({}, now);
    expect(r1.cells).toBe(2);
    expect(weather.calls.map((c) => [c.lat, c.lng])).toEqual([[-27.7, -48.5], [-29.4, -50.9]]);
    expect(weather.calls[0]?.opts).toMatchObject({ days: 16, pastDays: 7 });
    expect(await t.prisma.weatherForecast.count({ where: { lat: -27.7, lng: -48.5 } })).toBe(23);
    expect(new Set(t.enqueued.map((e) => (e.data as { propertyId: string }).propertyId))).toEqual(new Set([beach.id, sameCell.id, far.id]));

    // Same forecast again → nothing material.
    t.enqueued.length = 0;
    await t.get(WeatherRefreshService).refresh({}, now);
    expect(t.enqueued).toHaveLength(0);

    // D+12 changes only (outside D-0..D-7) → no recompute.
    weather.rows = weather.rows.map((r) => (r.date === addDays(today, 12) ? { ...r, precipProb: 95 } : r));
    await t.get(WeatherRefreshService).refresh({}, now);
    expect(t.enqueued).toHaveLength(0);

    // Next weekend day turns rainy → recompute + alert for the BEACH property only (and only once).
    const weekend = Array.from({ length: 8 }, (_, i) => addDays(today, i)).find((d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))!;
    weather.rows = weather.rows.map((r) => (r.date === weekend ? { ...r, precipProb: 85, precipMm: 20 } : r));
    await t.get(WeatherRefreshService).refresh({ lat: -27.68, lng: -48.49 }, now);
    expect(new Set(t.enqueued.map((e) => (e.data as { propertyId: string }).propertyId))).toEqual(new Set([beach.id, sameCell.id]));
    expect(t.fakes.push.sent).toHaveLength(1);
    expect(t.fakes.push.sent[0]?.title).toBe('A previsão mudou');
    await t.prisma.weatherForecast.updateMany({ where: { date: new Date(`${weekend}T00:00:00Z`) }, data: { precipProb: 10 } });
    await t.get(WeatherRefreshService).refresh({ lat: -27.68, lng: -48.49 }, now);
    expect(t.fakes.push.sent).toHaveLength(1);
  });

  it('weather helpers', () => {
    expect(gridRound(-27.6789)).toBe(-27.7);
    expect(gridRound(-48.4501)).toBe(-48.5);
    expect(isMaterialChange(undefined, { date: 'x', precipProb: 0, precipMm: 0, tempMin: 0, tempMax: 0 })).toBe(true);
    expect(isMaterialChange({ precipProb: 10, tempMin: 18, tempMax: 28 }, { date: 'x', precipProb: 25, precipMm: 0, tempMin: 19, tempMax: 30 })).toBe(false);
    expect(weekendShift(80, 20)).toBe('sun');
    expect(weekendShift(60, 75)).toBeNull();
  });

  it('events.ingest adds curated events to the curation queue (unverified, LLM-classified) idempotently', async () => {
    const svc = t.get(EventsIngestService);
    t.fakes.llm.classifyCalls = 0;
    const r = await svc.ingest(new Date('2026-11-09T12:00:00Z'));
    expect(r.created).toBeGreaterThan(3);
    const events = await t.prisma.event.findMany();
    expect(events.every((e) => !e.verified && e.source === 'curated')).toBe(true);
    expect(t.fakes.llm.classifyCalls).toBe(events.filter((e) => e.name !== 'Réveillon de Copacabana').length);
    expect(events.find((e) => e.name === 'Réveillon de Copacabana')).toMatchObject({ size: 'XG', radiusKm: 15 });
    expect(events.find((e) => e.name === 'Lollapalooza Brasil')?.size).toBe('XG');
    expect(await svc.ingest(new Date('2026-11-09T12:00:00Z'))).toEqual({ created: 0, skipped: r.created });
  });
});
