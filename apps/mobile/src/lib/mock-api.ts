/**
 * Mock mode: a fake `fetch` implementing the Precisari REST contract (packages/shared/src/routes.ts).
 * Enabled with EXPO_PUBLIC_API_MOCK=true. In-memory state; any 6-digit OTP signs in as the demo host.
 * Every response is shaped by the shared Zod DTOs (verified in mock-api.test.ts).
 */
import { z } from 'zod';
import {
  API_PREFIX,
  ConnectCalendarBody,
  CreatePropertyBody,
  ErrorCode,
  OtpRequestBody,
  OtpVerifyBody,
  RefreshBody,
  RegisterDeviceBody,
  UpdateMeBody,
  UpdatePropertyBody,
  type ActionDto,
  type ActionsResponse,
  type AuthSession,
  type AuthTokens,
  type CalendarSourceDto,
  type ChannexStatusDto,
  type NightsResponse,
  type PropertyDto,
  type SyncResultDto,
  type UserDto,
} from '@precisari/shared';
import { addDays, localIso } from './dates';
import {
  computeNight,
  demoActions,
  demoInsights,
  demoPlaces,
  demoPlans,
  demoPropertyState,
  demoUser,
  newPropertyState,
  nightDetail,
  type MockPropertyState,
} from './mock-data';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface MockDb {
  today: string;
  user: UserDto;
  properties: Map<string, MockPropertyState>;
  actions: ActionDto[];
  /** Registered Expo push tokens. */
  devices: string[];
  seq: number;
}

export interface MockApiOptions {
  /** Override "today" (yyyy-mm-dd) for deterministic tests. */
  today?: string;
  /** Artificial latency in ms (default 250; 0 in tests). */
  latencyMs?: number;
  /** Start with no properties (exercises onboarding). */
  empty?: boolean;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function issueTokens(): AuthTokens {
  const stamp = Date.now().toString(36);
  return { accessToken: `mock-access-${stamp}`, refreshToken: `mock-refresh-${stamp}`, expiresIn: 3600 };
}

function parseBody<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, ErrorCode.VALIDATION, 'Dados inválidos', r.error.issues);
  return r.data as z.output<S>;
}

export function createMockDb(opts: MockApiOptions = {}): MockDb {
  const today = opts.today ?? localIso();
  const demo = demoPropertyState(today);
  const properties = new Map<string, MockPropertyState>();
  if (!opts.empty) properties.set(demo.property.id, demo);
  return {
    today,
    user: demoUser(today),
    properties,
    actions: opts.empty ? [] : demoActions(demo, today),
    devices: [],
    seq: 1,
  };
}

