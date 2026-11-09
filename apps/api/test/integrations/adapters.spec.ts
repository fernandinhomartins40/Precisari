import { describe, expect, it } from 'vitest';
import { ResendEmailSender } from '../../src/integrations/email/resend.adapter';
import { splitFrom, VelomailEmailSender } from '../../src/integrations/email/velomail.adapter';
import { icalBrokenEmail, otpEmail, weeklySummaryEmail } from '../../src/integrations/email/templates';
import { BrasilApiHolidaysProvider } from '../../src/integrations/holidays/brasilapi.adapter';
import { FakeHolidaysProvider } from '../../src/integrations/holidays/holidays.fake';
import { OpenMeteoWeatherProvider } from '../../src/integrations/weather/open-meteo.adapter';
import { GooglePlacesGeoProvider } from '../../src/integrations/geo/google-places.adapter';
import { inferDestinationType } from '../../src/integrations/geo/destination-type';
import { FakeGeoProvider } from '../../src/integrations/geo/geo.fake';
import { ExpoPushProvider } from '../../src/integrations/push/expo.adapter';
import { ChannexHttpProvider, toRanges } from '../../src/integrations/channex/channex.adapter';
import { FakeBillingProvider, signFakeWebhook } from '../../src/integrations/billing/fake-billing.adapter';
import { IntegrationError } from '../../src/integrations/common/http';
import { TtlCache } from '../../src/integrations/common/ttl-cache';
import { easterSunday, localDateHour } from '../../src/integrations/common/text';
import { adapterFactories } from '../../src/integrations/integrations.module';
import { loadEnv } from '../../src/config/env';
import { json, mockFetch } from './mock-fetch';

describe('VeloMail email adapter', () => {
  it('posts with x-api-key and splits the sender into address and name', async () => {
    const { fetchFn, calls } = mockFetch(json({ message_id: 'm_1' }));
    const sender = new VelomailEmailSender('re_key', 'Precisari <ola@precisari.com.br>', 'https://vm.test/api/', fetchFn);
    await sender.send(otpEmail('ana@example.com', '123456'));
    expect(calls[0]?.url).toBe('https://vm.test/api/emails/send');
    expect(calls[0]?.headers['x-api-key']).toBe('re_key');
    expect(calls[0]?.body).toMatchObject({ from: 'ola@precisari.com.br', from_name: 'Precisari', to: 'ana@example.com', subject: 'Seu código de acesso: 123456' });
  });

  it('throws IntegrationError on HTTP errors and unexpected payloads', async () => {
    const bad = new VelomailEmailSender('k', 'a@b.c', 'https://vm.test/api', mockFetch(json({ error: 'nope' }, 403)).fetchFn);
    await expect(bad.send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toBeInstanceOf(IntegrationError);
    const weird = new VelomailEmailSender('k', 'a@b.c', 'https://vm.test/api', mockFetch(json({ unexpected: true })).fetchFn);
    await expect(weird.send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(/unexpected response shape/);
  });

  it('keeps a bare address as is', () => {
    expect(splitFrom(' ola@precisari.com.br ')).toEqual({ from: 'ola@precisari.com.br' });
  });

  it('requires its key in production', () => {
    const env = loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(32), EMAIL_PROVIDER: 'velomail' });
    expect(() => adapterFactories.email(env)).toThrow(/credential missing/);
  });
});

