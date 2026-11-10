/**
 * Mock mode: a fake `fetch` implementing the Precisari /v1 contract (routes from @precisari/shared)
 * with stateful demo data. Responses are shaped to pass the shared Zod schemas (see mock-api.test.ts).
 * Enabled with NEXT_PUBLIC_API_MOCK=true. In the browser, state persists in localStorage.
 */
import {
  API_PREFIX,
  ChannexConnectBody,
  CheckoutBody,
  ConnectCalendarBody,
  CreatePropertyBody,
  ErrorCode,
  EventBody,
  HolidayBody,
  OtpRequestBody,
  OtpVerifyBody,
  RefreshBody,
  SchoolVacationBody,
  UpdateMeBody,
  UpdatePropertyBody,
  routes,
  type ActionDto,
  type ActionStatus,
  type ChannexStatusDto,
  type CheckoutDto,
  type NightsResponse,
  type PropertyDto,
  type SyncResultDto,
} from '@precisari/shared';
import type { ZodTypeAny, z } from 'zod';
import { addDays, todayIso } from './dates';
import {
  MOCK_DB_VERSION,
  adminHealth,
  autocomplete,
  computeInsights,
  computeNight,
  computeNightDetail,
  createSeedDb,
  genericActions,
  genericBookings,
  makeProperty,
  maskUrl,
  placeDetails,
  seedPlans,
  withUserEmail,
  type MockDb,
} from './mock/data';

export const MOCK_BASE_URL = 'https://mock.precisari.local';
const STORAGE_KEY = 'precisari.mock.db';
const ACCESS_TTL_S = 900;
const PAYMENT_CONFIRM_MS = 5000;

export interface MockApiOptions {
  /** Persist state (browser localStorage). `null` keeps it in memory only. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => Date;
  latencyMs?: number;
}

type Handler = (ctx: Ctx) => Response | Promise<Response>;

interface Ctx {
  db: MockDb;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  nowMs: number;
  headers: Headers;
  origin: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const noContent = () => new Response(null, { status: 204 });

function parse<T extends ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, ErrorCode.VALIDATION, 'Dados inválidos', r.error.flatten());
  return r.data as z.output<T>;
}

function token(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function requireUser(ctx: Ctx): void {
  const auth = ctx.headers.get('Authorization') ?? '';
  const t = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const exp = ctx.db.accessTokens[t];
  if (!t || exp === undefined || exp < ctx.nowMs) throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Sessão expirada');
}

function requireAdmin(ctx: Ctx): void {
  requireUser(ctx);
  if (ctx.db.user.role !== 'ADMIN') throw new HttpError(403, ErrorCode.FORBIDDEN, 'Acesso restrito');
}

function findProperty(ctx: Ctx): PropertyDto {
  const p = ctx.db.properties.find((x) => x.id === ctx.params.id);
  if (!p) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Imóvel não encontrado');
  return p;
}

function channexStatus(ctx: Ctx, propertyId: string): ChannexStatusDto {
  const at = ctx.db.channex?.[propertyId];
  return { propertyId, state: at ? 'LINKED' : 'DISCONNECTED', lastSyncAt: at ?? null, lastError: null };
}

function issueTokens(ctx: Ctx) {
  const accessToken = token('mock_at');
  const refreshToken = token('mock_rt');
  ctx.db.accessTokens[accessToken] = ctx.nowMs + ACCESS_TTL_S * 1000;
  ctx.db.refreshTokens.push(refreshToken);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S };
}

function applyPayments(ctx: Ctx): void {
  const paid = ctx.db.checkouts.find((c) => ctx.nowMs - c.createdAt >= PAYMENT_CONFIRM_MS * (c.method === 'BOLETO' ? 2 : 1));
  if (paid && ctx.db.user.subscription.status !== 'ACTIVE') {
    ctx.db.user.subscription = {
      plan: paid.plan,
      status: 'ACTIVE',
      trialEndsAt: null,
      currentPeriodEnd: new Date(ctx.nowMs + 30 * 86_400_000).toISOString(),
    };
    ctx.db.checkouts = [];
  }
}

/** Deterministic fake QR (SVG data URI). Not scannable — demo only. */
function fakeQr(seed: string): string {
  const n = 25;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rects: string[] = [];
  const finder = (x: number, y: number) => x < 7 && y < 7;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const inFinder = finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y);
      let on: boolean;
      if (inFinder) {
        const fx = x < 7 ? x : n - 1 - x;
        const fy = y < 7 ? y : n - 1 - y;
        on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
      } else {
        h = Math.imul(h ^ (x * 31 + y), 2654435761);
        on = (h >>> 16) % 2 === 0;
      }
      if (on) rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 29 29" shape-rendering="crispEdges"><rect x="-2" y="-2" width="29" height="29" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg).toString('base64')}`;
}