export function createMockFetch(opts: MockApiOptions = {}): FetchLike {
  const db = createMockDb(opts);
  const latency = opts.latencyMs ?? 250;

  const pendingFor = (propertyId: string) =>
    new Map(db.actions.filter((a) => a.propertyId === propertyId && a.status === 'PENDING').map((a) => [a.date, a]));

  const linkedAt = new Map<string, string>();
  const channexStatus = (propertyId: string): ChannexStatusDto => {
    const at = linkedAt.get(propertyId) ?? null;
    return { propertyId, state: at ? 'LINKED' : 'DISCONNECTED', lastSyncAt: at, lastError: null };
  };

  const getProperty = (id: string): MockPropertyState => {
    const p = db.properties.get(id);
    if (!p) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Imóvel não encontrado');
    return p;
  };

  const decide = (id: string, status: ActionDto['status']): ActionDto => {
    const a = db.actions.find((x) => x.id === id);
    if (!a) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Ação não encontrada');
    const state = db.properties.get(a.propertyId);
    if (status === 'REVERTED') {
      if (a.status === 'PENDING') throw new HttpError(409, ErrorCode.CONFLICT, 'Nada para desfazer');
      state?.approved.delete(a.date);
      // Reverting puts the suggestion back in the queue (RF-41 undo).
      a.status = 'PENDING';
      a.decidedAt = null;
      return { ...a };
    }
    if (a.status !== 'PENDING') throw new HttpError(409, ErrorCode.CONFLICT, 'Ação já decidida');
    a.status = status;
    a.decidedAt = new Date().toISOString();
    if (status === 'APPROVED' && a.type === 'PRICE') state?.approved.set(a.date, a.toValue);
    return { ...a };
  };

  async function handle(method: string, path: string, query: URLSearchParams, headers: Headers, body: unknown): Promise<Response> {
    const authed = /^Bearer mock-access-/.test(headers.get('Authorization') ?? '');
    const requireAuth = () => {
      if (!authed) throw new HttpError(401, ErrorCode.UNAUTHORIZED, 'Sessão expirada');
    };
    let m: RegExpMatchArray | null;

    // ---- auth ----
    if (method === 'POST' && path === '/auth/otp/request') {
      parseBody(OtpRequestBody, body);
      return json(204, null);
    }
    if (method === 'POST' && path === '/auth/otp/verify') {
      const b = parseBody(OtpVerifyBody, body);
      if (b.code === '000000') throw new HttpError(400, ErrorCode.OTP_INVALID, 'Código inválido');
      db.user = { ...db.user, email: b.email };
      const session: AuthSession = { ...issueTokens(), user: db.user };
      return json(200, session);
    }
    if (method === 'POST' && /^\/auth\/oauth\/(apple|google)$/.test(path)) {
      throw new HttpError(501, ErrorCode.NOT_IMPLEMENTED, 'Login social em breve');
    }
    if (method === 'POST' && path === '/auth/refresh') {
      const b = parseBody(RefreshBody, body);
      if (!b.refreshToken.startsWith('mock-refresh-')) throw new HttpError(401, ErrorCode.REFRESH_INVALID, 'Sessão expirada');
      return json(200, issueTokens());
    }
    if (method === 'POST' && path === '/auth/logout') return json(204, null);
    if (path === '/billing/plans' && method === 'GET') return json(200, demoPlans);
    if (path === '/health') return json(200, { status: 'ok' });

    requireAuth();

    // ---- me ----
    if (path === '/me') {
      if (method === 'GET') return json(200, db.user);
      if (method === 'PATCH') {
        db.user = { ...db.user, ...parseBody(UpdateMeBody, body) };
        return json(200, db.user);
      }
      if (method === 'DELETE') {
        db.properties.clear();
        db.actions = [];
        return json(204, null);
      }
    }
    if (method === 'GET' && path === '/me/export') {
      return json(200, {
        exportedAt: new Date().toISOString(),
        user: db.user,
        properties: [...db.properties.values()].map((s) => s.property),
        actions: db.actions,
      });
    }

    // ---- properties ----
    if (path === '/properties') {
      if (method === 'GET') return json(200, [...db.properties.values()].map((s) => s.property));
      if (method === 'POST') {
        const b = parseBody(CreatePropertyBody, body);
        const id = `prop_${db.seq++}`;
        const property: PropertyDto = {
          id,
          name: b.name,
          address: b.address,
          lat: b.lat,
          lng: b.lng,
          city: b.city,
          state: b.state,
          ibgeCode: b.ibgeCode ?? null,
          destinationType: b.destinationType,
          capacity: b.capacity,
          bedrooms: b.bedrooms,
          basePrice: b.basePrice,
          minPrice: b.minPrice,
          maxPrice: b.maxPrice ?? b.basePrice * 3,
          cleaningFee: b.cleaningFee,
          monthlyFixedCosts: b.monthlyFixedCosts ?? null,
          platformFeePct: b.platformFeePct,
          aggressiveness: b.aggressiveness,
          rulesConfig: b.rulesConfig,
          timezone: b.timezone,
          listingUrl: b.listingUrl ?? null,
          photoUrl: b.photoUrl ?? null,
          calendarSources: [],
          createdAt: new Date().toISOString(),
        };
        db.properties.set(id, newPropertyState(property, db.today));
        return json(201, property);
      }
    }
    if ((m = path.match(/^\/properties\/([^/]+)$/))) {
      const state = getProperty(m[1] ?? '');
      if (method === 'GET') return json(200, state.property);
      if (method === 'PATCH') {
        const b = parseBody(UpdatePropertyBody, body);
        const next = { ...state.property, ...b } as PropertyDto;
        if (next.minPrice > next.basePrice || next.maxPrice < next.basePrice) {
          throw new HttpError(400, ErrorCode.VALIDATION, 'Limites de preço inválidos');
        }
        state.property = next;
        return json(200, state.property);
      }
      if (method === 'DELETE') {
        db.properties.delete(state.property.id);
        db.actions = db.actions.filter((a) => a.propertyId !== state.property.id);
        return json(204, null);
      }
    }
    if (method === 'POST' && (m = path.match(/^\/properties\/([^/]+)\/calendar-sources$/))) {
      const state = getProperty(m[1] ?? '');
      const b = parseBody(ConnectCalendarBody, body);
      if (!/ical|\.ics/i.test(b.url)) throw new HttpError(400, ErrorCode.ICAL_INVALID, 'Link iCal inválido');
      const source: CalendarSourceDto = {
        id: `cal_${db.seq++}`,
        type: 'ICAL',
        urlMasked: `${b.url.slice(0, 36)}••••`,
        lastSyncAt: new Date().toISOString(),
        status: 'OK',
        lastError: null,
      };
      state.property = { ...state.property, calendarSources: [source] };
      return json(201, source);
    }
    if (method === 'POST' && (m = path.match(/^\/properties\/([^/]+)\/sync$/))) {
      const state = getProperty(m[1] ?? '');
      const now = new Date().toISOString();
      state.property = {
        ...state.property,
        calendarSources: state.property.calendarSources.map((c) => ({ ...c, lastSyncAt: now, status: 'OK', lastError: null })),
      };
      const result: SyncResultDto = { status: 'OK', bookingsImported: Math.round(state.booked.size / 2.5), changed: false, lastSyncAt: now, error: null };
      return json(200, result);
    }
    // Airbnb via Channex (demo: linking succeeds at once).
    if ((m = path.match(/^\/integrations\/channex\/([^/]+)$/)) && m[1] !== 'webhook' && m[1] !== 'connect') {
      const id = getProperty(m[1] ?? '').property.id;
      if (method === 'DELETE') linkedAt.delete(id);
      return json(200, channexStatus(id));
    }
    if (method === 'POST' && path === '/integrations/channex/connect') {
      const { propertyId } = z.object({ propertyId: z.string() }).parse(body);
      getProperty(propertyId);
      linkedAt.set(propertyId, new Date().toISOString());
      return json(200, { ...channexStatus(propertyId), connectUrl: 'https://www.precisari.com.br/app/imoveis' });
    }
    if (method === 'GET' && (m = path.match(/^\/properties\/([^/]+)\/nights$/))) {
      const state = getProperty(m[1] ?? '');
      const from = query.get('from') ?? db.today;
      const to = query.get('to') ?? addDays(from, 89);
      const pending = pendingFor(state.property.id);
      const nights = [];
      for (let d = from; d <= to; d = addDays(d, 1)) nights.push(computeNight(state, d, db.today, pending.get(d)));
      const potentialGain = nights
        .filter((n) => n.status === 'free')
        .reduce((acc, n) => acc + Math.max(0, n.suggestedPrice - n.currentPrice), 0);
      const res: NightsResponse = { propertyId: state.property.id, from, to, potentialGain, nights };
      return json(200, res);
    }
    if (method === 'GET' && (m = path.match(/^\/properties\/([^/]+)\/nights\/(\d{4}-\d{2}-\d{2})$/))) {
      const state = getProperty(m[1] ?? '');
      const date = m[2] ?? db.today;
      return json(200, nightDetail(state, date, db.today, pendingFor(state.property.id).get(date)));
    }
    if (method === 'GET' && (m = path.match(/^\/properties\/([^/]+)\/insights$/))) {
      const state = getProperty(m[1] ?? '');
      const decided = db.actions.filter((a) => a.propertyId === state.property.id && a.status !== 'PENDING');
      const approved = decided.filter((a) => a.status === 'APPROVED' || a.status === 'APPLIED').length;
      const rate = decided.length ? approved / decided.length : 0.62;
      return json(200, demoInsights(state.property.id, query.get('month') ?? db.today.slice(0, 7), rate));
    }

    // ---- places ----
    if (method === 'GET' && path === '/places/autocomplete') {
      const q = (query.get('q') ?? '').trim().toLowerCase();
      if (q.length < 3) return json(200, []);
      const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const hits = demoPlaces.filter((p) => norm(p.address).includes(norm(q)));
      const list = (hits.length ? hits : demoPlaces.slice(0, 3)).map((p) => ({ placeId: p.placeId, description: p.address }));
      return json(200, list);
    }
    if (method === 'GET' && (m = path.match(/^\/places\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1] ?? '');
      const place = demoPlaces.find((p) => p.placeId === id);
      if (!place) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Endereço não encontrado');
      return json(200, place);
    }

    // ---- actions ----
    if (method === 'GET' && path === '/actions') {
      const status = query.get('status');
      const propertyId = query.get('propertyId');
      const items = db.actions
        .filter((a) => (!status || a.status === status) && (!propertyId || a.propertyId === propertyId))
        .sort((a, b) => b.estimatedGain - a.estimatedGain || a.date.localeCompare(b.date));
      const res: ActionsResponse = {
        items: items.map((a) => ({ ...a })),
        nextCursor: null,
        totalEstimatedGain: items.filter((a) => a.status === 'PENDING').reduce((acc, a) => acc + a.estimatedGain, 0),
      };
      return json(200, res);
    }
    if (method === 'POST' && (m = path.match(/^\/actions\/([^/]+)\/(approve|dismiss|revert)$/))) {
      const status = m[2] === 'approve' ? 'APPROVED' : m[2] === 'dismiss' ? 'DISMISSED' : 'REVERTED';
      return json(200, decide(m[1] ?? '', status));
    }

    // ---- devices / billing ----
    if (method === 'POST' && path === '/devices') {
      const b = parseBody(RegisterDeviceBody, body);
      if (!db.devices.includes(b.expoPushToken)) db.devices.push(b.expoPushToken);
      return json(204, null);
    }
    if (method === 'POST' && path === '/billing/checkout') {
      throw new HttpError(501, ErrorCode.NOT_IMPLEMENTED, 'Checkout é feito na web');
    }

    throw new HttpError(404, ErrorCode.NOT_FOUND, `Rota mock não encontrada: ${method} ${path}`);
  }

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname;
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    try {
      return await handle(method, path, url.searchParams, headers, body);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { code: e.code, message: e.message, details: e.details });
      return json(500, { code: ErrorCode.INTERNAL, message: e instanceof Error ? e.message : 'Erro interno' });
    }
  };
}
