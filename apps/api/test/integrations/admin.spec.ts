import './env-setup';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { AdminModule } from '../../src/admin/admin.module';
import { PlacesModule } from '../../src/places/places.module';
import { createProperty, createTestApp, createUser, resetDb, tokenFor, type TestApp } from './helpers';

describe('Admin API (RF-80/81/82)', () => {
  let t: TestApp;
  let admin: User;
  let user: User;
  let adminToken: string;
  let userToken: string;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp([AdminModule, PlacesModule]);
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.enqueued.length = 0;
    t.fakes.push.sent.length = 0;
    admin = await createUser(t.prisma, { role: 'ADMIN' });
    user = await createUser(t.prisma);
    adminToken = await tokenFor(admin);
    userToken = await tokenFor(user);
  });

  it('enforces RBAC: 401 without token, 403 for USER', async () => {
    expect((await http().get('/v1/admin/events')).status).toBe(401);
    const r = await http().get('/v1/admin/events').set('Authorization', `Bearer ${userToken}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN');
    expect((await http().post('/v1/admin/seed').set('Authorization', `Bearer ${userToken}`)).status).toBe(403);
    expect((await http().get('/v1/admin/health').set('Authorization', `Bearer ${userToken}`)).status).toBe(403);
  });

  it('CRUDs events with filters, audit log, recompute and alerts', async () => {
    const prop = await createProperty(t.prisma, user.id);
    await t.prisma.deviceToken.create({ data: { userId: user.id, expoPushToken: 'ExponentPushToken[u1]', platform: 'ios' } });
    const auth = { Authorization: `Bearer ${adminToken}` };
    const start = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

    const bad = await http().post('/v1/admin/events').set(auth).send({ name: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');

    const created = await http().post('/v1/admin/events').set(auth).send({
      name: 'Show na Arena', city: 'florianópolis', state: 'SC', lat: -27.6, lng: -48.5, startDate: start, endDate: start, size: 'G',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Show na Arena', radiusKm: 5, source: 'manual', verified: false, startDate: start });
    expect(t.enqueued).toHaveLength(0); // unverified: no price impact

    const list = await http().get('/v1/admin/events').query({ city: 'Florianópolis', verified: 'false' }).set(auth);
    expect(list.body).toHaveLength(1);
    expect((await http().get('/v1/admin/events').query({ state: 'RJ' }).set(auth)).body).toHaveLength(0);
    expect((await http().get('/v1/admin/events').query({ to: '2020-01-01' }).set(auth)).body).toHaveLength(0);

    const verified = await http().patch(`/v1/admin/events/${created.body.id}`).set(auth).send({ verified: true });
    expect(verified.status).toBe(200);
    expect(verified.body.verified).toBe(true);
    expect(t.enqueued).toEqual([expect.objectContaining({ queue: 'pricing.recompute', data: { propertyId: prop.id, reason: 'event' } })]);
    expect(t.fakes.push.sent).toHaveLength(1);
    expect(t.fakes.push.sent[0]?.title).toBe('Evento detectado');

    // re-saving does not alert twice
    await http().patch(`/v1/admin/events/${created.body.id}`).set(auth).send({ radiusKm: 8 });
    expect(t.fakes.push.sent).toHaveLength(1);

    const badRange = await http().patch(`/v1/admin/events/${created.body.id}`).set(auth).send({ endDate: '2020-01-01' });
    expect(badRange.status).toBe(400);

    const del = await http().delete(`/v1/admin/events/${created.body.id}`).set(auth);
    expect(del.status).toBe(204);
    expect((await http().delete(`/v1/admin/events/${created.body.id}`).set(auth)).status).toBe(404);

    const audits = await t.prisma.auditLog.findMany({ where: { userId: admin.id }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((a) => a.action)).toEqual(['admin.event.create', 'admin.event.update', 'admin.event.update', 'admin.event.delete']);
  });

  it('CRUDs holidays with scope validation and recompute by state', async () => {
    const sc = await createProperty(t.prisma, user.id);
    await createProperty(t.prisma, user.id, { state: 'RJ', city: 'Rio de Janeiro' });
    const auth = { Authorization: `Bearer ${adminToken}` };

    expect((await http().post('/v1/admin/holidays').set(auth).send({ date: '2027-08-11', scope: 'STATE', name: 'Data Magna' })).status).toBe(400);

    const created = await http().post('/v1/admin/holidays').set(auth).send({ date: '2027-08-11', scope: 'STATE', state: 'SC', name: 'Data Magna' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ scope: 'STATE', state: 'SC', ibgeCode: null, kind: 'REGULAR', isBridge: false });
    expect(t.enqueued.map((e) => e.data)).toEqual([{ propertyId: sc.id, reason: 'holiday' }]);

    const dup = await http().post('/v1/admin/holidays').set(auth).send({ date: '2027-08-11', scope: 'STATE', state: 'SC', name: 'Data Magna' });
    expect(dup.status).toBe(409);

    await http().post('/v1/admin/holidays').set(auth).send({ date: '2027-09-07', scope: 'NATIONAL', state: 'SP', name: 'Independência' });
    const list = await http().get('/v1/admin/holidays').query({ state: 'SC', year: 2027 }).set(auth);
    expect(list.body.map((h: { name: string; state: string | null }) => [h.name, h.state])).toEqual([
      ['Data Magna', 'SC'],
      ['Independência', null],
    ]);
    expect((await http().get('/v1/admin/holidays').query({ scope: 'NATIONAL' }).set(auth)).body).toHaveLength(1);

    const patched = await http().patch(`/v1/admin/holidays/${created.body.id}`).set(auth).send({ isBridge: true, name: 'Dia de SC' });
    expect(patched.body).toMatchObject({ isBridge: true, name: 'Dia de SC' });
    expect((await http().delete(`/v1/admin/holidays/${created.body.id}`).set(auth)).status).toBe(204);
  });

  it('CRUDs school vacations', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const origin = await createProperty(t.prisma, user.id, { state: 'SC', rulesConfig: { enabled: {}, schoolVacationState: 'SP' } });
    const c = await http().post('/v1/admin/school-vacations').set(auth).send({ state: 'SP', startDate: '2027-07-03', endDate: '2027-07-25', year: 2027 });
    expect(c.status).toBe(201);
    expect(t.enqueued.map((e) => e.data)).toEqual([{ propertyId: origin.id, reason: 'school-vacation' }]);
    expect((await http().post('/v1/admin/school-vacations').set(auth).send({ state: 'SP', startDate: '2027-07-25', endDate: '2027-07-03', year: 2027 })).status).toBe(400);
    expect((await http().get('/v1/admin/school-vacations').query({ state: 'SP', year: 2027 }).set(auth)).body).toHaveLength(1);
    const u = await http().patch(`/v1/admin/school-vacations/${c.body.id}`).set(auth).send({ endDate: '2027-07-31' });
    expect(u.body.endDate).toBe('2027-07-31');
    expect((await http().delete(`/v1/admin/school-vacations/${c.body.id}`).set(auth)).status).toBe(204);
  });

  it('seeds curated data idempotently', async () => {
    const auth = { Authorization: `Bearer ${adminToken}` };
    const first = await http().post('/v1/admin/seed').set(auth);
    expect(first.status).toBe(200);
    expect(first.body.stateHolidays).toBeGreaterThan(40);
    expect(first.body.municipalHolidays).toBeGreaterThan(10);
    expect(first.body.schoolVacations).toBe(27 * 4);
    expect(first.body.nationalHolidays).toBeGreaterThan(20);
    const second = await http().post('/v1/admin/seed').set(auth);
    expect(second.body).toEqual({ stateHolidays: 0, municipalHolidays: 0, schoolVacations: 0, nationalHolidays: 0 });
    const year = new Date().getUTCFullYear();
    const sp = await t.prisma.holiday.findFirst({ where: { scope: 'STATE', state: 'SP', name: 'Revolução Constitucionalista', date: new Date(`${year}-07-09T00:00:00Z`) } });
    expect(sp).not.toBeNull();
    const floripa = await t.prisma.holiday.count({ where: { scope: 'MUNICIPAL', ibgeCode: '4205407' } });
    expect(floripa).toBe(4);
  });

  it('reports health with integrations, jobs and broken calendars', async () => {
    const prop = await createProperty(t.prisma, user.id);
    await t.prisma.calendarSource.create({ data: { propertyId: prop.id, status: 'ERROR', lastError: '404' } });
    await t.prisma.calendarSource.create({ data: { propertyId: prop.id, status: 'OK' } });
    const r = await http().get('/v1/admin/health').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.brokenCalendars).toBe(1);
    const names = r.body.integrations.map((i: { name: string }) => i.name);
    expect(names).toEqual(['email', 'holidays', 'weather', 'geo', 'llm', 'push', 'billing', 'channex', 'redis']);
    expect(r.body.integrations.every((i: { provider: string }) => typeof i.provider === 'string')).toBe(true);
    expect(Array.isArray(r.body.jobs)).toBe(true);
    const redis = r.body.integrations.find((i: { name: string }) => i.name === 'redis');
    if (redis.ok) expect(r.body.jobs.map((j: { name: string }) => j.name)).toContain('weather.refresh');
    else expect(r.body.jobs).toEqual([]);
  });
});

describe('Places API', () => {
  let t: TestApp;
  let token: string;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp([PlacesModule]);
    await resetDb(t.prisma);
    token = await tokenFor(await createUser(t.prisma));
  });
  afterAll(async () => t.close());

  it('requires auth and validates the query', async () => {
    expect((await http().get('/v1/places/autocomplete').query({ q: 'gramado' })).status).toBe(401);
    expect((await http().get('/v1/places/autocomplete').query({ q: 'g' }).set('Authorization', `Bearer ${token}`)).status).toBe(400);
  });

  it('returns suggestions and details in the shared shape', async () => {
    const s = await http().get('/v1/places/autocomplete').query({ q: 'Gramado' }).set('Authorization', `Bearer ${token}`);
    expect(s.status).toBe(200);
    expect(s.body).toEqual([{ placeId: 'fake-gramado', description: 'Av. Borges de Medeiros, 2500 - Centro, Gramado - RS' }]);
    const d = await http().get('/v1/places/fake-gramado').set('Authorization', `Bearer ${token}`);
    expect(d.body).toMatchObject({ placeId: 'fake-gramado', city: 'Gramado', state: 'RS', suggestedDestinationType: 'MOUNTAIN' });
    const nf = await http().get('/v1/places/unknown').set('Authorization', `Bearer ${token}`);
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe('NOT_FOUND');
  });
});
