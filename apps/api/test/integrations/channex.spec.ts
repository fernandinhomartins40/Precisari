import './env-setup';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { BillingModule } from '../../src/billing/billing.module';
import { ChannexService, FULL_SYNC_DAYS } from '../../src/billing/channex.service';
import { CommonModule } from '../../src/common/common.module';
import { addDays, todayInTz } from '../../src/common/dates';
import { UsersModule } from '../../src/users/users.module';
import { createProperty, createTestApp, createUser, resetDb, tokenFor, type TestApp } from './helpers';

describe('Channex: Airbnb link, price push and bookings (RF-23/RF-43)', () => {
  let t: TestApp;
  let user: User;
  let auth: { Authorization: string };
  const http = () => request(t.app.getHttpServer());
  const connect = (propertyId: string) => http().post('/v1/integrations/channex/connect').set(auth).send({ propertyId });
  const cxId = (propertyId: string) => `fake-channex-${propertyId}`;
  const night = (iso: string) => new Date(`${iso}T00:00:00Z`);

  beforeAll(async () => {
    t = await createTestApp([CommonModule, BillingModule, UsersModule]);
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    for (const list of [t.fakes.channex.pushed, t.fakes.channex.connected, t.fakes.channex.revisions, t.fakes.channex.deleted]) list.length = 0;
    t.fakes.channex.unlinked.clear();
    user = await createUser(t.prisma);
    auth = { Authorization: `Bearer ${await tokenFor(user)}` };
  });

  it('connect: paid plans only, provisions once and returns the Airbnb link screen', async () => {
    const prop = await createProperty(t.prisma, user.id);
    const free = await connect(prop.id);
    expect(free.status).toBe(403);
    expect(free.body.code).toBe('PLAN_LIMIT');

    await t.prisma.subscription.create({ data: { userId: user.id, plan: 'PRO', status: 'ACTIVE' } });
    t.fakes.channex.unlinked.add(cxId(prop.id));
    const ok = await connect(prop.id).expect(200);
    expect(ok.body).toMatchObject({ propertyId: prop.id, state: 'PENDING_LINK', connectUrl: `about:blank#channex-${cxId(prop.id)}` });
    expect(t.fakes.channex.connected[0]).toMatchObject({ capacity: 4, basePriceCents: 25900, webhook: { secret: 'test-channex-secret' } });
    // Reopening the screen does not create a second Channex property; nothing is pushed before Airbnb is linked.
    await connect(prop.id).expect(200);
    expect(t.fakes.channex.connected).toHaveLength(1);
    await t.app.get(ChannexService).push(prop.id);
    expect(t.fakes.channex.pushed).toHaveLength(0);
    const sources = await t.prisma.calendarSource.findMany({ where: { propertyId: prop.id } });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ type: 'CHANNEX', channexRatePlanId: `fake-rate-${prop.id}`, channexLinkedAt: null });

    const stranger = await createUser(t.prisma);
    await t.prisma.subscription.create({ data: { userId: stranger.id, plan: 'AUTO', status: 'TRIALING' } });
    const notMine = await http().post('/v1/integrations/channex/connect').set('Authorization', `Bearer ${await tokenFor(stranger)}`).send({ propertyId: prop.id });
    expect(notMine.status).toBe(404);
  });

  it('once linked: full 500-day push, then only changed nights; approved becomes APPLIED; disconnect cleans up', async () => {
    const prop = await createProperty(t.prisma, user.id);
    await t.prisma.subscription.create({ data: { userId: user.id, plan: 'PRO', status: 'ACTIVE' } });
    await connect(prop.id).expect(200);

    // The status check sees the active Airbnb channel and queues the whole calendar at the known (base) price.
    t.enqueued.length = 0;
    const linked = await http().get(`/v1/integrations/channex/${prop.id}`).set(auth).expect(200);
    expect(linked.body.state).toBe('LINKED');
    expect(t.enqueued).toMatchObject([{ queue: 'channex.push', data: { propertyId: prop.id } }]);
    await t.app.get(ChannexService).push(prop.id);
    expect(t.fakes.channex.pushed).toHaveLength(1);
    const full = t.fakes.channex.pushed[0]!.rates;
    expect(full).toHaveLength(FULL_SYNC_DAYS);
    expect(full.every((r) => r.priceCents === 25900 && r.minStay >= 1)).toBe(true);

    const date = full[3]!.date;
    const action = await t.prisma.action.create({
      data: { propertyId: prop.id, date: night(date), type: 'PRICE', fromValue: 25900, toValue: 31900, estimatedGain: 6000, status: 'APPROVED', decidedAt: new Date() },
    });
    await t.app.get(ChannexService).push(prop.id);
    expect(t.fakes.channex.pushed[1]!.rates).toEqual([{ date, priceCents: 31900, minStay: full[3]!.minStay }]);
    expect((await t.prisma.action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe('APPLIED');
    await t.app.get(ChannexService).push(prop.id);
    expect(t.fakes.channex.pushed[2]!.rates).toEqual([]);
    expect((await http().get(`/v1/integrations/channex/${prop.id}`).set(auth).expect(200)).body.lastSyncAt).not.toBeNull();

    const gone = await http().delete(`/v1/integrations/channex/${prop.id}`).set(auth).expect(200);
    expect(gone.body.state).toBe('DISCONNECTED');
    expect(t.fakes.channex.deleted).toEqual([cxId(prop.id)]);
    expect(await t.prisma.calendarSource.count({ where: { propertyId: prop.id } })).toBe(0);
  });

  it('AUTO plan applies pending suggestions without approval', async () => {
    const prop = await createProperty(t.prisma, user.id);
    await t.prisma.subscription.create({ data: { userId: user.id, plan: 'AUTO', status: 'ACTIVE' } });
    await connect(prop.id).expect(200);
    const date = addDays(todayInTz(prop.timezone), 2);
    const pending = await t.prisma.action.create({ data: { propertyId: prop.id, date: night(date), type: 'PRICE', fromValue: 25900, toValue: 29900, estimatedGain: 4000 } });
    await t.app.get(ChannexService).push(prop.id);
    expect((await t.prisma.action.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('APPLIED');
    expect(t.fakes.channex.pushed.at(-1)!.rates.find((r) => r.date === date)?.priceCents).toBe(29900);
  });

  it('webhook needs the secret; bookings come from the revisions feed and every revision is acknowledged', async () => {
    const prop = await createProperty(t.prisma, user.id);
    await t.prisma.subscription.create({ data: { userId: user.id, plan: 'PRO', status: 'ACTIVE' } });
    await connect(prop.id).expect(200);
    t.fakes.channex.revisions.push(
      { id: 'rev1', channexPropertyId: cxId(prop.id), bookingId: 'bk1', status: 'new', arrivalDate: '2026-12-10', departureDate: '2026-12-13', amountCents: 139500 },
      { id: 'rev2', channexPropertyId: 'someone-else', bookingId: 'bk9', status: 'new', arrivalDate: '2026-12-10', departureDate: '2026-12-11', amountCents: null },
    );

    expect((await http().post('/v1/integrations/channex/webhook').send({ event: 'booking' })).status).toBe(401);
    expect((await http().post('/v1/integrations/channex/webhook').set('x-precisari-secret', 'wrong').send({})).status).toBe(401);
    t.enqueued.length = 0;
    await http().post('/v1/integrations/channex/webhook').set('x-precisari-secret', 'test-channex-secret').send({ event: 'booking' }).expect(202);
    expect(t.enqueued.map((e) => e.queue)).toEqual(['channex.bookings']);
    await t.app.get(ChannexService).pullBookings();
    expect(t.enqueued.map((e) => e.queue)).toContain('pricing.recompute');

    expect(t.fakes.channex.revisions).toHaveLength(0);
    const bookings = await t.prisma.booking.findMany({ where: { propertyId: prop.id } });
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ source: 'channex', externalUid: 'bk1', status: 'BOOKED', revenue: 139500 });

    t.fakes.channex.revisions.push({ id: 'rev3', channexPropertyId: cxId(prop.id), bookingId: 'bk1', status: 'cancelled', arrivalDate: '2026-12-10', departureDate: '2026-12-13', amountCents: 0 });
    await t.app.get(ChannexService).pullBookings();
    expect((await t.prisma.booking.findFirstOrThrow({ where: { externalUid: 'bk1' } })).status).toBe('CANCELLED');
  });
});
