import { describe, expect, it } from 'vitest';
import { createClient, memoryTokenStore, PrecisariApiError } from '@precisari/api-client';
import {
  ActionDto,
  ActionsResponse,
  AdminHealthDto,
  AuthSession,
  CalendarSourceDto,
  CheckoutDto,
  EventDto,
  HolidayDto,
  InsightsDto,
  NightDetailDto,
  NightsResponse,
  PlaceDetailsDto,
  PlaceSuggestionDto,
  PlanDto,
  PropertyDto,
  SchoolVacationDto,
  SyncResultDto,
  UserDto,
} from '@precisari/shared';
import { z } from 'zod';
import { createMockFetch, MOCK_BASE_URL } from './mock-api';
import { addDays } from './dates';

const NOW = new Date('2026-11-09T12:00:00Z');

function setup(now: () => Date = () => NOW) {
  const tokens = memoryTokenStore();
  const fetch = createMockFetch({ now });
  const client = createClient({ baseUrl: MOCK_BASE_URL, tokens, fetch });
  return { client, tokens, fetch };
}

async function login(client: ReturnType<typeof setup>['client'], email = 'carla@exemplo.com.br') {
  await client.auth.requestOtp(email);
  return client.auth.verifyOtp({ email, code: '123456' });
}

describe('mock api — contract conformance', () => {
  it('auth: OTP accepts any 6 digits and returns a valid session', async () => {
    const { client, tokens } = setup();
    const s = await login(client);
    expect(AuthSession.safeParse(s).success).toBe(true);
    expect(tokens.getAccessToken()).toBeTruthy();
    expect(UserDto.parse(await client.me.get()).name).toBe('Carla');
  });

  it('auth: rejects 000000 with OTP_INVALID and unauthenticated calls with 401', async () => {
    const { client } = setup();
    await expect(client.auth.verifyOtp({ email: 'a@b.com', code: '000000' })).rejects.toMatchObject({ code: 'OTP_INVALID' });
    await expect(client.me.get()).rejects.toBeInstanceOf(PrecisariApiError);
  });

  it('auth: rotates refresh tokens when the access token expires', async () => {
    let now = NOW.getTime();
    const { client, tokens } = setup(() => new Date(now));
    await login(client);
    const firstRefresh = tokens.getRefreshToken();
    now += 16 * 60_000; // past the 15-min access TTL
    await client.me.get();
    expect(tokens.getRefreshToken()).not.toBe(firstRefresh);
  });

  it('properties, nights, night detail and insights match the schemas', async () => {
    const { client } = setup();
    await login(client);
    const props = z.array(PropertyDto).parse(await client.properties.list());
    expect(props[0]?.name).toBe('Studio do Campeche');
    const id = props[0]!.id;
    const nights = NightsResponse.parse(await client.properties.nights(id, { from: '2026-11-09', to: addDays('2026-11-09', 89) }));
    expect(nights.nights).toHaveLength(90);
    const prices = nights.nights.map((n) => n.suggestedPrice);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(19900);
    expect(Math.max(...prices)).toBeLessThanOrEqual(34900);
    expect(nights.nights.some((n) => n.status === 'booked')).toBe(true);
    expect(nights.nights.some((n) => n.isOrphan)).toBe(true);
    for (const n of nights.nights) expect(n.suggestedPrice % 1000 === 900 || n.suggestedPrice % 1000 === 500).toBe(true);
    const detail = NightDetailDto.parse(await client.properties.night(id, '2026-11-14'));
    expect(detail.suggestedPrice).toBe(34900);
    expect(detail.pendingActionId).toBe('act_1');
    expect(detail.weather).not.toBeNull();
    expect(detail.events.length).toBeGreaterThan(0);
    InsightsDto.parse(await client.properties.insights(id, '2026-11'));
    SyncResultDto.parse(await client.properties.sync(id));
  });

  it('actions: 3 pending totaling R$ 280; approve / dismiss / revert', async () => {
    const { client } = setup();
    await login(client);
    const list = ActionsResponse.parse(await client.actions.list({ status: 'PENDING' }));
    expect(list.items).toHaveLength(3);
    expect(list.totalEstimatedGain).toBe(28000);
    const first = list.items[0]!;
    expect(ActionDto.parse(await client.actions.approve(first.id)).status).toBe('APPROVED');
    const night = await client.properties.night(first.propertyId, first.date);
    expect(night.currentPrice).toBe(first.toValue);
    expect(ActionDto.parse(await client.actions.revert(first.id)).status).toBe('PENDING');
    expect(ActionDto.parse(await client.actions.dismiss(first.id)).status).toBe('DISMISSED');
    expect((await client.actions.list({ status: 'PENDING' })).items).toHaveLength(2);
  });

  it('onboarding: places, create property, connect calendar', async () => {
    const { client } = setup();
    await login(client);
    const sug = z.array(PlaceSuggestionDto).parse(await client.places.autocomplete('Rua das Gaivotas'));
    expect(sug.length).toBeGreaterThan(0);
    const place = PlaceDetailsDto.parse(await client.places.details(sug[0]!.placeId));
    const free = z.array(PlaceSuggestionDto).parse(await client.places.autocomplete('Rua Inventada 99'));
    PlaceDetailsDto.parse(await client.places.details(free[0]!.placeId));
    const p = PropertyDto.parse(
      await client.properties.create({
        name: 'Casa nova',
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        city: place.city,
        state: place.state,
        destinationType: place.suggestedDestinationType,
        capacity: 4,
        bedrooms: 2,
        basePrice: 30000,
        minPrice: 20000,
      }),
    );
    expect(p.maxPrice).toBe(90000);
    CalendarSourceDto.parse(await client.properties.connectCalendar(p.id, 'https://www.airbnb.com.br/calendar/ical/123.ics?s=abc'));
    await expect(client.properties.connectCalendar(p.id, 'https://example.com/foo')).rejects.toMatchObject({ code: 'ICAL_INVALID' });
    const nights = NightsResponse.parse(await client.properties.nights(p.id, { from: '2026-11-09', to: '2027-02-06' }));
    expect(nights.potentialGain).toBeGreaterThan(0);
    await expect(client.properties.create({} as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('billing: plans and checkout, subscription becomes ACTIVE', async () => {
    let now = NOW.getTime();
    const { client } = setup(() => new Date(now));
    await login(client);
    const plans = z.array(PlanDto).parse(await client.billing.plans());
    expect(plans.map((p) => p.monthlyPricePerProperty)).toEqual([0, 2990, 4490]);
    for (const method of ['PIX', 'CARD', 'BOLETO'] as const) {
      CheckoutDto.parse(await client.billing.checkout({ plan: 'PRO', paymentMethod: method, taxId: '52998224725' }));
    }
    now += 11_000;
    const me = await client.me.get();
    expect(me.subscription.status).toBe('ACTIVE');
  });

  it('me: update, export, delete', async () => {
    const { client } = setup();
    await login(client);
    expect((await client.me.update({ dailyNotificationHour: 8, emailWeeklySummary: false })).dailyNotificationHour).toBe(8);
    const data = (await client.me.export()) as { user: unknown };
    expect(UserDto.safeParse(data.user).success).toBe(true);
    await client.me.delete();
  });

  it('admin: requires ADMIN role; CRUD and health match schemas', async () => {
    const { client } = setup();
    await login(client);
    await expect(client.admin.health()).rejects.toMatchObject({ status: 403 });
    await login(client, 'admin@precisari.com.br');
    AdminHealthDto.parse(await client.admin.health());
    z.array(EventDto).parse(await client.admin.events.list());
    const e = EventDto.parse(
      await client.admin.events.create({ name: 'Show', city: 'Florianópolis', state: 'SC', lat: -27.6, lng: -48.5, startDate: '2026-12-05', endDate: '2026-12-05', size: 'G' }),
    );
    expect(EventDto.parse(await client.admin.events.update(e.id, { size: 'XG' })).size).toBe('XG');
    await client.admin.events.delete(e.id);
    z.array(HolidayDto).parse(await client.admin.holidays.list());
    const h = HolidayDto.parse(await client.admin.holidays.create({ date: '2026-12-08', scope: 'MUNICIPAL', state: 'SC', name: 'Nossa Senhora' }));
    HolidayDto.parse(await client.admin.holidays.update(h.id, { isBridge: true }));
    z.array(SchoolVacationDto).parse(await client.admin.schoolVacations.list());
    const v = SchoolVacationDto.parse(await client.admin.schoolVacations.create({ state: 'MG', startDate: '2026-12-20', endDate: '2027-02-01', year: 2026 }));
    SchoolVacationDto.parse(await client.admin.schoolVacations.update(v.id, { year: 2027 }));
  });
});
