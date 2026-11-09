import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import {
  BILLING_PROVIDER, CHANNEX_PROVIDER, EMAIL_SENDER, GEO_PROVIDER, HOLIDAYS_PROVIDER, LLM_PROVIDER, PUSH_PROVIDER, WEATHER_PROVIDER,
  type BillingProvider, type ChannexProvider, type EmailSender, type GeoProvider, type HolidaysProvider, type LlmProvider,
  type PushProvider, type WeatherProvider,
} from './ports';
import { ResendEmailSender } from './email/resend.adapter';
import { FakeEmailSender } from './email/email.fake';
import { BrasilApiHolidaysProvider } from './holidays/brasilapi.adapter';
import { FakeHolidaysProvider } from './holidays/holidays.fake';
import { OpenMeteoWeatherProvider } from './weather/open-meteo.adapter';
import { FakeWeatherProvider } from './weather/weather.fake';
import { GooglePlacesGeoProvider } from './geo/google-places.adapter';
import { FakeGeoProvider } from './geo/geo.fake';
import { AnthropicLlmProvider } from './llm/anthropic.adapter';
import { FakeLlmProvider } from './llm/llm.fake';
import { ExpoPushProvider } from './push/expo.adapter';
import { FakePushProvider } from './push/push.fake';
import { FakeBillingProvider } from './billing/fake-billing.adapter';
import { ChannexHttpProvider } from './channex/channex.adapter';
import { FakeChannexProvider } from './channex/channex.fake';

const log = new Logger('IntegrationsModule');

/**
 * A real adapter needs its credential. Missing key: fail fast in production, fall back to the fake elsewhere.
 */
function requireKey<T>(env: Env, integration: string, key: string, real: () => T, fake: () => T): T {
  if (key) return real();
  if (env.NODE_ENV === 'production') throw new Error(`${integration}: credential missing for the selected provider`);
  log.warn(`${integration}: credential missing — using the fake adapter`);
  return fake();
}

/** Env-based adapter selection. Exported for tests. */
export const adapterFactories = {
  email: (env: Env): EmailSender =>
    env.EMAIL_PROVIDER === 'resend'
      ? requireKey<EmailSender>(env, 'email', env.RESEND_API_KEY, () => new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM), () => new FakeEmailSender())
      : new FakeEmailSender(),
  holidays: (env: Env): HolidaysProvider =>
    env.HOLIDAYS_PROVIDER === 'brasilapi' ? new BrasilApiHolidaysProvider(env.BRASILAPI_BASE_URL) : new FakeHolidaysProvider(),
  weather: (env: Env): WeatherProvider =>
    env.WEATHER_PROVIDER === 'open-meteo' ? new OpenMeteoWeatherProvider(env.OPEN_METEO_BASE_URL) : new FakeWeatherProvider(),
  geo: (env: Env): GeoProvider =>
    env.GEO_PROVIDER === 'google'
      ? requireKey<GeoProvider>(env, 'geo', env.GOOGLE_MAPS_API_KEY, () => new GooglePlacesGeoProvider(env.GOOGLE_MAPS_API_KEY), () => new FakeGeoProvider())
      : new FakeGeoProvider(),
  llm: (env: Env): LlmProvider =>
    env.LLM_PROVIDER === 'anthropic'
      ? requireKey<LlmProvider>(env, 'llm', env.ANTHROPIC_API_KEY, () => new AnthropicLlmProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL), () => new FakeLlmProvider())
      : new FakeLlmProvider(),
  push: (env: Env): PushProvider => (env.PUSH_PROVIDER === 'expo' ? new ExpoPushProvider(env.EXPO_ACCESS_TOKEN) : new FakePushProvider()),
  // Gateway not chosen yet (PRD §12): only the fake exists. See billing/README.md.
  billing: (env: Env): BillingProvider => new FakeBillingProvider(env.BILLING_WEBHOOK_SECRET, env.WEB_PUBLIC_URL),
  channex: (env: Env): ChannexProvider =>
    env.CHANNEX_PROVIDER === 'channex'
      ? requireKey<ChannexProvider>(env, 'channex', env.CHANNEX_API_KEY, () => new ChannexHttpProvider(env.CHANNEX_BASE_URL, env.CHANNEX_API_KEY), () => new FakeChannexProvider())
      : new FakeChannexProvider(),
};

const providers: Provider[] = [
  { provide: EMAIL_SENDER, inject: [ENV], useFactory: adapterFactories.email },
  { provide: HOLIDAYS_PROVIDER, inject: [ENV], useFactory: adapterFactories.holidays },
  { provide: WEATHER_PROVIDER, inject: [ENV], useFactory: adapterFactories.weather },
  { provide: GEO_PROVIDER, inject: [ENV], useFactory: adapterFactories.geo },
  { provide: LLM_PROVIDER, inject: [ENV], useFactory: adapterFactories.llm },
  { provide: PUSH_PROVIDER, inject: [ENV], useFactory: adapterFactories.push },
  { provide: BILLING_PROVIDER, inject: [ENV], useFactory: adapterFactories.billing },
  { provide: CHANNEX_PROVIDER, inject: [ENV], useFactory: adapterFactories.channex },
];

/** Binds every adapter port (real or fake, selected by env — see `.env.example`). */
@Global()
@Module({
  providers,
  exports: [EMAIL_SENDER, HOLIDAYS_PROVIDER, WEATHER_PROVIDER, GEO_PROVIDER, LLM_PROVIDER, PUSH_PROVIDER, BILLING_PROVIDER, CHANNEX_PROVIDER],
})
export class IntegrationsModule {}
