import { z } from 'zod';
import { fetchJson, IntegrationError, type FetchFn } from '../common/http';
import type { ChannexProvider, ChannexRate, HealthStatus } from '../ports';

/**
 * Channex.io channel manager (phase 2) — SKELETON against staging (`CHANNEX_BASE_URL`).
 * TODO(PRD §9) before production, confirm with Channex:
 *  - white-label certification and Airbnb feature support;
 *  - per-night price and per-date minimum stay (min_stay_arrival vs min_stay_through) for Airbnb;
 *  - rate format (decimal string vs minor units) and room type / rate plan provisioning per property;
 *  - webhook payloads + signature for bookings (POST /integrations/channex/webhook is a stub).
 */
export const ChannexPropertyResponse = z.object({
  data: z.object({ id: z.string(), type: z.string().optional() }),
});
export const ChannexRatePlansResponse = z.object({
  data: z.array(z.object({ id: z.string() })),
});
export const ChannexRestrictionsResponse = z.object({}).passthrough();

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

export class ChannexHttpProvider implements ChannexProvider {
  readonly provider = 'channex';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn?: FetchFn,
  ) {}

  private headers(): Record<string, string> {
    return { 'user-api-key': this.apiKey };
  }

  async connectProperty(input: { propertyId: string; title: string; currency: 'BRL'; timezone: string }): Promise<{ channexPropertyId: string }> {
    const res = await fetchJson('channex', `${this.baseUrl}/properties`, ChannexPropertyResponse, {
      method: 'POST',
      headers: this.headers(),
      body: {
        property: {
          title: input.title,
          currency: input.currency,
          timezone: input.timezone,
          country: 'BR',
          property_type: 'apartment',
          // Our id, so the property can be found from Channex webhooks.
          content: { description: `precisari:${input.propertyId}` },
        },
      },
      fetchFn: this.fetchFn,
    });
    // TODO(channex): create room type + rate plan (occupancy, BRL) and map the Airbnb listing.
    return { channexPropertyId: res.data.id };
  }

  async pushRates(channexPropertyId: string, rates: ChannexRate[]): Promise<void> {
    if (rates.length === 0) return;
    // TODO(channex): store the rate plan id on CalendarSource instead of looking it up on every push.
    const plans = await fetchJson(
      'channex',
      `${this.baseUrl}/rate_plans?filter[property_id]=${encodeURIComponent(channexPropertyId)}`,
      ChannexRatePlansResponse,
      { headers: this.headers(), fetchFn: this.fetchFn },
    );
    const ratePlanId = plans.data[0]?.id;
    if (!ratePlanId) throw new IntegrationError('channex', 'property has no rate plan', 409);
    const values = toRanges(rates).map((r) => ({
      property_id: channexPropertyId,
      rate_plan_id: ratePlanId,
      date_from: r.from,
      date_to: r.to,
      rate: (r.priceCents / 100).toFixed(2), // TODO(channex): confirm decimal string vs integer minor units
      min_stay_arrival: r.minStay,
    }));
    await fetchJson('channex', `${this.baseUrl}/restrictions`, ChannexRestrictionsResponse, {
      method: 'POST',
      headers: this.headers(),
      body: { values },
      fetchFn: this.fetchFn,
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: this.apiKey.length > 0, detail: this.apiKey ? `staging: ${this.baseUrl}` : 'CHANNEX_API_KEY ausente' };
  }
}
