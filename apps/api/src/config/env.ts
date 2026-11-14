import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Validated environment. Empty integration keys ⇒ fake adapters. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3333),
  API_PUBLIC_URL: z.string().default('http://localhost:3333'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8081'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  DATA_ENCRYPTION_KEY: z.string().default(''),
  OTP_TTL_SECONDS: z.coerce.number().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  ADMIN_EMAILS: z.string().default(''),
  /** App Store / Play review accounts (comma-separated): they log in with this fixed 6-digit code and get no e-mail. Empty ⇒ off. */
  REVIEW_LOGIN_EMAIL: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)),
  REVIEW_LOGIN_CODE: z.string().regex(/^(\d{6})?$/, 'REVIEW_LOGIN_CODE must be 6 digits').default(''),
  JOBS_ENABLED: bool.default('true'),
  EMAIL_PROVIDER: z.enum(['fake', 'resend', 'velomail']).default('fake'),
  RESEND_API_KEY: z.string().default(''),
  VELOMAIL_API_KEY: z.string().default(''),
  VELOMAIL_BASE_URL: z.string().default('https://www.velomail.com.br/api'),
  EMAIL_FROM: z.string().default('Precisari <ola@precisari.com.br>'),
  HOLIDAYS_PROVIDER: z.enum(['brasilapi', 'fake']).default('brasilapi'),
  BRASILAPI_BASE_URL: z.string().default('https://brasilapi.com.br/api'),
  WEATHER_PROVIDER: z.enum(['open-meteo', 'fake']).default('open-meteo'),
  OPEN_METEO_BASE_URL: z.string().default('https://api.open-meteo.com'),
  GEO_PROVIDER: z.enum(['google', 'fake']).default('fake'),
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  LLM_PROVIDER: z.enum(['anthropic', 'fake']).default('fake'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  PUSH_PROVIDER: z.enum(['expo', 'fake']).default('fake'),
  EXPO_ACCESS_TOKEN: z.string().default(''),
  BILLING_PROVIDER: z.enum(['fake', 'asaas']).default('fake'),
  ASAAS_API_KEY: z.string().default(''),
  ASAAS_BASE_URL: z.string().default('https://api.asaas.com/v3'),
  /** Static token Asaas sends in `asaas-access-token`; never the API key. */
  ASAAS_WEBHOOK_TOKEN: z.string().default(''),
  BILLING_WEBHOOK_SECRET: z.string().default('change-me-webhook-secret'),
  CHANNEX_PROVIDER: z.enum(['channex', 'fake']).default('fake'),
  CHANNEX_BASE_URL: z.string().default('https://staging.channex.io/api/v1'),
  CHANNEX_API_KEY: z.string().default(''),
  /** Shared secret Channex sends in x-precisari-secret on booking webhooks. Empty ⇒ webhooks rejected. */
  CHANNEX_WEBHOOK_SECRET: z.string().default(''),
  SENTRY_DSN: z.string().default(''),
  /** Seed curated data (state/municipal holidays, school vacations) and sync national holidays at boot when empty. */
  DATA_SEED_ON_BOOT: bool.default('true'),
  APPLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),

  // ---------- Core (auth, calendar, rate limiting, logging) ----------
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Secret for hashing OTP codes. Empty ⇒ falls back to JWT_ACCESS_SECRET. */
  OTP_HASH_SECRET: z.string().default(''),
  /** Max OTP emails per address per 15 minutes (extra requests are silently ignored). */
  OTP_MAX_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(5),
  /** Version of the terms/privacy policy recorded as LGPD consent on first login. */
  TERMS_VERSION: z.string().default('2026-11'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_OTP_PER_MINUTE: z.coerce.number().int().positive().default(5),
  /** Redis key prefix for BullMQ (isolates environments sharing a Redis). */
  BULLMQ_PREFIX: z.string().default('bull'),
  ICAL_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  ICAL_MAX_BYTES: z.coerce.number().int().positive().default(2_000_000),
  /** Allow iCal URLs that resolve to private/loopback IPs. Unset ⇒ allowed outside production only. */
  ICAL_ALLOW_PRIVATE_HOSTS: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  /** Consecutive sync failures before a calendar is marked ERROR (RF-22). */
  ICAL_ERROR_THRESHOLD: z.coerce.number().int().positive().default(3),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  return parsed.data;
}
