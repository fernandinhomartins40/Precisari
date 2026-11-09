/**
 * Typed REST client for the Precisari API (/v1), validated with the Zod schemas in @precisari/shared.
 * Used by apps/web and apps/mobile. Handles bearer auth and transparent refresh-token rotation.
 * (The API also serves OpenAPI at /docs-json; this client mirrors it by hand from the shared contracts.)
 */
import { z } from 'zod';
import {
  API_PREFIX,
  ActionDto,
  ActionsResponse,
  AdminHealthDto,
  ApiError,
  AuthSession,
  AuthTokens,
  CalendarSourceDto,
  CheckoutDto,
  EventDto,
  HolidayDto,
  InsightsDto,
  NightDetailDto,
  NightsResponse,
  PlaceDetailsDto,
  PlaceSuggestionDto,
  PlanDto,
  PropertyDto,
  SchoolVacationDto,
  SyncResultDto,
  UserDto,
  routes,
  type ActionStatus,
  type CheckoutBody,
  type CreatePropertyBody,
  type EventBody,
  type HolidayBody,
  type OtpVerifyBody,
  type RegisterDeviceBody,
  type SchoolVacationBody,
  type UpdateMeBody,
  type UpdatePropertyBody,
} from '@precisari/shared';

export class PrecisariApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PrecisariApiError';
  }
}

export interface TokenStore {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(tokens: AuthTokens): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface ClientOptions {
  baseUrl: string;
  tokens?: TokenStore;
  fetch?: typeof fetch;
  /** Called when refresh fails (session expired) — e.g. redirect to login. */
  onSessionExpired?: () => void;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOpts {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
  idempotencyKey?: string;
}

function randomKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class PrecisariClient {
  private refreshing: Promise<boolean> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
  }

  private url(path: string, query?: RequestOpts['query']): string {
    const base = this.opts.baseUrl.replace(/\/$/, '') + API_PREFIX + path;
    if (!query) return base;
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return qs ? `${base}?${qs}` : base;
  }

  private async raw(method: Method, path: string, o: RequestOpts, retry = true): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey;
    if (o.auth !== false && this.opts.tokens) {
      const t = await this.opts.tokens.getAccessToken();
      if (t) headers.Authorization = `Bearer ${t}`;
    }
    const res = await this.fetchImpl(this.url(path, o.query), {
      method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
    if (res.status === 401 && retry && o.auth !== false && this.opts.tokens) {
      if (await this.tryRefresh()) return this.raw(method, path, o, false);
      this.opts.onSessionExpired?.();
    }
    if (res.status === 204) return undefined;
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const parsed = ApiError.safeParse(json);
      if (parsed.success) throw new PrecisariApiError(res.status, parsed.data.code, parsed.data.message, parsed.data.details);
      throw new PrecisariApiError(res.status, 'HTTP_ERROR', `HTTP ${res.status}`);
    }
    return json;
  }

