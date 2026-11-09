import { Global, Module } from '@nestjs/common';
import {
  BILLING_PROVIDER, CHANNEX_PROVIDER, EMAIL_SENDER, GEO_PROVIDER, HOLIDAYS_PROVIDER, LLM_PROVIDER, PUSH_PROVIDER, WEATHER_PROVIDER,
} from './ports';
import {
  FakeBillingProvider, FakeChannexProvider, FakeEmailSender, FakeGeoProvider, FakeHolidaysProvider, FakeLlmProvider,
  FakePushProvider, FakeWeatherProvider,
} from './fakes';

/**
 * Binds every adapter port. FOUNDATION VERSION: all fakes.
 * The integrations workstream replaces these factories with env-based selection (real vs fake).
 */
@Global()
@Module({
  providers: [
    { provide: EMAIL_SENDER, useClass: FakeEmailSender },
    { provide: HOLIDAYS_PROVIDER, useClass: FakeHolidaysProvider },
    { provide: WEATHER_PROVIDER, useClass: FakeWeatherProvider },
    { provide: GEO_PROVIDER, useClass: FakeGeoProvider },
    { provide: LLM_PROVIDER, useClass: FakeLlmProvider },
    { provide: PUSH_PROVIDER, useClass: FakePushProvider },
    { provide: BILLING_PROVIDER, useClass: FakeBillingProvider },
    { provide: CHANNEX_PROVIDER, useClass: FakeChannexProvider },
  ],
  exports: [EMAIL_SENDER, HOLIDAYS_PROVIDER, WEATHER_PROVIDER, GEO_PROVIDER, LLM_PROVIDER, PUSH_PROVIDER, BILLING_PROVIDER, CHANNEX_PROVIDER],
})
export class IntegrationsModule {}
