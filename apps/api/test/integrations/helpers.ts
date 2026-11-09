import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { SignJWT } from 'jose';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { vi } from 'vitest';
import { ConfigModule } from '../../src/config/config.module';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { IntegrationsModule } from '../../src/integrations/integrations.module';
import { JobsModule } from '../../src/jobs/jobs.module';
import { JobQueueService } from '../../src/jobs/job-queue.service';
import { HttpExceptionFilter } from '../../src/common/http-exception.filter';
import {
  BILLING_PROVIDER, CHANNEX_PROVIDER, EMAIL_SENDER, GEO_PROVIDER, HOLIDAYS_PROVIDER, LLM_PROVIDER, PUSH_PROVIDER, WEATHER_PROVIDER,
  type WeatherProvider,
} from '../../src/integrations/ports';
import {
  FakeBillingProvider, FakeChannexProvider, FakeEmailSender, FakeGeoProvider, FakeHolidaysProvider, FakeLlmProvider, FakePushProvider,
  FakeWeatherProvider,
} from '../../src/integrations/fakes';

export interface Fakes {
  email: FakeEmailSender;
  holidays: FakeHolidaysProvider;
  weather: WeatherProvider;
  geo: FakeGeoProvider;
  llm: FakeLlmProvider;
  push: FakePushProvider;
  billing: FakeBillingProvider;
  channex: FakeChannexProvider;
}

export interface Enqueued {
  queue: string;
  data: unknown;
  opts?: { jobId?: string; delayMs?: number };
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  fakes: Fakes;
  enqueued: Enqueued[];
  get<T>(token: Type<T> | symbol): T;
  close(): Promise<void>;
}

export async function createTestApp(
  modules: (Type<unknown> | DynamicModule)[],
  opts: { weather?: WeatherProvider; customize?: (b: TestingModuleBuilder) => TestingModuleBuilder } = {},
): Promise<TestApp> {
  const fakes: Fakes = {
    email: new FakeEmailSender(),
    holidays: new FakeHolidaysProvider(),
    weather: opts.weather ?? new FakeWeatherProvider(),
    geo: new FakeGeoProvider(),
    llm: new FakeLlmProvider(),
    push: new FakePushProvider(),
    billing: new FakeBillingProvider(process.env.BILLING_WEBHOOK_SECRET),
    channex: new FakeChannexProvider(),
  };
  const enqueued: Enqueued[] = [];
  const jobs = {
    enqueue: vi.fn(async (queue: string, data: unknown, o?: Enqueued['opts']) => {
      enqueued.push({ queue, data, opts: o });
    }),
  };
  let builder = Test.createTestingModule({ imports: [ConfigModule, PrismaModule, IntegrationsModule, JobsModule, ...modules] })
    .overrideProvider(JobQueueService).useValue(jobs)
    .overrideProvider(EMAIL_SENDER).useValue(fakes.email)
    .overrideProvider(HOLIDAYS_PROVIDER).useValue(fakes.holidays)
    .overrideProvider(WEATHER_PROVIDER).useValue(fakes.weather)
    .overrideProvider(GEO_PROVIDER).useValue(fakes.geo)
    .overrideProvider(LLM_PROVIDER).useValue(fakes.llm)
    .overrideProvider(PUSH_PROVIDER).useValue(fakes.push)
    .overrideProvider(BILLING_PROVIDER).useValue(fakes.billing)
    .overrideProvider(CHANNEX_PROVIDER).useValue(fakes.channex);
  if (opts.customize) builder = opts.customize(builder);
  const mod = await builder.compile();
  const app = mod.createNestApplication({ rawBody: true, logger: false });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  const prisma = app.get(PrismaService);
  return {
    app,
    prisma,
    fakes,
    enqueued,
    get: <T>(token: Type<T> | symbol) => app.get<T>(token as Type<T>),
    close: () => app.close(),
  };
}

const TABLES = [
  'User', 'Property', 'CalendarSource', 'NightPrice', 'Action', 'ExplanationCache', 'Event', 'Holiday', 'SchoolVacation',
  'WeatherForecast', 'DeviceToken', 'AuditLog', 'Subscription', 'IdempotencyKey', 'WebhookEvent',
];

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

let seq = 0;
export async function createUser(prisma: PrismaClient, data: Partial<Prisma.UserCreateInput> = {}): Promise<User> {
  seq++;
  return prisma.user.create({ data: { email: `user${seq}-${Date.now()}@example.com`, ...data } });
}

export async function tokenFor(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET));
}

export async function createProperty(prisma: PrismaClient, userId: string, data: Partial<Prisma.PropertyUncheckedCreateInput> = {}) {
  return prisma.property.create({
    data: {
      userId,
      name: 'Casa Campeche',
      address: 'Av. Campeche, 1000 - Florianópolis - SC',
      lat: -27.6789,
      lng: -48.4867,
      city: 'Florianópolis',
      state: 'SC',
      destinationType: 'BEACH',
      capacity: 4,
      bedrooms: 2,
      basePrice: 25900,
      minPrice: 19900,
      maxPrice: 77700,
      ...data,
    },
  });
}

export const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
