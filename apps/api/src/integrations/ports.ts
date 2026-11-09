/**
 * Adapter ports (interfaces + DI tokens) for every third-party integration.
 * Domain code injects these tokens; implementations (real + fake) live in src/integrations/<name>/.
 */
import type { DestinationType, EventSize, PaymentMethod, Plan, BillingCycle, BillingWebhookEvent } from '@precisari/shared';

// ---------- Common: adapter metadata for /admin/health ----------
export interface HealthStatus { ok: boolean; detail: string | null }
/** Every adapter exposes its provider name and, when cheap, a health check. Optional so ad-hoc test doubles stay valid. */
export interface IntegrationAdapter {
  /** Provider id, e.g. 'resend', 'brasilapi', 'fake'. */
  readonly provider?: string;
  /** Cheap reachability/config check (no paid calls). */
  healthCheck?(): Promise<HealthStatus>;
}

// ---------- Email (Resend) ----------
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export interface EmailMessage { to: string; subject: string; text: string; html?: string }
export interface EmailSender extends IntegrationAdapter { send(msg: EmailMessage): Promise<void> }

// ---------- Holidays (BrasilAPI) ----------
export const HOLIDAYS_PROVIDER = Symbol('HOLIDAYS_PROVIDER');
export interface NationalHoliday { date: string; name: string; type: string }
export interface HolidaysProvider extends IntegrationAdapter { nationalHolidays(year: number): Promise<NationalHoliday[]> }

// ---------- Weather (Open-Meteo) ----------
export const WEATHER_PROVIDER = Symbol('WEATHER_PROVIDER');
export interface DailyForecast { date: string; precipProb: number; precipMm: number | null; tempMin: number; tempMax: number }
export interface WeatherProvider extends IntegrationAdapter {
  /** Daily forecast D-0..D-(days-1); may include `pastDays` before today. Dates are local to `timezone`. */
  forecast(lat: number, lng: number, opts?: { days?: number; pastDays?: number; timezone?: string }): Promise<DailyForecast[]>;
}

// ---------- Geo (Google Places) ----------
export const GEO_PROVIDER = Symbol('GEO_PROVIDER');
export interface PlaceSuggestion { placeId: string; description: string }
export interface PlaceDetails {
  placeId: string; address: string; lat: number; lng: number; city: string; state: string; ibgeCode: string | null;
  suggestedDestinationType: DestinationType;
}
export interface GeoProvider extends IntegrationAdapter {
  autocomplete(query: string, sessionToken?: string): Promise<PlaceSuggestion[]>;
  details(placeId: string): Promise<PlaceDetails>;
}

// ---------- LLM (Anthropic) — explanations and event classification only; NEVER prices ----------
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export interface ExplanationInput {
  date: string; weekdayLabel: string; status: 'free' | 'booked' | 'blocked';
  fromPrice: number; toPrice: number; minStay: number; destinationType: DestinationType;
  propertyName: string; factors: { key: string; multiplier: number; label: string }[];
}
export interface ExplanationOutput { headline: string; text: string }
export interface EventClassificationInput { name: string; description?: string; city: string; venue?: string }
export interface EventClassificationOutput { size: EventSize; radiusKm: number; confidence: number }
export interface LlmProvider extends IntegrationAdapter {
  readonly model: string;
  explain(input: ExplanationInput): Promise<ExplanationOutput>;
  classifyEvent(input: EventClassificationInput): Promise<EventClassificationOutput>;
}

// ---------- Push (Expo) ----------
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export interface PushMessage { to: string; title: string; body: string; data?: Record<string, unknown> }
export interface PushResult { token: string; ok: boolean; error?: 'DeviceNotRegistered' | string }
export interface PushProvider extends IntegrationAdapter { send(messages: PushMessage[]): Promise<PushResult[]> }

// ---------- Billing (gateway TBD) ----------
export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
export interface CreateCheckoutInput {
  userId: string; email: string; plan: Exclude<Plan, 'FREE'>; cycle: BillingCycle; paymentMethod: PaymentMethod;
  propertyCount: number; amountCents: number; taxId?: string;
}
export interface CheckoutResult {
  checkoutId: string; providerRef: string; status: 'PENDING' | 'PAID'; redirectUrl: string | null;
  pixQrCode: string | null; pixCopyPaste: string | null; boletoUrl: string | null; expiresAt: string | null;
}
export interface BillingProvider extends IntegrationAdapter {
  readonly name: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  /** Verify signature and normalize the payload. Throws on invalid signature. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<BillingWebhookEvent>;
  cancel(providerRef: string): Promise<void>;
}

// ---------- Channel manager (Channex, phase 2) ----------
export const CHANNEX_PROVIDER = Symbol('CHANNEX_PROVIDER');
export interface ChannexRate { date: string; priceCents: number; minStay: number }
export interface ChannexProvider extends IntegrationAdapter {
  connectProperty(input: { propertyId: string; title: string; currency: 'BRL'; timezone: string }): Promise<{ channexPropertyId: string }>;
  pushRates(channexPropertyId: string, rates: ChannexRate[]): Promise<void>;
}