function nightsRange(ctx: Ctx, p: PropertyDto): NightsResponse {
  const from = ctx.query.get('from') ?? ctx.db.today;
  const to = ctx.query.get('to') ?? addDays(from, 89);
  const nights = [];
  for (let d = from; d <= to; d = addDays(d, 1)) nights.push(computeNight(ctx.db, p, d));
  const potentialGain = nights
    .filter((n) => n.status === 'free' && n.date >= ctx.db.today)
    .reduce((sum, n) => sum + Math.max(0, n.suggestedPrice - n.currentPrice), 0);
  return { propertyId: p.id, from, to, potentialGain, nights };
}

function decide(ctx: Ctx, status: ActionStatus): ActionDto {
  const a = ctx.db.actions.find((x) => x.id === ctx.params.id);
  if (!a) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Sugestão não encontrada');
  const prices = (ctx.db.approvedPrices[a.propertyId] ??= {});
  if (status === 'APPROVED') {
    a.status = 'APPROVED';
    a.decidedAt = new Date(ctx.nowMs).toISOString();
    if (a.type !== 'MIN_STAY') prices[a.date] = a.toValue;
  } else if (status === 'DISMISSED') {
    a.status = 'DISMISSED';
    a.decidedAt = new Date(ctx.nowMs).toISOString();
  } else {
    // Undo: the action goes back to the review queue and the approved price is reverted.
    a.status = 'PENDING';
    a.decidedAt = null;
    delete prices[a.date];
  }
  return a;
}

