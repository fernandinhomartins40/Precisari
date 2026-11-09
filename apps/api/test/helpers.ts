import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthSession, CreatePropertyBody } from '@precisari/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadEnv } from '../src/config/env';
import { EMAIL_SENDER, type EmailMessage, type EmailSender } from '../src/integrations/ports';
import { PrismaService } from '../src/prisma/prisma.service';

export class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
  }
  lastCodeFor(email: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === email);
    const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`no OTP email for ${email}`);
    return code;
  }
}

export interface TestContext {
  app: INestApplication;
  http: ReturnType<INestApplication['getHttpServer']>;
  prisma: PrismaService;
  emails: CapturingEmailSender;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const emails = new CapturingEmailSender();
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_SENDER)
    .useValue(emails)
    .compile();
  const app = mod.createNestApplication({ rawBody: true, logger: false });
  configureApp(app, loadEnv(), { swagger: true });
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, http: app.getHttpServer(), prisma, emails, close: () => app.close() };
}

/** Truncates every table except Prisma's migration history. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function login(ctx: TestContext, email: string): Promise<AuthSession> {
  await request(ctx.http).post('/v1/auth/otp/request').send({ email }).expect(204);
  const res = await request(ctx.http).post('/v1/auth/otp/verify').send({ email, code: ctx.emails.lastCodeFor(email) }).expect(200);
  return res.body as AuthSession;
}

export const bearer = (s: { accessToken: string }): [string, string] => ['Authorization', `Bearer ${s.accessToken}`];

export function propertyBody(overrides: Partial<CreatePropertyBody> = {}): CreatePropertyBody {
  return {
    name: 'Studio do Campeche',
    address: 'Av. Campeche, 1000 - Campeche, Florianópolis - SC',
    lat: -27.6789,
    lng: -48.4867,
    city: 'Florianópolis',
    state: 'SC',
    ibgeCode: '4205407',
    destinationType: 'BEACH',
    capacity: 2,
    bedrooms: 1,
    basePrice: 24900,
    minPrice: 18000,
    cleaningFee: 9000,
    ...overrides,
  };
}

/** Local HTTP server serving mutable iCal fixtures: set `files[path] = content`. */
export async function startIcsServer(): Promise<{ url: (path: string) => string; files: Record<string, string | number>; close: () => Promise<void> }> {
  const files: Record<string, string | number> = {};
  const server: Server = createServer((req, res) => {
    const body = files[req.url ?? ''];
    if (body === undefined) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    if (typeof body === 'number') {
      res.statusCode = body;
      res.end('error');
      return;
    }
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    files,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Builds an Airbnb-like iCal feed. Dates are yyyy-mm-dd; DTEND exclusive. */
export function icsFeed(events: { uid: string; start: string; end: string; summary?: string }[]): string {
  const d = (iso: string): string => iso.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN', 'CALSCALE:GREGORIAN', 'VERSION:2.0'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `DTEND;VALUE=DATE:${d(e.end)}`,
      `DTSTART;VALUE=DATE:${d(e.start)}`,
      `UID:${e.uid}`,
      `SUMMARY:${e.summary ?? 'Reserved'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
