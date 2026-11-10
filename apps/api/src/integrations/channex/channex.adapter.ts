import { z } from 'zod';
import { fetchJson, type FetchFn } from '../common/http';
import type { ChannexBookingRevision, ChannexConnectInput, ChannexIds, ChannexProvider, ChannexRate, HealthStatus } from '../ports';

/**
 * Channex.io channel manager (`CHANNEX_BASE_URL`: staging.channex.io or app.channex.io + `/api/v1`).
 * Each Precisari property maps to one Channex property with one room type ("whole place") and one rate plan.
 * Formats checked against staging: integer `rate` is minor units (48900 ⇒ "489.00"); restrictions answer
 * with a task; the one-time token opens the embedded channel screen (`/auth/exchange`).
 */
const Created = z.object({ data: z.object({ id: z.string() }) });
const Ok = z.unknown(); // ack / delete / restrictions: only the HTTP status matters

const Token = z.object({ data: z.object({ token: z.string() }) });
const Channels = z.object({ data: z.array(z.object({ attributes: z.object({ is_active: z.boolean().optional() }).passthrough() })) });
const Revisions = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({
        property_id: z.string(),
        booking_id: z.string(),
        status: z.enum(['new', 'modified', 'cancelled']),
        arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.string().nullish(),
      }),
    }),
  ),
});

const DAY_MS = 86_400_000;

/** Merge consecutive dates with the same price/minStay into ranges (fewer restriction values). */
export function toRanges(rates: ChannexRate[]): { from: string; to: string; priceCents: number; minStay: number }[] {
  const sorted = [...rates].sort((a, b) => a.date.localeCompare(b.date));
  const out: { from: string; to: string; priceCents: number; minStay: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const contiguous = last && Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${last.to}T00:00:00Z`) === DAY_MS;
    if (last && contiguous && last.priceCents === r.priceCents && last.minStay === r.minStay) last.to = r.date;
    else out.push({ from: r.date, to: r.date, priceCents: r.priceCents, minStay: r.minStay });
  }
  return out;
}

/** "1234.50" ⇒ 123450; anything unparsable ⇒ null. */
export function decimalToCents(amount: string | null | undefined): number | null {
  if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount)) return null;
  const [whole = '0', frac = ''] = amount.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export class ChannexHttpProvider implements ChannexProvider {
  readonly provider = 'channex';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn?: FetchFn,
  ) {}

  private call<T extends z.ZodTypeAny>(path: string, schema: T, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown): Promise<z.infer<T>> {
    return fetchJson('channex', `${this.baseUrl}${path}`, schema, { method, body, headers: { 'user-api-key': this.apiKey }, fetchFn: this.fetchFn, timeoutMs: 20_000 });
  }

  async connectProperty(input: ChannexConnectInput): Promise<ChannexIds> {
    const property = await this.call('/properties', Created, 'POST', {
      property: {
        title: input.title,
        currency: input.currency,
        timezone: input.timezone,
        country: 'BR',
        property_type: 'apartment',
        // Our id, so a Channex property can be traced back.
        content: { description: `precisari:${input.propertyId}` },
      },
    });
    const channexPropertyId = property.data.id;
    const occupancy = Math.max(1, input.capacity);
    const room = await this.call('/room_types', Created, 'POST', {
      room_type: { property_id: channexPropertyId, title: 'Imóvel inteiro', count_of_rooms: 1, occ_adults: occupancy, occ_children: 0, occ_infants: 0, default_occupancy: occupancy },
    });
    const plan = await this.call('/rate_plans', Created, 'POST', {
      rate_plan: {
        property_id: channexPropertyId,
        room_type_id: room.data.id,
        title: 'Precisari',
        currency: input.currency,
        sell_mode: 'per_room',
        rate_mode: 'manual',
        options: [{ occupancy, is_primary: true, rate: input.basePriceCents }],
      },
    });
    await this.call('/webhooks', Created, 'POST', {
      webhook: {
        property_id: channexPropertyId,
        callback_url: input.webhook.url,
        event_mask: 'booking',
        headers: { 'x-precisari-secret': input.webhook.secret },
        is_active: true,
        send_data: false,
      },
    });
    return { channexPropertyId, roomTypeId: room.data.id, ratePlanId: plan.data.id };
  }

  async connectUrl(channexPropertyId: string, username: string): Promise<string> {
    const res = await this.call('/auth/one_time_token', Token, 'POST', { one_time_token: { property_id: channexPropertyId, username } });
    const server = this.baseUrl.replace(/\/api\/v1\/?$/, '');
    const q = new URLSearchParams({ oauth_session_key: res.data.token, app_mode: 'headless', redirect_to: '/channels', property_id: channexPropertyId, channels: 'ABB', lng: 'pt' });
    return `${server}/auth/exchange?${q.toString()}`;
  }

  async hasActiveChannel(channexPropertyId: string): Promise<boolean> {
    const res = await this.call(`/channels?filter[property_id]=${encodeURIComponent(channexPropertyId)}`, Channels);
    return res.data.some((c) => c.attributes.is_active === true);
  }

  async pushRates(ids: Pick<ChannexIds, 'channexPropertyId' | 'ratePlanId'>, rates: ChannexRate[]): Promise<void> {
    if (rates.length === 0) return;
    const values = toRanges(rates).map((r) => ({
      property_id: ids.channexPropertyId,
      rate_plan_id: ids.ratePlanId,
      date_from: r.from,
      date_to: r.to,
      rate: r.priceCents, // integer ⇒ minor units
      min_stay_arrival: r.minStay,
    }));
    await this.call('/restrictions', Ok, 'POST', { values });
  }

  async bookingRevisions(): Promise<ChannexBookingRevision[]> {
    const res = await this.call('/booking_revisions/feed', Revisions);
    return res.data.map((r) => ({
      id: r.id,
      channexPropertyId: r.attributes.property_id,
      bookingId: r.attributes.booking_id,
      status: r.attributes.status,
      arrivalDate: r.attributes.arrival_date,
      departureDate: r.attributes.departure_date,
      amountCents: decimalToCents(r.attributes.amount),
    }));
  }

  async ackRevision(id: string): Promise<void> {
    await this.call(`/booking_revisions/${encodeURIComponent(id)}/ack`, Ok, 'POST');
  }

  async deleteProperty(channexPropertyId: string): Promise<void> {
    await this.call(`/properties/${encodeURIComponent(channexPropertyId)}`, Ok, 'DELETE');
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: this.apiKey.length > 0, detail: this.apiKey ? this.baseUrl : 'CHANNEX_API_KEY ausente' };
  }
}
