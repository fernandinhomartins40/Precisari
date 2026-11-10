/**
 * Test env defaults. Import FIRST in DB-backed specs. CI provides DATABASE_URL/JWT secret; locally we default to
 * the integrations workstream's own test database.
 */
process.env.DATABASE_URL ??= 'postgresql://precisari:precisari@localhost:5432/precisari_integ_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0123';
process.env.DATA_ENCRYPTION_KEY ??= 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.JOBS_ENABLED = 'false';
process.env.DATA_SEED_ON_BOOT = 'false';
process.env.EMAIL_PROVIDER = 'fake';
process.env.HOLIDAYS_PROVIDER = 'fake';
process.env.WEATHER_PROVIDER = 'fake';
process.env.GEO_PROVIDER = 'fake';
process.env.LLM_PROVIDER = 'fake';
process.env.PUSH_PROVIDER = 'fake';
process.env.CHANNEX_PROVIDER = 'fake';
process.env.BILLING_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.CHANNEX_WEBHOOK_SECRET = 'test-channex-secret';

export {};