describe('Resend email adapter', () => {
  it('posts to the Resend API with bearer auth', async () => {
    const { fetchFn, calls } = mockFetch(json({ id: 'em_1' }));
    const sender = new ResendEmailSender('re_key', 'Precisari <ola@precisari.com.br>', fetchFn);
    await sender.send(otpEmail('ana@example.com', '123456'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.authorization).toBe('Bearer re_key');
    expect(calls[0]?.body).toMatchObject({ to: ['ana@example.com'], subject: 'Seu código de acesso: 123456' });
  });

  it('throws IntegrationError on HTTP errors and invalid payloads', async () => {
    const bad = new ResendEmailSender('k', 'f', mockFetch(json({ message: 'nope' }, 422)).fetchFn);
    await expect(bad.send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toBeInstanceOf(IntegrationError);
    const weird = new ResendEmailSender('k', 'f', mockFetch(json({ unexpected: true })).fetchFn);
    await expect(weird.send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(/unexpected response shape/);
  });

  it('renders pt-BR templates', () => {
    const w = weeklySummaryEmail('a@b.c', {
      userName: 'Carla Souza',
      weekLabel: '02/11 a 08/11',
      appUrl: 'http://localhost:3000/hoje',
      properties: [{ name: 'Casa Campeche', approvedCount: 2, approvedGain: 12000, pendingCount: 3, pendingGain: 28000, highlights: [{ date: '2026-11-14', headline: 'Sábado tá disputado', toValue: 28900 }] }],
    });
    expect(w.subject).toContain('+R$ 280');
    expect(w.text).toContain('Oi, Carla!');
    expect(w.text).toContain('14/11: Sábado tá disputado (R$ 289)');
    const i = icalBrokenEmail('a@b.c', { propertyName: 'Casa <Campeche>', appUrl: 'http://x' });
    expect(i.subject).toContain('parou de sincronizar');
    expect(i.html).toContain('Casa &lt;Campeche&gt;');
  });
});

describe('BrasilAPI holidays adapter', () => {
  it('fetches and validates national holidays', async () => {
    const { fetchFn, calls } = mockFetch(json([{ date: '2027-01-01', name: 'Confraternização mundial', type: 'national' }]));
    const p = new BrasilApiHolidaysProvider('https://brasilapi.com.br/api', fetchFn);
    const rows = await p.nationalHolidays(2027);
    expect(calls[0]?.url).toBe('https://brasilapi.com.br/api/feriados/v1/2027');
    expect(rows).toEqual([{ date: '2027-01-01', name: 'Confraternização mundial', type: 'national' }]);
  });

  it('rejects malformed payloads', async () => {
    const p = new BrasilApiHolidaysProvider(undefined, mockFetch(json([{ date: '01/01/2027', name: 'x' }])).fetchFn);
    await expect(p.nationalHolidays(2027)).rejects.toBeInstanceOf(IntegrationError);
    const h = await new BrasilApiHolidaysProvider(undefined, mockFetch(json({}, 500)).fetchFn).healthCheck();
    expect(h.ok).toBe(false);
  });

  it('fake computes Easter-based holidays', async () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    const rows = await new FakeHolidaysProvider().nationalHolidays(2027);
    expect(rows.find((r) => r.name === 'Carnaval')?.date).toBe('2027-02-09');
  });
});

describe('Open-Meteo weather adapter', () => {
  const daily = {
    time: ['2026-11-08', '2026-11-09', '2026-11-10'],
    precipitation_probability_max: [null, 80, 10],
    precipitation_sum: [3.2, 12.5, 0],
    temperature_2m_min: [18, 19, null],
    temperature_2m_max: [27, 26, 30],
  };

  it('builds the query and maps daily arrays (past days derive probability, incomplete days skipped)', async () => {
    const { fetchFn, calls } = mockFetch(json({ daily }));
    const p = new OpenMeteoWeatherProvider('https://api.open-meteo.com', fetchFn);
    const rows = await p.forecast(-27.6789, -48.4867, { days: 16, pastDays: 7, timezone: 'America/Sao_Paulo' });
    const url = new URL(calls[0]?.url ?? '');
    expect(url.pathname).toBe('/v1/forecast');
    expect(url.searchParams.get('daily')).toBe('precipitation_probability_max,precipitation_sum,temperature_2m_min,temperature_2m_max');
    expect(url.searchParams.get('forecast_days')).toBe('16');
    expect(url.searchParams.get('past_days')).toBe('7');
    expect(url.searchParams.get('timezone')).toBe('America/Sao_Paulo');
    expect(rows).toEqual([
      { date: '2026-11-08', precipProb: 100, precipMm: 3.2, tempMin: 18, tempMax: 27 },
      { date: '2026-11-09', precipProb: 80, precipMm: 12.5, tempMin: 19, tempMax: 26 },
    ]);
  });

  it('rejects arrays of different lengths', async () => {
    const p = new OpenMeteoWeatherProvider(undefined, mockFetch(json({ daily: { ...daily, temperature_2m_max: [1] } })).fetchFn);
    await expect(p.forecast(0, 0)).rejects.toBeInstanceOf(IntegrationError);
  });
});

describe('Google Places geo adapter', () => {
  const details = {
    id: 'pl_1',
    formattedAddress: 'Av. Pequeno Príncipe, 1000 - Campeche, Florianópolis - SC, 88063-000, Brasil',
    location: { latitude: -27.67, longitude: -48.48 },
    addressComponents: [
      { longText: 'Florianópolis', shortText: 'Florianópolis', types: ['administrative_area_level_2', 'political'] },
      { longText: 'Santa Catarina', shortText: 'SC', types: ['administrative_area_level_1', 'political'] },
      { longText: 'Brasil', shortText: 'BR', types: ['country', 'political'] },
    ],
  };

  it('autocompletes restricted to BR and caches results', async () => {
    const { fetchFn, calls } = mockFetch(json({ suggestions: [{ placePrediction: { placeId: 'pl_1', text: { text: 'Campeche, Florianópolis - SC' } } }, {}] }));
    const g = new GooglePlacesGeoProvider('gkey', fetchFn);
    const r1 = await g.autocomplete('Campeche', 'sess');
    const r2 = await g.autocomplete('campeche ');
    expect(r1).toEqual([{ placeId: 'pl_1', description: 'Campeche, Florianópolis - SC' }]);
    expect(r2).toEqual(r1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['x-goog-api-key']).toBe('gkey');
    expect(calls[0]?.body).toMatchObject({ input: 'Campeche', includedRegionCodes: ['br'], sessionToken: 'sess' });
  });

  it('extracts city/state/lat/lng and infers destination type', async () => {
    const { fetchFn, calls } = mockFetch(json(details));
    const g = new GooglePlacesGeoProvider('gkey', fetchFn);
    const d = await g.details('pl_1');
    await g.details('pl_1');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['x-goog-fieldmask']).toContain('addressComponents');
    expect(d).toEqual({
      placeId: 'pl_1', address: details.formattedAddress, lat: -27.67, lng: -48.48, city: 'Florianópolis', state: 'SC',
      ibgeCode: null, suggestedDestinationType: 'BEACH',
    });
  });

  it('rejects places outside Brazil or invalid payloads', async () => {
    const abroad = { ...details, addressComponents: [{ longText: 'Portugal', shortText: 'PT', types: ['country'] }] };
    await expect(new GooglePlacesGeoProvider('k', mockFetch(json(abroad)).fetchFn).details('x')).rejects.toThrow(/outside Brazil/);
    await expect(new GooglePlacesGeoProvider('k', mockFetch(json({ id: 1 })).fetchFn).details('y')).rejects.toBeInstanceOf(IntegrationError);
  });

  it('heuristic suggests destination types', () => {
    expect(inferDestinationType({ city: 'Gramado' })).toBe('MOUNTAIN');
    expect(inferDestinationType({ city: 'Campos do Jordão' })).toBe('MOUNTAIN');
    expect(inferDestinationType({ city: 'Bombinhas' })).toBe('BEACH');
    expect(inferDestinationType({ city: 'Rio de Janeiro', address: 'Rua Barata Ribeiro, Copacabana' })).toBe('BEACH');
    expect(inferDestinationType({ city: 'Rio de Janeiro', address: 'Rua do Ouvidor, Centro' })).toBe('URBAN');
    expect(inferDestinationType({ city: 'São Paulo' })).toBe('URBAN');
    expect(inferDestinationType({ city: 'Ouro Preto' })).toBe('CULTURAL');
    expect(inferDestinationType({ city: 'Bragança Paulista', address: 'Sítio Boa Vista, Estrada Municipal' })).toBe('RURAL');
  });

  it('fake geo is deterministic', async () => {
    const g = new FakeGeoProvider();
    const s = await g.autocomplete('Gramado');
    expect(s[0]?.placeId).toBe('fake-gramado');
    expect((await g.details('fake-gramado')).suggestedDestinationType).toBe('MOUNTAIN');
  });
});

describe('Expo push adapter', () => {
  it('sends in chunks of 100 and reports DeviceNotRegistered', async () => {
    const { fetchFn, calls } = mockFetch((call) => {
      const msgs = call.body as { to: string }[];
      return {
        body: {
          data: msgs.map((m) =>
            m.to === 'ExponentPushToken[dead]'
              ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
              : { status: 'ok', id: `t-${m.to}` },
          ),
        },
      };
    });
    const p = new ExpoPushProvider('expo-token', fetchFn);
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: i === 120 ? 'ExponentPushToken[dead]' : `ExponentPushToken[${i}]`, title: 't', body: 'b' }));
    const res = await p.send(messages);
    expect(calls).toHaveLength(2);
    expect((calls[0]?.body as unknown[]).length).toBe(100);
    expect((calls[1]?.body as unknown[]).length).toBe(50);
    expect(calls[0]?.headers.authorization).toBe('Bearer expo-token');
    expect(res).toHaveLength(150);
    expect(res[120]).toEqual({ token: 'ExponentPushToken[dead]', ok: false, error: 'DeviceNotRegistered' });
    expect(res.filter((r) => r.ok)).toHaveLength(149);
  });

  it('marks a whole chunk as failed on transport errors', async () => {
    const p = new ExpoPushProvider('', mockFetch(json({ error: 'x' }, 500)).fetchFn);
    const res = await p.send([{ to: 'ExponentPushToken[a]', title: 't', body: 'b' }]);
    expect(res[0]?.ok).toBe(false);
  });
});

