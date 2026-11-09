import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BillingWebhookEvent } from '@precisari/shared';
import { IntegrationError } from '../common/http';
import type { BillingProvider, CheckoutResult, CreateCheckoutInput, HealthStatus } from '../ports';

export const FAKE_SIGNATURE_HEADER = 'x-precisari-signature';

/** HMAC-SHA256(rawBody, secret) as lowercase hex. */
export function signFakeWebhook(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Complete fake gateway (dev/test) — the real gateway is not chosen yet (PRD §12).
 * Webhooks are our normalized `BillingWebhookEvent` JSON signed with HMAC-SHA256 in `x-precisari-signature`.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly name = 'fake';
  readonly provider = 'fake';
  readonly checkouts: CreateCheckoutInput[] = [];
  readonly canceled: string[] = [];

  constructor(
    private readonly webhookSecret = 'change-me-webhook-secret',
    private readonly webBaseUrl = 'http://localhost:3000',
  ) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    this.checkouts.push(input);
    const id = `fake_chk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    return {
      checkoutId: id,
      providerRef: `fake_sub_${id.slice(9)}`,
      status: 'PENDING',
      redirectUrl: input.paymentMethod === 'CARD' ? `${this.webBaseUrl}/checkout/fake/${id}` : null,
      pixQrCode: input.paymentMethod === 'PIX' ? `${this.webBaseUrl}/checkout/fake/${id}/qrcode.png` : null,
      pixCopyPaste: input.paymentMethod === 'PIX' ? `00020126580014BR.GOV.BCB.PIX0136FAKE-${id}5204000053039865406${(input.amountCents / 100).toFixed(2)}` : null,
      boletoUrl: input.paymentMethod === 'BOLETO' ? `${this.webBaseUrl}/checkout/fake/${id}/boleto` : null,
      expiresAt: new Date(Date.now() + (input.paymentMethod === 'BOLETO' ? 3 * 86_400_000 : 3600_000)).toISOString(),
    };
  }

  async parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<BillingWebhookEvent> {
    const got = (header(headers, FAKE_SIGNATURE_HEADER) ?? '').replace(/^sha256=/, '');
    const expected = signFakeWebhook(rawBody, this.webhookSecret);
    const a = Buffer.from(got, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new IntegrationError('billing', 'invalid webhook signature', 401);
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new IntegrationError('billing', 'invalid webhook JSON', 400);
    }
    const parsed = BillingWebhookEvent.safeParse(json);
    if (!parsed.success) throw new IntegrationError('billing', 'invalid webhook payload', 400, parsed.error.flatten());
    return parsed.data;
  }

  async cancel(providerRef: string): Promise<void> {
    this.canceled.push(providerRef);
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: 'fake (gateway a definir)' };
  }
}