const handlers: [string, string, Handler][] = [
  // ---- health ----
  ['GET', routes.health, () => json(200, { status: 'ok', mock: true })],

  // ---- auth ----
  [
    'POST',
    routes.otpRequest,
    (ctx) => {
      parse(OtpRequestBody, ctx.body);
      return noContent();
    },
  ],
  [
    'POST',
    routes.otpVerify,
    (ctx) => {
      const body = parse(OtpVerifyBody, ctx.body);
      if (body.code === '000000') throw new HttpError(400, ErrorCode.OTP_INVALID, 'Código inválido');
      ctx.db.user = withUserEmail(ctx.db.user, body.email);
      return json(200, { ...issueTokens(ctx), user: ctx.db.user });
    },
  ],
  [
    'POST',
    routes.oauth(':provider' as 'apple'),
    () => {
      throw new HttpError(501, ErrorCode.NOT_IMPLEMENTED, 'Login social em breve');
    },
  ],
  [
    'POST',
    routes.refresh,
    (ctx) => {
      const { refreshToken } = parse(RefreshBody, ctx.body);
      const i = ctx.db.refreshTokens.indexOf(refreshToken);
      if (i < 0) throw new HttpError(401, ErrorCode.REFRESH_INVALID, 'Sessão expirada');
      ctx.db.refreshTokens.splice(i, 1);
      return json(200, issueTokens(ctx));
    },
  ],
  [
    'POST',
    routes.logout,
    (ctx) => {
      const body = ctx.body as { refreshToken?: string } | undefined;
      ctx.db.refreshTokens = ctx.db.refreshTokens.filter((r) => r !== body?.refreshToken);
      return noContent();
    },
  ],

  // ---- me ----
  [
    'GET',
    routes.me,
    (ctx) => {
      requireUser(ctx);
      applyPayments(ctx);
      return json(200, ctx.db.user);
    },
  ],
  [
    'PATCH',
    routes.me,
    (ctx) => {
      requireUser(ctx);
      const body = parse(UpdateMeBody, ctx.body);
      ctx.db.user = { ...ctx.db.user, ...body };
      return json(200, ctx.db.user);
    },
  ],
  [
    'DELETE',
    routes.me,
    (ctx) => {
      requireUser(ctx);
      Object.assign(ctx.db, createSeedDb(ctx.db.today, ctx.nowMs));
      return noContent();
    },
  ],
  [
    'GET',
    routes.meExport,
    (ctx) => {
      requireUser(ctx);
      const { accessTokens: _a, refreshTokens: _r, ...data } = ctx.db;
      return json(200, { exportedAt: new Date(ctx.nowMs).toISOString(), user: data.user, properties: data.properties, bookings: data.bookings, actions: data.actions });
    },
  ],

  // ---- properties ----
  [
    'GET',
    routes.properties,
    (ctx) => {
      requireUser(ctx);
      return json(200, ctx.db.properties);
    },
  ],
  [
    'POST',
    routes.properties,
    (ctx) => {
      requireUser(ctx);
      const body = parse(CreatePropertyBody, ctx.body);
      const id = `prop_${++ctx.db.seq}`;
      const p = makeProperty(
        id,
        ctx.nowMs,
        {
          name: body.name,
          address: body.address,
          lat: body.lat,
          lng: body.lng,
          city: body.city,
          state: body.state,
          ibgeCode: body.ibgeCode ?? null,
          destinationType: body.destinationType,
          capacity: body.capacity,
          bedrooms: body.bedrooms,
          basePrice: body.basePrice,
          minPrice: body.minPrice,
          maxPrice: body.maxPrice ?? body.basePrice * 3,
          cleaningFee: body.cleaningFee,
          monthlyFixedCosts: body.monthlyFixedCosts ?? null,
          platformFeePct: body.platformFeePct,
          aggressiveness: body.aggressiveness,
          rulesConfig: body.rulesConfig,
          timezone: body.timezone,
          listingUrl: body.listingUrl ?? null,
          photoUrl: body.photoUrl ?? null,
        },
        null,
      );
      p.createdAt = new Date(ctx.nowMs).toISOString();
      ctx.db.properties.push(p);
      ctx.db.bookings[id] = [];
      ctx.db.approvedPrices[id] = {};
      return json(201, p);
    },
  ],
  [
    'GET',
    routes.property(':id'),
    (ctx) => {
      requireUser(ctx);
      return json(200, findProperty(ctx));
    },
  ],
  [
    'PATCH',
    routes.property(':id'),
    (ctx) => {
      requireUser(ctx);
      const p = findProperty(ctx);
      const body = parse(UpdatePropertyBody, ctx.body);
      const next = { ...p, ...body } as PropertyDto;
      if (next.minPrice > next.basePrice || next.maxPrice < next.basePrice)
        throw new HttpError(400, ErrorCode.VALIDATION, 'Mínimo ≤ base ≤ máximo', { fieldErrors: { minPrice: ['range'] } });
      Object.assign(p, next);
      return json(200, p);
    },
  ],
  [
    'DELETE',
    routes.property(':id'),
    (ctx) => {
      requireUser(ctx);
      const p = findProperty(ctx);
      ctx.db.properties = ctx.db.properties.filter((x) => x.id !== p.id);
      ctx.db.actions = ctx.db.actions.filter((a) => a.propertyId !== p.id);
      return noContent();
    },
  ],
  [
    'POST',
    routes.calendarSources(':id'),
    (ctx) => {
      requireUser(ctx);
      const p = findProperty(ctx);
      const { url } = parse(ConnectCalendarBody, ctx.body);
      if (!/\.ics(\?|$)|ical/i.test(url)) throw new HttpError(422, ErrorCode.ICAL_INVALID, 'Link iCal inválido');
      const broken = /erro|broken/i.test(url);
      const source = {
        id: `cal_${p.id}`,
        type: 'ICAL' as const,
        urlMasked: maskUrl(url),
        lastSyncAt: broken ? null : new Date(ctx.nowMs).toISOString(),
        status: broken ? ('ERROR' as const) : ('OK' as const),
        lastError: broken ? 'O Airbnb respondeu 404 para esse link.' : null,
      };
      p.calendarSources = [source];
      if (!broken) {
        ctx.db.bookings[p.id] = genericBookings(ctx.db.today, ctx.db.seq);
        ctx.db.actions.push(...genericActions(ctx.db.today, ctx.nowMs, p, ++ctx.db.seq));
      }
      return json(201, source);
    },
  ],
  [
    'POST',
    routes.sync(':id'),
    (ctx) => {
      requireUser(ctx);
      const p = findProperty(ctx);
      const src = p.calendarSources[0];
      if (!src) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Nenhum calendário conectado');
      const ok = src.status !== 'ERROR';
      if (ok) src.lastSyncAt = new Date(ctx.nowMs).toISOString();
      const result: SyncResultDto = {
        status: ok ? 'OK' : 'ERROR',
        bookingsImported: ok ? (ctx.db.bookings[p.id]?.length ?? 0) : 0,
        changed: false,
        lastSyncAt: src.lastSyncAt,
        error: ok ? null : src.lastError,
      };
      return json(200, result);
    },
  ],
  [
    'GET',
    routes.nights(':id'),
    (ctx) => {
      requireUser(ctx);
      return json(200, nightsRange(ctx, findProperty(ctx)));
    },
  ],
  [
    'GET',
    routes.night(':id', ':date'),
    (ctx) => {
      requireUser(ctx);
      const p = findProperty(ctx);
      const date = ctx.params.date ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, ErrorCode.VALIDATION, 'Data inválida');
      return json(200, computeNightDetail(ctx.db, p, date));
    },
  ],
  [
    'GET',
    routes.insights(':id'),
    (ctx) => {
      requireUser(ctx);
      const p = findProperty(ctx);
      return json(200, computeInsights(ctx.db, p, ctx.query.get('month') ?? ctx.db.today.slice(0, 7)));
    },
  ],

  // ---- places ----
  [
    'GET',
    routes.placesAutocomplete,
    (ctx) => {
      requireUser(ctx);
      return json(200, autocomplete(ctx.query.get('q') ?? ''));
    },
  ],
  [
    'GET',
    // routes.placeDetails() URL-encodes its argument, so the pattern is spelled out here.
    '/places/:placeId',
    (ctx) => {
      requireUser(ctx);
      const d = placeDetails(decodeURIComponent(ctx.params.placeId ?? ''));
      if (!d) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Endereço não encontrado');
      return json(200, d);
    },
  ],

  // ---- actions ----
  [
    'GET',
    routes.actions,
    (ctx) => {
      requireUser(ctx);
      const status = ctx.query.get('status');
      const propertyId = ctx.query.get('propertyId');
      const items = ctx.db.actions
        .filter((a) => (!status || a.status === status) && (!propertyId || a.propertyId === propertyId))
        .filter((a) => a.date >= ctx.db.today)
        .sort((a, b) => b.estimatedGain - a.estimatedGain || a.date.localeCompare(b.date));
      const totalEstimatedGain = items.filter((a) => a.status === 'PENDING').reduce((s, a) => s + a.estimatedGain, 0);
      return json(200, { items, nextCursor: null, totalEstimatedGain });
    },
  ],
  ['POST', routes.actionApprove(':id'), (ctx) => (requireUser(ctx), json(200, decide(ctx, 'APPROVED')))],
  ['POST', routes.actionDismiss(':id'), (ctx) => (requireUser(ctx), json(200, decide(ctx, 'DISMISSED')))],
  ['POST', routes.actionRevert(':id'), (ctx) => (requireUser(ctx), json(200, decide(ctx, 'REVERTED')))],

  // ---- devices ----
  ['POST', routes.devices, (ctx) => (requireUser(ctx), noContent())],

  // ---- billing ----
  ['GET', routes.billingPlans, () => json(200, seedPlans())],
  [
    'POST',
    routes.billingCheckout,
    (ctx) => {
      requireUser(ctx);
      const body = parse(CheckoutBody, ctx.body);
      const id = `chk_${++ctx.db.seq}`;
      ctx.db.checkouts.push({ id, plan: body.plan, method: body.paymentMethod, createdAt: ctx.nowMs });
      const dto: CheckoutDto = {
        checkoutId: id,
        status: 'PENDING',
        redirectUrl: body.paymentMethod === 'CARD' ? `${ctx.origin}/checkout?retorno=${id}` : null,
        pixQrCode: body.paymentMethod === 'PIX' ? fakeQr(id) : null,
        pixCopyPaste:
          body.paymentMethod === 'PIX' ? `00020126580014br.gov.bcb.pix0136precisari-demo-${id}5204000053039865802BR5909PRECISARI6013FLORIANOPOLIS6304ABCD` : null,
        boletoUrl: body.paymentMethod === 'BOLETO' ? `https://example.com/boleto/${id}` : null,
        expiresAt: new Date(ctx.nowMs + 30 * 60_000).toISOString(),
      };
      return json(201, dto);
    },
  ],

  // ---- Airbnb via Channex (demo: linking succeeds at once) ----
  [
    'GET',
    routes.channexProperty(':id'),
    (ctx) => (requireUser(ctx), json(200, channexStatus(ctx, findProperty(ctx).id))),
  ],
  [
    'POST',
    routes.channexConnect,
    (ctx) => {
      requireUser(ctx);
      const { propertyId } = parse(ChannexConnectBody, ctx.body);
      if (!ctx.db.properties.some((x) => x.id === propertyId)) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Imóvel não encontrado');
      (ctx.db.channex ??= {})[propertyId] = new Date(ctx.nowMs).toISOString();
      return json(200, { ...channexStatus(ctx, propertyId), connectUrl: `${ctx.origin}/app/imoveis/${propertyId}` });
    },
  ],
  [
    'DELETE',
    routes.channexProperty(':id'),
    (ctx) => {
      requireUser(ctx);
      const id = findProperty(ctx).id;
      if (ctx.db.channex) delete ctx.db.channex[id];
      return json(200, channexStatus(ctx, id));
    },
  ],

  // ---- admin ----
  ['GET', routes.adminEvents, (ctx) => (requireAdmin(ctx), json(200, ctx.db.events.filter((e) => !ctx.query.get('city') || e.city === ctx.query.get('city'))))],
  [
    'POST',
    routes.adminEvents,
    (ctx) => {
      requireAdmin(ctx);
      const e = { ...parse(EventBody, ctx.body), id: `evt_${++ctx.db.seq}` };
      ctx.db.events.push(e);
      return json(201, e);
    },
  ],
  [
    'PATCH',
    routes.adminEvent(':id'),
    (ctx) => {
      requireAdmin(ctx);
      const e = ctx.db.events.find((x) => x.id === ctx.params.id);
      if (!e) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Evento não encontrado');
      Object.assign(e, parse(EventBody.partial(), ctx.body));
      return json(200, e);
    },
  ],
  [
    'DELETE',
    routes.adminEvent(':id'),
    (ctx) => {
      requireAdmin(ctx);
      ctx.db.events = ctx.db.events.filter((x) => x.id !== ctx.params.id);
      return noContent();
    },
  ],
  [
    'GET',
    routes.adminHolidays,
    (ctx) =>
      (requireAdmin(ctx),
      json(
        200,
        ctx.db.holidays
          .filter((h) => !ctx.query.get('state') || h.state === ctx.query.get('state') || h.scope === 'NATIONAL')
          .sort((a, b) => a.date.localeCompare(b.date)),
      )),
  ],
  [
    'POST',
    routes.adminHolidays,
    (ctx) => {
      requireAdmin(ctx);
      const b = parse(HolidayBody, ctx.body);
      const h = { ...b, state: b.state ?? null, ibgeCode: b.ibgeCode ?? null, id: `hol_${++ctx.db.seq}` };
      ctx.db.holidays.push(h);
      return json(201, h);
    },
  ],
  [
    'PATCH',
    routes.adminHoliday(':id'),
    (ctx) => {
      requireAdmin(ctx);
      const h = ctx.db.holidays.find((x) => x.id === ctx.params.id);
      if (!h) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Feriado não encontrado');
      const b = parse(HolidayBody.partial(), ctx.body);
      Object.assign(h, b, { state: b.state === undefined ? h.state : b.state, ibgeCode: b.ibgeCode === undefined ? h.ibgeCode : b.ibgeCode });
      return json(200, h);
    },
  ],
  [
    'DELETE',
    routes.adminHoliday(':id'),
    (ctx) => {
      requireAdmin(ctx);
      ctx.db.holidays = ctx.db.holidays.filter((x) => x.id !== ctx.params.id);
      return noContent();
    },
  ],
  ['GET', routes.adminSchoolVacations, (ctx) => (requireAdmin(ctx), json(200, ctx.db.vacations.filter((v) => !ctx.query.get('state') || v.state === ctx.query.get('state'))))],
  [
    'POST',
    routes.adminSchoolVacations,
    (ctx) => {
      requireAdmin(ctx);
      const v = { ...parse(SchoolVacationBody, ctx.body), id: `vac_${++ctx.db.seq}` };
      ctx.db.vacations.push(v);
      return json(201, v);
    },
  ],
  [
    'PATCH',
    routes.adminSchoolVacation(':id'),
    (ctx) => {
      requireAdmin(ctx);
      const v = ctx.db.vacations.find((x) => x.id === ctx.params.id);
      if (!v) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Férias não encontradas');
      Object.assign(v, parse(SchoolVacationBody.partial(), ctx.body));
      return json(200, v);
    },
  ],
  [
    'DELETE',
    routes.adminSchoolVacation(':id'),
    (ctx) => {
      requireAdmin(ctx);
      ctx.db.vacations = ctx.db.vacations.filter((x) => x.id !== ctx.params.id);
      return noContent();
    },
  ],
  ['GET', routes.adminHealth, (ctx) => (requireAdmin(ctx), json(200, adminHealth(ctx.db, ctx.nowMs)))],
];