  private async req<T extends z.ZodTypeAny>(schema: T, method: Method, path: string, o: RequestOpts = {}): Promise<z.infer<T>> {
    return schema.parse(await this.raw(method, path, o)) as z.infer<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const rt = await this.opts.tokens?.getRefreshToken();
        if (!rt) return false;
        try {
          const tokens = await this.req(AuthTokens, 'POST', routes.refresh, { body: { refreshToken: rt }, auth: false });
          await this.opts.tokens?.setTokens(tokens);
          return true;
        } catch {
          await this.opts.tokens?.clear();
          return false;
        }
      })().finally(() => {
        setTimeout(() => (this.refreshing = null), 0);
      });
    }
    return this.refreshing;
  }

  // ---------- auth ----------
  auth = {
    requestOtp: (email: string) => this.raw('POST', routes.otpRequest, { body: { email }, auth: false }).then(() => undefined),
    verifyOtp: async (body: OtpVerifyBody) => {
      const s = await this.req(AuthSession, 'POST', routes.otpVerify, { body, auth: false });
      await this.opts.tokens?.setTokens(s);
      return s;
    },
    oauth: async (provider: 'apple' | 'google', idToken: string, name?: string) => {
      const s = await this.req(AuthSession, 'POST', routes.oauth(provider), { body: { idToken, name }, auth: false });
      await this.opts.tokens?.setTokens(s);
      return s;
    },
    logout: async () => {
      const rt = await this.opts.tokens?.getRefreshToken();
      if (rt) await this.raw('POST', routes.logout, { body: { refreshToken: rt } }).catch(() => undefined);
      await this.opts.tokens?.clear();
    },
  };

  // ---------- me ----------
  me = {
    get: () => this.req(UserDto, 'GET', routes.me),
    update: (body: UpdateMeBody) => this.req(UserDto, 'PATCH', routes.me, { body }),
    delete: () => this.raw('DELETE', routes.me, {}).then(() => undefined),
    export: () => this.raw('GET', routes.meExport, {}),
  };

  // ---------- properties ----------
  properties = {
    list: () => this.req(z.array(PropertyDto), 'GET', routes.properties),
    get: (id: string) => this.req(PropertyDto, 'GET', routes.property(id)),
    create: (body: CreatePropertyBody) => this.req(PropertyDto, 'POST', routes.properties, { body }),
    update: (id: string, body: UpdatePropertyBody) => this.req(PropertyDto, 'PATCH', routes.property(id), { body }),
    delete: (id: string) => this.raw('DELETE', routes.property(id), {}).then(() => undefined),
    connectCalendar: (id: string, url: string) =>
      this.req(CalendarSourceDto, 'POST', routes.calendarSources(id), { body: { url } }),
    sync: (id: string) => this.req(SyncResultDto, 'POST', routes.sync(id)),
    nights: (id: string, q: { from?: string; to?: string } = {}) =>
      this.req(NightsResponse, 'GET', routes.nights(id), { query: q }),
    night: (id: string, date: string) => this.req(NightDetailDto, 'GET', routes.night(id, date)),
    insights: (id: string, month?: string) => this.req(InsightsDto, 'GET', routes.insights(id), { query: { month } }),
  };

  // ---------- places ----------
  places = {
    autocomplete: (q: string) => this.req(z.array(PlaceSuggestionDto), 'GET', routes.placesAutocomplete, { query: { q } }),
    details: (placeId: string) => this.req(PlaceDetailsDto, 'GET', routes.placeDetails(placeId)),
  };

  // ---------- actions ----------
  actions = {
    list: (q: { status?: ActionStatus; propertyId?: string; cursor?: string; limit?: number } = {}) =>
      this.req(ActionsResponse, 'GET', routes.actions, { query: q }),
    approve: (id: string, idempotencyKey = randomKey()) =>
      this.req(ActionDto, 'POST', routes.actionApprove(id), { idempotencyKey }),
    dismiss: (id: string, idempotencyKey = randomKey()) =>
      this.req(ActionDto, 'POST', routes.actionDismiss(id), { idempotencyKey }),
    revert: (id: string, idempotencyKey = randomKey()) =>
      this.req(ActionDto, 'POST', routes.actionRevert(id), { idempotencyKey }),
  };

  // ---------- devices ----------
  devices = {
    register: (body: RegisterDeviceBody) => this.raw('POST', routes.devices, { body }).then(() => undefined),
  };

  // ---------- billing ----------
  billing = {
    plans: () => this.req(z.array(PlanDto), 'GET', routes.billingPlans, { auth: false }),
    checkout: (body: CheckoutBody, idempotencyKey = randomKey()) =>
      this.req(CheckoutDto, 'POST', routes.billingCheckout, { body, idempotencyKey }),
  };

  // ---------- admin ----------
  admin = {
    events: { list: (q: { city?: string } = {}) => this.req(z.array(EventDto), 'GET', routes.adminEvents, { query: q }),
      create: (b: EventBody) => this.req(EventDto, 'POST', routes.adminEvents, { body: b }),
      update: (id: string, b: Partial<EventBody>) => this.req(EventDto, 'PATCH', routes.adminEvent(id), { body: b }),
      delete: (id: string) => this.raw('DELETE', routes.adminEvent(id), {}).then(() => undefined) },
    holidays: { list: (q: { state?: string; year?: number } = {}) => this.req(z.array(HolidayDto), 'GET', routes.adminHolidays, { query: q }),
      create: (b: HolidayBody) => this.req(HolidayDto, 'POST', routes.adminHolidays, { body: b }),
      update: (id: string, b: Partial<HolidayBody>) => this.req(HolidayDto, 'PATCH', routes.adminHoliday(id), { body: b }),
      delete: (id: string) => this.raw('DELETE', routes.adminHoliday(id), {}).then(() => undefined) },
    schoolVacations: { list: (q: { state?: string; year?: number } = {}) => this.req(z.array(SchoolVacationDto), 'GET', routes.adminSchoolVacations, { query: q }),
      create: (b: SchoolVacationBody) => this.req(SchoolVacationDto, 'POST', routes.adminSchoolVacations, { body: b }),
      update: (id: string, b: Partial<SchoolVacationBody>) => this.req(SchoolVacationDto, 'PATCH', routes.adminSchoolVacation(id), { body: b }),
      delete: (id: string) => this.raw('DELETE', routes.adminSchoolVacation(id), {}).then(() => undefined) },
    health: () => this.req(AdminHealthDto, 'GET', routes.adminHealth),
  };
}

export function createClient(opts: ClientOptions): PrecisariClient {
  return new PrecisariClient(opts);
}

/** Simple in-memory token store (tests / SSR). Apps provide persistent stores (SecureStore, localStorage). */
export function memoryTokenStore(): TokenStore {
  let tokens: AuthTokens | null = null;
  return {
    getAccessToken: () => tokens?.accessToken ?? null,
    getRefreshToken: () => tokens?.refreshToken ?? null,
    setTokens: (t) => void (tokens = t),
    clear: () => void (tokens = null),
  };
}
