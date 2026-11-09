import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CalendarSourceDto, PropertyDto, SyncResultDto, type AuthSession } from '@precisari/shared';
import { addDays, todayInTz } from '../src/common/dates';
import { CalendarService } from '../src/calendar/calendar.service';
import { bearer, createTestApp, icsFeed, login, propertyBody, resetDb, startIcsServer, type TestContext } from './helpers';

describe('properties + calendar (integration)', () => {
  let ctx: TestContext;
  let ics: Awaited<ReturnType<typeof startIcsServer>>;
  let session: AuthSession;
  const today = todayInTz('America/Sao_Paulo');

  beforeAll(async () => {
    ctx = await createTestApp();
    ics = await startIcsServer();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    session = await login(ctx, 'carla@precisari.dev');
  });
  afterAll(async () => {
    await ics.close();
    await ctx.close();
  });

  const create = (body = propertyBody()) => request(ctx.http).post('/v1/properties').set(...bearer(session)).send(body);

  it('CRUD with defaults, ownership and soft delete', async () => {
    const res = await create().expect(201);
    const p = PropertyDto.parse(res.body);
    expect(p.maxPrice).toBe(24900 * 3);
    expect(p.platformFeePct).toBe(0.03);
    expect(p.aggressiveness).toBe('BALANCED');
    expect(p.calendarSources).toEqual([]);

    const list = await request(ctx.http).get('/v1/properties').set(...bearer(session)).expect(200);
    expect(list.body).toHaveLength(1);

    const upd = await request(ctx.http)
      .patch(`/v1/properties/${p.id}`)
      .set(...bearer(session))
      .send({ basePrice: 29900, aggressiveness: 'BOLD', rulesConfig: { enabled: { weather: false } } })
      .expect(200);
    expect(upd.body.basePrice).toBe(29900);
    expect(upd.body.maxPrice).toBe(29900 * 3); // default ceiling follows the base
    expect(upd.body.rulesConfig.enabled.weather).toBe(false);

    const bad = await request(ctx.http).patch(`/v1/properties/${p.id}`).set(...bearer(session)).send({ minPrice: 99900 }).expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');

    const other = await login(ctx, 'rafael@precisari.dev');
    await request(ctx.http).get(`/v1/properties/${p.id}`).set(...bearer(other)).expect(404);

    await request(ctx.http).delete(`/v1/properties/${p.id}`).set(...bearer(session)).expect(204);
    await request(ctx.http).get(`/v1/properties/${p.id}`).set(...bearer(session)).expect(404);
    expect(await ctx.prisma.property.count({ where: { id: p.id } })).toBe(1); // soft-deleted
  });

  it('validates the body (min ≤ base ≤ max)', async () => {
    const r = await create(propertyBody({ minPrice: 30000 })).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });

  it('enforces the FREE plan limit (1 property) and lifts it for PRO', async () => {
    await create().expect(201);
    const r = await create(propertyBody({ name: 'Segundo' })).expect(403);
    expect(r.body.code).toBe('PLAN_LIMIT');
    expect(r.body.message).toMatch(/Pro/);
    await ctx.prisma.subscription.update({ where: { userId: session.user.id }, data: { plan: 'PRO', status: 'TRIALING' } });
    await create(propertyBody({ name: 'Segundo' })).expect(201);
  });

  it('connects an iCal link, stores it encrypted and imports bookings', async () => {
    const p = PropertyDto.parse((await create().expect(201)).body);
    ics.files['/calendar/ical/123.ics?s=secret'] = icsFeed([
      { uid: 'r1@airbnb.com', start: addDays(today, 3), end: addDays(today, 6) },
      { uid: 'b1@airbnb.com', start: addDays(today, 10), end: addDays(today, 11), summary: 'Airbnb (Not available)' },
    ]);
    const url = ics.url('/calendar/ical/123.ics?s=secret');
    const res = await request(ctx.http).post(`/v1/properties/${p.id}/calendar-sources`).set(...bearer(session)).send({ url }).expect(201);
    const src = CalendarSourceDto.parse(res.body);
    expect(src.status).toBe('OK');
    expect(src.urlMasked).not.toContain('secret');

    const row = await ctx.prisma.calendarSource.findUniqueOrThrow({ where: { id: src.id } });
    expect(row.urlEncrypted).not.toContain('127.0.0.1');
    const bookings = await ctx.prisma.booking.findMany({ where: { propertyId: p.id }, orderBy: { checkIn: 'asc' } });
    expect(bookings.map((b) => b.status)).toEqual(['BOOKED', 'BLOCKED']);

    // Pricing was recomputed inline (JOBS_ENABLED=false).
    expect(await ctx.prisma.nightPrice.count({ where: { propertyId: p.id } })).toBe(30);

    const prop = await request(ctx.http).get(`/v1/properties/${p.id}`).set(...bearer(session)).expect(200);
    expect(prop.body.calendarSources[0].urlMasked).toBe(src.urlMasked);

    // Unchanged feed ⇒ changed=false.
    const s1 = SyncResultDto.parse((await request(ctx.http).post(`/v1/properties/${p.id}/sync`).set(...bearer(session)).expect(200)).body);
    expect(s1).toMatchObject({ status: 'OK', changed: false, bookingsImported: 2, error: null });

    // Reservation removed from the feed ⇒ CANCELLED; new one imported.
    ics.files['/calendar/ical/123.ics?s=secret'] = icsFeed([{ uid: 'r2@airbnb.com', start: addDays(today, 20), end: addDays(today, 22) }]);
    const s2 = SyncResultDto.parse((await request(ctx.http).post(`/v1/properties/${p.id}/sync`).set(...bearer(session)).expect(200)).body);
    expect(s2.changed).toBe(true);
    const after = await ctx.prisma.booking.findMany({ where: { propertyId: p.id }, orderBy: { checkIn: 'asc' } });
    expect(after.map((b) => [b.externalUid, b.status])).toEqual([
      ['r1@airbnb.com', 'CANCELLED'],
      ['b1@airbnb.com', 'CANCELLED'],
      ['r2@airbnb.com', 'BOOKED'],
    ]);
  });

  it('rejects links that are not iCal feeds', async () => {
    const p = PropertyDto.parse((await create().expect(201)).body);
    ics.files['/page.html'] = '<html>oi</html>';
    const r1 = await request(ctx.http).post(`/v1/properties/${p.id}/calendar-sources`).set(...bearer(session)).send({ url: ics.url('/page.html') }).expect(400);
    expect(r1.body.code).toBe('ICAL_INVALID');
    const r2 = await request(ctx.http).post(`/v1/properties/${p.id}/calendar-sources`).set(...bearer(session)).send({ url: ics.url('/missing.ics') }).expect(400);
    expect(r2.body.message).toMatch(/não existe mais/);
    const r3 = await request(ctx.http).post(`/v1/properties/${p.id}/calendar-sources`).set(...bearer(session)).send({ url: 'ftp://x.com/a.ics' }).expect(400);
    expect(r3.body.code).toBe('ICAL_INVALID');
  });

  it('marks the calendar ERROR after consecutive failures and audits ical.broken (RF-22)', async () => {
    const p = PropertyDto.parse((await create().expect(201)).body);
    ics.files['/flaky.ics'] = icsFeed([]);
    await request(ctx.http).post(`/v1/properties/${p.id}/calendar-sources`).set(...bearer(session)).send({ url: ics.url('/flaky.ics') }).expect(201);
    ics.files['/flaky.ics'] = 500;
    const r1 = SyncResultDto.parse((await request(ctx.http).post(`/v1/properties/${p.id}/sync`).set(...bearer(session)).expect(200)).body);
    expect(r1.status).toBe('OK');
    expect(r1.error).toMatch(/erro \(500\)/);
    await ctx.app.get(CalendarService).syncJob(p.id); // 2nd failure via the job handler
    const r3 = SyncResultDto.parse((await request(ctx.http).post(`/v1/properties/${p.id}/sync`).set(...bearer(session)).expect(200)).body);
    expect(r3.status).toBe('ERROR');
    const src = await ctx.prisma.calendarSource.findFirstOrThrow({ where: { propertyId: p.id } });
    expect(src.consecutiveErrors).toBe(3);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'ical.broken' } })).toBe(1);

    ics.files['/flaky.ics'] = icsFeed([]);
    const ok = SyncResultDto.parse((await request(ctx.http).post(`/v1/properties/${p.id}/sync`).set(...bearer(session)).expect(200)).body);
    expect(ok.status).toBe('OK');
  });

  it('registers devices (upsert by token)', async () => {
    const body = { expoPushToken: 'ExponentPushToken[abc123]', platform: 'ios' };
    await request(ctx.http).post('/v1/devices').set(...bearer(session)).send(body).expect(204);
    await request(ctx.http).post('/v1/devices').set(...bearer(session)).send({ ...body, platform: 'android' }).expect(204);
    const rows = await ctx.prisma.deviceToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.platform).toBe('android');
    await request(ctx.http).post('/v1/devices').set(...bearer(session)).send({ expoPushToken: 'bad', platform: 'ios' }).expect(400);
  });
});
