/**
 * Test environment. DATABASE_URL precedence: TEST_DATABASE_URL > DATABASE_URL (CI) > local precisari_core_test.
 * apps/api/.env is intentionally NOT loaded so tests never touch the dev database.
 */
export const LOCAL_TEST_DB = 'postgresql://precisari:precisari@localhost:5432/precisari_core_test?schema=public';

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? LOCAL_TEST_DB;
}

export function applyTestEnv(): void {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-123',
    DATA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    JOBS_ENABLED: 'false',
    LOG_LEVEL: 'silent',
    BULLMQ_PREFIX: 'precisari-core-test',
    RATE_LIMIT_PER_MINUTE: '100000',
    RATE_LIMIT_OTP_PER_MINUTE: '100000',
    OTP_MAX_REQUESTS_PER_WINDOW: '1000',
    ADMIN_EMAILS: 'admin@precisari.dev',
    REVIEW_LOGIN_EMAIL: 'review@precisari.dev, Recording@precisari.dev',
    REVIEW_LOGIN_CODE: '246810',
    HOLIDAYS_PROVIDER: 'fake',
    WEATHER_PROVIDER: 'fake',
    DATA_SEED_ON_BOOT: 'false',
    EMAIL_PROVIDER: 'fake',
    GEO_PROVIDER: 'fake',
    LLM_PROVIDER: 'fake',
    PUSH_PROVIDER: 'fake',
  };
  for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;
  process.env.NODE_ENV = 'test';
  process.env.JOBS_ENABLED = 'false';
  process.env.DATABASE_URL = testDatabaseUrl();
}
