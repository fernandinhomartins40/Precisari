import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ActionDto, ActionsResponse, InsightsDto, NightDetailDto, NightsResponse, PropertyDto, type AuthSession } from '@precisari/shared';
import { addDays, isoToDate, monthOf, todayInTz } from '../src/common/dates';
import { weatherGrid } from '../src/common/geo';
import { PricingService } from '../src/pricing/pricing.service';
import { bearer, createTestApp, login, propertyBody, resetDb, type TestContext } from './helpers';

describe('nights, actions and insights (integration)', () => {
  let ctx: TestContext;
  let session: AuthSession;
  let property: PropertyDto;
  const today = todayInTz('America/Sao_Paulo');

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    session = await login(ctx, 'carla@precisari.dev');
    const eventDay = addDays(today, 9);
    await ctx.prisma.holiday.create({ data: { date: isoToDate(addDays(today, 12)), scope: 'NATIONAL', name: 'Feriado de teste' } });
    await ctx.prisma.event.create({
      data: { name: 'Show na praia', city: 'Florianópolis', state: 'SC', lat: -27.67, lng: -48.48, startDate: isoToDate(eventDay), endDate: isoToDate(eventDay), size: 'G', radiusKm: 5, verified: true },
    });
    await ctx.prisma.event.create({
      data: { name: 'Evento longe', city: 'São Paulo', state: 'SP', lat: -23.55, lng: -46.63, startDate: isoToDate(eventDay), endDate: isoToDate(eventDay), size: 'XG', radiusKm: 5 },
    });
    await ctx.prisma.weatherForecast.create({
      data: { lat: weatherGrid(-27.6789), lng: weatherGrid(-48.4867), date: isoToDate(addDays(today, 2)), precipProb: 85, precipMm: 30, tempMin: 18, tempMax: 24 },
    });
    // A booking leaving a 1-night orphan gap.
    await ctx.prisma.property.deleteMany();
    property = PropertyDto.parse((await request(ctx.http).post('/v1/properties').set(...bearer(session)).send(propertyBody()).expect(201)).body);
    await ctx.prisma.booking.createMany({
      data: [
        { propertyId: property.id, externalUid: 'a', checkIn: isoToDate(addDays(today, 4)), checkOut: isoToDate(addDays(today, 6)), status: 'BOOKED' },
        { propertyId: property.id, externalUid: 'b', checkIn: isoToDate(addDays(today, 7)), checkOut: isoToDate(addDays(today, 9)), status: 'BOOKED' },
      ],
    });
    await ctx.app.get(PricingService).recompute(property.id);
  });
  afterAll(async () => ctx.close());

  it('GET nights returns the heat map for the plan horizon with potential gain', async () => {
    const res = await request(ctx.http).get(`/v1/properties/${property.id}/nights`).set(...bearer(session)).expect(200);
    const body = NightsResponse.parse(res.body);
    expect(body.from).toBe(today);
    expect(body.nights).toHaveLength(30);
    expect(body.nights[0]?.currentPrice).toBe(24900);
    expect(body.nights.find((n) => n.date === addDays(today, 4))?.status).toBe('booked');
    expect(body.nights.find((n) => n.date === addDays(today, 6))?.isOrphan).toBe(true);
    for (const n of body.nights) {
      expect(n.suggestedPrice).toBeGreaterThanOrEqual(18000);
      expect(n.suggestedPrice).toBeLessThanOrEqual(74700);
    }
    const expectedGain = body.nights.filter((n) => n.status === 'free').reduce((s, n) => s + Math.max(0, n.suggestedPrice - n.currentPrice), 0);
    expect(body.potentialGain).toBe(expectedGain);

    const ranged = NightsResponse.parse(
      (await request(ctx.http).get(`/v1/properties/${property.id}/nights`).query({ from: addDays(today, 5), to: addDays(today, 7) }).set(...bearer(session)).expect(200)).body,
    );
    expect(ranged.nights.map((n) => n.date)).toEqual([addDays(today, 5), addDays(today, 6), addDays(today, 7)]);
    await request(ctx.http).get(`/v1/properties/${property.id}/nights`).query({ from: addDays(today, 5), to: today }).set(...bearer(session)).expect(400);
  });

  it('computes lazily when nothing was computed yet (onboarding)', async () => {
    await ctx.prisma.nightPrice.deleteMany();
    const res = await request(ctx.http).get(`/v1/properties/${property.id}/nights`).set(...bearer(session)).expect(200);
    expect(res.body.nights).toHaveLength(30);
  });

  it('GET night detail includes weather, nearby events and holidays', async () => {
    const rainy = NightDetailDto.parse((await request(ctx.http).get(`/v1/properties/${property.id}/nights/${addDays(today, 2)}`).set(...bearer(session)).expect(200)).body);
    expect(rainy.weather).toMatchObject({ precipProb: 85, condition: 'storm' });
    expect(rainy.minPrice).toBe(18000);
    expect(rainy.maxPrice).toBe(74700);

    const ev = NightDetailDto.parse((await request(ctx.http).get(`/v1/properties/${property.id}/nights/${addDays(today, 9)}`).set(...bearer(session)).expect(200)).body);
    expect(ev.events.map((e) => e.name)).toEqual(['Show na praia']);
    expect(ev.events[0]?.distanceKm).toBeLessThan(3);

    const hol = NightDetailDto.parse((await request(ctx.http).get(`/v1/properties/${property.id}/nights/${addDays(today, 12)}`).set(...bearer(session)).expect(200)).body);
    expect(hol.holidays).toEqual([{ date: addDays(today, 12), name: 'Feriado de teste' }]);

    await request(ctx.http).get(`/v1/properties/${property.id}/nights/${addDays(today, 200)}`).set(...bearer(session)).expect(404);
    await request(ctx.http).get(`/v1/properties/${property.id}/nights/amanha`).set(...bearer(session)).expect(400);
  });

  it('generates actions with explanations, ordered by gain, without duplicates on recompute', async () => {
    const res = await request(ctx.http).get('/v1/actions').query({ status: 'PENDING' }).set(...bearer(session)).expect(200);
    const body = ActionsResponse.parse(res.body);
    expect(body.items.length).toBeGreaterThan(0);
    for (const a of body.items) {
      expect(a.headline.length).toBeGreaterThan(0);
      expect(a.explanation.length).toBeGreaterThan(0);
      expect(a.propertyName).toBe('Studio do Campeche');
      expect(a.withinLimits).toBe(true);
    }
    const gains = body.items.map((a) => a.estimatedGain);
    expect(gains).toEqual([...gains].sort((x, y) => y - x));
    expect(body.totalEstimatedGain).toBe(gains.reduce((s, g) => s + g, 0));
    expect(body.items.some((a) => a.type === 'ORPHAN' && a.date === addDays(today, 6))).toBe(true);

    const before = await ctx.prisma.action.count();
    await ctx.app.get(PricingService).recompute(property.id);
    expect(await ctx.prisma.action.count()).toBe(before);
    const dupes = await ctx.prisma.action.groupBy({ by: ['propertyId', 'date', 'type'], where: { status: 'PENDING' }, _count: { _all: true } });
    expect(dupes.every((d) => d._count._all === 1)).toBe(true);
  });

  it('paginates actions with a cursor', async () => {
    const all = ActionsResponse.parse((await request(ctx.http).get('/v1/actions').query({ limit: 100 }).set(...bearer(session)).expect(200)).body);
    const first = ActionsResponse.parse((await request(ctx.http).get('/v1/actions').query({ limit: 2 }).set(...bearer(session)).expect(200)).body);
    expect(first.items).toHaveLength(Math.min(2, all.items.length));
    if (all.items.length > 2) {
      expect(first.nextCursor).not.toBeNull();
      const second = ActionsResponse.parse(
        (await request(ctx.http).get('/v1/actions').query({ limit: 2, cursor: first.nextCursor ?? '' }).set(...bearer(session)).expect(200)).body,
      );
      expect(second.items.map((a) => a.id)).toEqual(all.items.slice(2, 4).map((a) => a.id));
    }
  });

  it('approve / dismiss / revert with idempotency and history', async () => {
    const list = ActionsResponse.parse((await request(ctx.http).get('/v1/actions').query({ status: 'PENDING' }).set(...bearer(session)).expect(200)).body);
    const priceAction = list.items.find((a) => a.type !== 'MIN_STAY');
    if (!priceAction) throw new Error('expected a price action');

    const key = 'approve-key-1';
    const a1 = await request(ctx.http).post(`/v1/actions/${priceAction.id}/approve`).set(...bearer(session)).set('Idempotency-Key', key).expect(200);
    expect(ActionDto.parse(a1.body).status).toBe('APPROVED');
    // Same key ⇒ replayed response (not a 409).
    const a2 = await request(ctx.http).post(`/v1/actions/${priceAction.id}/approve`).set(...bearer(session)).set('Idempotency-Key', key).expect(200);
    expect(a2.headers['idempotent-replayed']).toBe('true');
    expect(a2.body).toEqual(a1.body);
    // New key ⇒ already decided.
    const conflict = await request(ctx.http).post(`/v1/actions/${priceAction.id}/approve`).set(...bearer(session)).set('Idempotency-Key', 'k2').expect(409);
    expect(conflict.body.code).toBe('CONFLICT');

    // Approval updates the current known price for that night.
    const night = NightDetailDto.parse((await request(ctx.http).get(`/v1/properties/${property.id}/nights/${priceAction.date}`).set(...bearer(session)).expect(200)).body);
    expect(night.currentPrice).toBe(priceAction.toValue);

    const reverted = ActionDto.parse((await request(ctx.http).post(`/v1/actions/${priceAction.id}/revert`).set(...bearer(session)).expect(200)).body);
    expect(reverted.status).toBe('PENDING'); // undo brings the card back
    const night2 = NightDetailDto.parse((await request(ctx.http).get(`/v1/properties/${property.id}/nights/${priceAction.date}`).set(...bearer(session)).expect(200)).body);
    expect(night2.currentPrice).toBe(24900);

    const other = list.items.find((a) => a.id !== priceAction.id);
    if (other) {
      const d = ActionDto.parse((await request(ctx.http).post(`/v1/actions/${other.id}/dismiss`).set(...bearer(session)).expect(200)).body);
      expect(d.status).toBe('DISMISSED');
      // Dismissed plans are not re-proposed by the next recompute.
      await ctx.app.get(PricingService).recompute(property.id);
      expect(await ctx.prisma.action.count({ where: { date: isoToDate(other.date), type: other.type, status: 'PENDING' } })).toBe(0);
      const undo = ActionDto.parse((await request(ctx.http).post(`/v1/actions/${other.id}/revert`).set(...bearer(session)).expect(200)).body);
      expect(undo.status).toBe('PENDING');
    }

    const history = await ctx.prisma.auditLog.findMany({ where: { action: { startsWith: 'action.' } }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.action)).toEqual(['action.approve', 'action.revert', ...(other ? ['action.dismiss', 'action.revert'] : [])]);

    const stranger = await login(ctx, 'rafael@precisari.dev');
    await request(ctx.http).post(`/v1/actions/${priceAction.id}/dismiss`).set(...bearer(stranger)).expect(404);
  });

  it('insights for the current month', async () => {
    const res = await request(ctx.http).get(`/v1/properties/${property.id}/insights`).set(...bearer(session)).expect(200);
    const body = InsightsDto.parse(res.body);
    expect(body.current.month).toBe(monthOf(today));
    expect(body.history).toHaveLength(6);
    expect(body.history[5]).toEqual(body.current);
    // Nothing stays approved after the revert above, so occupied nights earn the base price, not the suggestion.
    if (body.current.adr > 0) expect(body.current.adr).toBe(property.basePrice);
    await request(ctx.http).get(`/v1/properties/${property.id}/insights`).query({ month: '2026-13' }).set(...bearer(session)).expect(400);
  });
});