describe('Channex adapter (skeleton)', () => {
  it('connects a property with user-api-key and pushes merged rate ranges', async () => {
    const { fetchFn, calls } = mockFetch(json({ data: { id: 'cx_prop' } }), json({ data: [{ id: 'rp_1' }] }), json({ data: [] }));
    const c = new ChannexHttpProvider('https://staging.channex.io/api/v1', 'cx-key', fetchFn);
    const r = await c.connectProperty({ propertyId: 'p1', title: 'Casa', currency: 'BRL', timezone: 'America/Sao_Paulo' });
    expect(r.channexPropertyId).toBe('cx_prop');
    expect(calls[0]?.headers['user-api-key']).toBe('cx-key');
    await c.pushRates('cx_prop', [
      { date: '2026-12-02', priceCents: 28900, minStay: 2 },
      { date: '2026-12-01', priceCents: 28900, minStay: 2 },
      { date: '2026-12-03', priceCents: 31900, minStay: 2 },
    ]);
    expect(calls[2]?.url).toBe('https://staging.channex.io/api/v1/restrictions');
    expect((calls[2]?.body as { values: unknown[] }).values).toEqual([
      { property_id: 'cx_prop', rate_plan_id: 'rp_1', date_from: '2026-12-01', date_to: '2026-12-02', rate: '289.00', min_stay_arrival: 2 },
      { property_id: 'cx_prop', rate_plan_id: 'rp_1', date_from: '2026-12-03', date_to: '2026-12-03', rate: '319.00', min_stay_arrival: 2 },
    ]);
  });

  it('toRanges splits non-contiguous dates', () => {
    expect(toRanges([{ date: '2026-12-01', priceCents: 1, minStay: 1 }, { date: '2026-12-03', priceCents: 1, minStay: 1 }])).toHaveLength(2);
  });
});