function compile(path: string): RegExp {
  const pattern = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${pattern}$`);
}

const compiled = handlers.map(([method, path, handler]) => ({ method, re: compile(path), handler, literal: !path.includes(':') }));
// Literal routes win over parameterized ones (e.g. /me/export vs /me).
compiled.sort((a, b) => Number(b.literal) - Number(a.literal));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createMockFetch(opts: MockApiOptions = {}): typeof fetch {
  const now = opts.now ?? (() => new Date());
  const storage = opts.storage ?? null;
  let db: MockDb | null = null;

  const load = (): MockDb => {
    const today = todayIso('America/Sao_Paulo', now());
    if (db && db.today === today) return db;
    if (storage) {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as MockDb;
          if (parsed.version === MOCK_DB_VERSION && parsed.today === today) return (db = parsed);
        }
      } catch {
        /* corrupted or blocked storage: reseed */
      }
    }
    return (db = createSeedDb(today, now().getTime()));
  };

  const save = () => {
    if (!storage || !db) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* storage full or blocked: state stays in memory */
    }
  };

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname;
    if (opts.latencyMs) await sleep(opts.latencyMs);
    const state = load();
    const match = compiled.find((r) => r.method === method && r.re.test(path));
    if (!match) return json(404, { code: ErrorCode.NOT_FOUND, message: `Rota não encontrada: ${method} ${path}` });
    let body: unknown;
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        return json(400, { code: ErrorCode.VALIDATION, message: 'JSON inválido' });
      }
    }
    const ctx: Ctx = {
      db: state,
      params: { ...(match.re.exec(path)?.groups ?? {}) },
      query: url.searchParams,
      body,
      nowMs: now().getTime(),
      headers: new Headers(init?.headers),
      origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    };
    try {
      const res = await match.handler(ctx);
      if (method !== 'GET' || path === routes.me) save();
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { code: e.code, message: e.message, details: e.details });
      return json(500, { code: ErrorCode.INTERNAL, message: e instanceof Error ? e.message : 'Erro interno' });
    }
  };
}

/** Clears persisted mock state (used by "reset demo" and tests). */
export function resetMockStorage(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEY);
}
