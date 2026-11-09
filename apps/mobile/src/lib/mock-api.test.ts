import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createClient, memoryTokenStore, PrecisariApiError, type PrecisariClient } from '@precisari/api-client';
import {
  ActionDto,
  ActionsResponse,
  AuthSession,
  CalendarSourceDto,
  InsightsDto,
  NightDetailDto,
  NightsResponse,
  PlaceDetailsDto,
  PlaceSuggestionDto,
  PlanDto,
  PropertyDto,
  SyncResultDto,
  UserDto,
  type CreatePropertyBody,
} from '@precisari/shared';
import { createMockFetch } from './mock-api';
import { DEMO_PROPERTY_ID } from './mock-data';

const TODAY = '2026-11-09';
const BASE = 'http://mock.local';

/** Raw fetch to check payloads directly against the shared schemas (independent of the client). */
async function raw(f: typeof fetch, method: string, path: string, body?: unknown, token = 'mock-access-x') {
  const res = await f(`${BASE}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as unknown) : undefined };
}

describe('mock api — schema conformance', () => {
  let f: typeof fetch;
  beforeEach(() => {
    f = createMockFetch({ today: TODAY, latencyMs: 0 }) as typeof fetch;
  });

  it('auth', async () => {
    expect((await raw(f, 'POST', '/auth/otp/request', { email: 'carla@exemplo.com.br' })).status).toBe(204);
    const v = await raw(f, 'POST', '/auth/otp/verify', { email: 'carla@exemplo.com.br', code: '123456' });
    expect(() => AuthSession.parse(v.json)).not.toThrow();
    const bad = await raw(f, 'POST', '/auth/otp/verify', { email: 'carla@exemplo.com.br', code: '12' });
    expect(bad.status).toBe(400);
    expect(bad.json).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires a bearer token on private routes', async () => {
    const r = await raw(f, 'GET', '/me', undefined, 'nope');
    expect(r.status).toBe(401);
  });

  it('me, properties, nights, night detail, insights, places, plans', async () => {
    UserDto.parse((await raw(f, 'GET', '/me')).json);
    UserDto.parse((await raw(f, 'PATCH', '/me', { dailyNotificationHour: 8 })).json);
    const props = z.array(PropertyDto).parse((await raw(f, 'GET', '/properties')).json);
    expect(props[0]?.name).toBe('Studio do Campeche');
    PropertyDto.parse((await raw(f, 'GET', `/properties/${DEMO_PROPERTY_ID}`)).json);

    const nights = NightsResponse.parse((await raw(f, 'GET', `/properties/${DEMO_PROPERTY_ID}/nights`)).json);
    expect(nights.nights).toHaveLength(90);
    const free = nights.nights.filter((n) => n.status === 'free');
    expect(Math.min(...free.map((n) => n.suggestedPrice))).toBeGreaterThanOrEqual(19900);
    expect(Math.max(...nights.nights.map((n) => n.suggestedPrice))).toBeLessThanOrEqual(34900);
    expect(nights.nights.some((n) => n.status === 'booked')).toBe(true);
    expect(nights.potentialGain).toBe(28000);
    // Every price ends in 9 (whole reais).
    expect(nights.nights.every((n) => (n.suggestedPrice / 100) % 10 === 9)).toBe(true);

    for (const n of nights.nights.slice(0, 10)) {
      NightDetailDto.parse((await raw(f, 'GET', `/properties/${DEMO_PROPERTY_ID}/nights/${n.date}`)).json);
    }
    const hot = NightDetailDto.parse((await raw(f, 'GET', `/properties/${DEMO_PROPERTY_ID}/nights/2026-11-14`)).json);
    expect(hot.pendingActionId).toBe('act_1');
    expect(hot.events).toHaveLength(1);
    expect(hot.weather).not.toBeNull();

    InsightsDto.parse((await raw(f, 'GET', `/properties/${DEMO_PROPERTY_ID}/insights?month=2026-11`)).json);
    const sugg = z.array(PlaceSuggestionDto).parse((await raw(f, 'GET', '/places/autocomplete?q=campeche')).json);
    expect(sugg[0]?.placeId).toBe('place_campeche');
    PlaceDetailsDto.parse((await raw(f, 'GET', `/places/${sugg[0]!.placeId}`)).json);
    z.array(PlanDto).parse((await raw(f, 'GET', '/billing/plans')).json);
    SyncResultDto.parse((await raw(f, 'POST', `/properties/${DEMO_PROPERTY_ID}/sync`)).json);
    expect((await raw(f, 'GET', '/me/export')).status).toBe(200);
  });

  it('actions: 3 pending totaling R$ 280, approve / revert / dismiss', async () => {
    const list = ActionsResponse.parse((await raw(f, 'GET', '/actions?status=PENDING')).json);
    expect(list.items).toHaveLength(3);
    expect(list.totalEstimatedGain).toBe(28000);
    expect(list.items[0]?.date).toBe('2026-11-14');
    expect(list.items[0]).toMatchObject({ fromValue: 24900, toValue: 34900, headline: 'Sábado tá disputado.' });

    const approved = ActionDto.parse((await raw(f, 'POST', '/actions/act_1/approve')).json);
    expect(approved.status).toBe('APPROVED');
    const night = NightDetailDto.parse((await raw(f, 'GET', `/properties/${DEMO_PROPERTY_ID}/nights/2026-11-14`)).json);
    expect(night.currentPrice).toBe(34900);
    expect(night.pendingActionId).toBeNull();
    expect((await raw(f, 'POST', '/actions/act_1/approve')).status).toBe(409);

    const reverted = ActionDto.parse((await raw(f, 'POST', '/actions/act_1/revert')).json);
    expect(reverted.status).toBe('PENDING');
    ActionDto.parse((await raw(f, 'POST', '/actions/act_2/dismiss')).json);
    const after = ActionsResponse.parse((await raw(f, 'GET', '/actions?status=PENDING')).json);
    expect(after.items.map((a) => a.id)).toEqual(['act_1', 'act_3']);
    expect(after.totalEstimatedGain).toBe(18000);
  });

  it('onboarding: create property, connect iCal, get 90-day nights with potential gain', async () => {
    const body: CreatePropertyBody = {
      name: 'Casa na Serra',
      address: 'Rua Coberta, 120 - Centro, Gramado - RS',
      lat: -29.3787,
      lng: -50.8737,
      city: 'Gramado',
      state: 'RS',
      destinationType: 'MOUNTAIN',
      capacity: 4,
      bedrooms: 2,
      basePrice: 30000,
      minPrice: 22000,
      cleaningFee: 15000,
    };
    const created = await raw(f, 'POST', '/properties', body);
    expect(created.status).toBe(201);
    const p = PropertyDto.parse(created.json);
    expect(p.maxPrice).toBe(90000);
    const bad = await raw(f, 'POST', `/properties/${p.id}/calendar-sources`, { url: 'https://example.com/foo' });
    expect(bad.json).toMatchObject({ code: 'ICAL_INVALID' });
    CalendarSourceDto.parse(
      (await raw(f, 'POST', `/properties/${p.id}/calendar-sources`, { url: 'https://www.airbnb.com.br/calendar/ical/1.ics?s=x' })).json,
    );
    const n = NightsResponse.parse((await raw(f, 'GET', `/properties/${p.id}/nights`)).json);
    expect(n.potentialGain).toBeGreaterThan(0);
    expect(n.nights.every((x) => x.suggestedPrice >= 22000)).toBe(true);
    const invalid = await raw(f, 'POST', '/properties', { ...body, minPrice: 99999 });
    expect(invalid.status).toBe(400);
    expect((await raw(f, 'DELETE', `/properties/${p.id}`)).status).toBe(204);
  });
});

describe('mock api through the typed api-client', () => {
  let client: PrecisariClient;
  beforeEach(() => {
    client = createClient({ baseUrl: BASE, tokens: memoryTokenStore(), fetch: createMockFetch({ today: TODAY, latencyMs: 0 }) as typeof fetch });
  });

  it('signs in with any 6 digits and reads data (client validates with Zod)', async () => {
    await client.auth.requestOtp('carla@exemplo.com.br');
    const s = await client.auth.verifyOtp({ email: 'carla@exemplo.com.br', code: '482913' });
    expect(s.user.name).toBe('Carla Souza');
    const actions = await client.actions.list({ status: 'PENDING' });
    expect(actions.totalEstimatedGain).toBe(28000);
    const props = await client.properties.list();
    const nights = await client.properties.nights(props[0]!.id, { from: TODAY, to: '2027-05-07' });
    expect(nights.nights).toHaveLength(180);
    await client.devices.register({ expoPushToken: 'ExponentPushToken[abc]', platform: 'ios' });
  });

  it('surfaces API errors as PrecisariApiError', async () => {
    await client.auth.verifyOtp({ email: 'carla@exemplo.com.br', code: '123456' });
    await expect(client.properties.get('nope')).rejects.toBeInstanceOf(PrecisariApiError);
  });
});
