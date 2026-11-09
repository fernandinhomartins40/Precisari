/** Fake adapters (dev/test). Kept as a barrel for backwards compatibility; implementations live per integration. */
export { FakeEmailSender } from './email/email.fake';
export { FakeHolidaysProvider } from './holidays/holidays.fake';
export { FakeWeatherProvider } from './weather/weather.fake';
export { FakeGeoProvider } from './geo/geo.fake';
export { FakeLlmProvider } from './llm/llm.fake';
export { FakePushProvider } from './push/push.fake';
export { FakeBillingProvider } from './billing/fake-billing.adapter';
export { FakeChannexProvider } from './channex/channex.fake';
