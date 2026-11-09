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
  JOBS_ENABLED: bool.default('true'),
  EMAIL_PROVIDER: z.enum(['fake', 'resend']).default('fake'),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('Precisari <ola@precisari.com.br>'),
  HOLIDAYS_PROVIDER: z.enum(['brasilapi', 'fake']).default('brasilapi'),
  WEATHER_PROVIDER: z.enum(['open-meteo', 'fake']).default('open-meteo'),
  OPEN_METEO_BASE_URL: z.string().default('https://api.open-meteo.com'),
  GEO_PROVIDER: z.enum(['google', 'fake']).default('fake'),
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  LLM_PROVIDER: z.enum(['anthropic', 'fake']).default('fake'),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  PUSH_PROVIDER: z.enum(['expo', 'fake']).default('fake'),
  EXPO_ACCESS_TOKEN: z.string().default(''),
  BILLING_PROVIDER: z.enum(['fake']).default('fake'),
  BILLING_WEBHOOK_SECRET: z.string().default('change-me-webhook-secret'),
  CHANNEX_PROVIDER: z.enum(['channex', 'fake']).default('fake'),
  CHANNEX_BASE_URL: z.string().default('https://staging.channex.io/api/v1'),
  CHANNEX_API_KEY: z.string().default(''),
  SENTRY_DSN: z.string().default(''),
  APPLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  return parsed.data;
}