describe('Fake billing gateway', () => {
  it('verifies HMAC signatures and validates payloads', async () => {
    const b = new FakeBillingProvider('secret');
    const raw = JSON.stringify({ id: 'evt_1', type: 'subscription.activated', providerRef: 'sub_1' });
    const ev = await b.parseWebhook({ 'x-precisari-signature': signFakeWebhook(raw, 'secret') }, raw);
    expect(ev.type).toBe('subscription.activated');
    await expect(b.parseWebhook({ 'x-precisari-signature': 'bad' }, raw)).rejects.toThrow(/signature/);
    await expect(b.parseWebhook({}, raw)).rejects.toThrow(/signature/);
    const invalid = JSON.stringify({ id: 'evt_2', type: 'unknown' });
    await expect(b.parseWebhook({ 'x-precisari-signature': signFakeWebhook(invalid, 'secret') }, invalid)).rejects.toThrow(/payload/);
  });

  it('creates checkouts per payment method', async () => {
    const b = new FakeBillingProvider('s');
    const base = { userId: 'u', email: 'e', plan: 'PRO' as const, cycle: 'MONTHLY' as const, propertyCount: 1, amountCents: 2990 };
    expect((await b.createCheckout({ ...base, paymentMethod: 'PIX' })).pixCopyPaste).toContain('29.90');
    expect((await b.createCheckout({ ...base, paymentMethod: 'CARD' })).redirectUrl).toContain('/checkout/fake/');
    expect((await b.createCheckout({ ...base, paymentMethod: 'BOLETO' })).boletoUrl).toContain('/boleto');
  });
});

describe('common utilities', () => {
  it('TtlCache expires and evicts least recently used', () => {
    let now = 0;
    const c = new TtlCache<number>(2, 100, () => now);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    now = 200;
    expect(c.get('a')).toBeUndefined();
  });

  it('localDateHour converts to the user time zone', () => {
    const r = localDateHour(new Date('2026-11-09T12:30:00Z'), 'America/Sao_Paulo');
    expect(r).toEqual({ date: '2026-11-09', hour: 9, weekday: 1 });
    expect(localDateHour(new Date('2026-11-09T02:00:00Z'), 'America/Sao_Paulo').date).toBe('2026-11-08');
    expect(localDateHour(new Date('2026-11-09T12:00:00Z'), 'Not/AZone').hour).toBe(9);
  });

  it('selects adapters by env and falls back to fakes without credentials (non-production)', () => {
    const env = loadEnv({ DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(32), EMAIL_PROVIDER: 'resend', HOLIDAYS_PROVIDER: 'brasilapi', GEO_PROVIDER: 'google', GOOGLE_MAPS_API_KEY: 'g' });
    expect(adapterFactories.email(env).provider).toBe('fake');
    expect(adapterFactories.holidays(env).provider).toBe('brasilapi');
    expect(adapterFactories.geo(env).provider).toBe('google');
    expect(adapterFactories.llm(env).provider).toBe('fake');
    expect(adapterFactories.billing(env).provider).toBe('fake');
    const prod = loadEnv({ DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(32), NODE_ENV: 'production', LLM_PROVIDER: 'anthropic' });
    expect(() => adapterFactories.llm(prod)).toThrow(/credential missing/);
  });
});
