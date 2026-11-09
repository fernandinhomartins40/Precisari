import { timingSafeEqual } from 'node:crypto';
import type { BillingWebhookEvent } from '@precisari/shared';
import { z } from 'zod';
import { fetchJson, IntegrationError, type FetchFn } from '../common/http';
import type { BillingProvider, CheckoutResult, CreateCheckoutInput, HealthStatus } from '../ports';

const Customer = z.object({ id: z.string() });
const CustomerList = z.object({ data: z.array(Customer) });
const Subscription = z.object({ id: z.string(), nextDueDate: z.string().nullish(), externalReference: z.string().nullish() });
const Payment = z.object({ id: z.string(), dueDate: z.string(), invoiceUrl: z.string().nullish(), bankSlipUrl: z.string().nullish() });
const PaymentList = z.object({ data: z.array(Payment) });
const PixQrCode = z.object({ encodedImage: z.string(), payload: z.string() });
const Deleted = z.object({ deleted: z.boolean() }).passthrough();
const AccountStatus = z.object({ general: z.string() }).passthrough();
const WebhookPayload = z.object({
  id: z.string(),
  event: z.string(),
  payment: z.object({ subscription: z.string().nullish() }).passthrough().nullish(),
  subscription: Subscription.passthrough().nullish(),
});

const BILLING_TYPE = { PIX: 'PIX', BOLETO: 'BOLETO', CARD: 'CREDIT_CARD' } as const;
const PAYMENT_EVENTS: Record<string, BillingWebhookEvent['type']> = {
  PAYMENT_CONFIRMED: 'subscription.renewed',
  PAYMENT_RECEIVED: 'subscription.renewed',
  PAYMENT_OVERDUE: 'subscription.past_due',
  PAYMENT_REFUNDED: 'subscription.past_due',
  PAYMENT_CHARGEBACK_REQUESTED: 'subscription.past_due',
};
const SUBSCRIPTION_EVENTS = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']);
/** Events to subscribe to when registering the webhook in Asaas. */
export const ASAAS_WEBHOOK_EVENTS = [...Object.keys(PAYMENT_EVENTS), ...SUBSCRIPTION_EVENTS];

const GRACE_DAYS = 3;
const PAYMENT_LOOKUP_ATTEMPTS = 5;

/**
 * The Asaas account is shared with other products and its webhooks are account-wide, so every record
 * we create carries this prefix and foreign events are ignored. The other products' handlers treat
 * `ai:`, `confere:`, `ind:`, `sub:` and `fuseaprova:` as their own: never use those here.
 */
const REF_PREFIX = 'precisari';
const customerRef = (userId: string): string => `${REF_PREFIX}:${userId}`;
const subscriptionRef = (userId: string, plan: string): string => `${REF_PREFIX}:${userId}:${plan}`;

function parseSubscriptionRef(ref: string | null | undefined): { userId: string; plan: 'PRO' | 'AUTO' } | null {
  const m = /^precisari:([^:]+):(PRO|AUTO)$/.exec(ref ?? '');
  return m?.[1] && m[2] ? { userId: m[1], plan: m[2] as 'PRO' | 'AUTO' } : null;
}

/** End of the due day in Brazil. */
const endOfDueDate = (date: string): Date => new Date(`${date}T23:59:59-03:00`);

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** Asaas subscriptions (https://docs.asaas.com/reference/create-new-subscription). */
export class AsaasBillingProvider implements BillingProvider {
  readonly name = 'asaas';
  readonly provider = 'asaas';

  constructor(
    private readonly apiKey: string,
    private readonly webhookToken: string,
    private readonly baseUrl: string,
    private readonly fetchFn?: FetchFn,
    private readonly lookupDelayMs = 1000,
  ) {
    if (!webhookToken) throw new Error('Asaas webhook token is required');
  }

  private request<T extends z.ZodTypeAny>(path: string, schema: T, opts: { method?: 'POST' | 'DELETE'; body?: unknown } = {}): Promise<z.infer<T>> {
    return fetchJson('billing', `${this.baseUrl.replace(/\/$/, '')}${path}`, schema, {
      ...opts,
      // Asaas rejects requests without a User-Agent on recent accounts.
      headers: { access_token: this.apiKey, 'user-agent': 'precisari-api' },
      fetchFn: this.fetchFn,
      timeoutMs: 20_000,
    });
  }

  private async customerId(input: CreateCheckoutInput): Promise<string> {
    const ref = customerRef(input.userId);
    const found = await this.request(`/customers?externalReference=${encodeURIComponent(ref)}&limit=1`, CustomerList);
    if (found.data[0]) return found.data[0].id;
    const created = await this.request('/customers', Customer, {
      method: 'POST',
      body: { name: input.name ?? input.email, email: input.email, cpfCnpj: input.taxId, externalReference: ref },
    });
    return created.id;
  }

  /** The first payment is generated asynchronously, so it may take a moment to show up. */
  private async firstPayment(subscriptionId: string): Promise<z.infer<typeof Payment> | null> {
    for (let attempt = 0; attempt < PAYMENT_LOOKUP_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.lookupDelayMs));
      const list = await this.request(`/subscriptions/${subscriptionId}/payments`, PaymentList);
      if (list.data[0]) return list.data[0];
    }
    return null;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    if (!input.taxId) throw new IntegrationError('billing', 'taxId is required', 400);
    const customer = await this.customerId(input);
    const subscription = await this.request('/subscriptions', Subscription, {
      method: 'POST',
      body: {
        customer,
        billingType: BILLING_TYPE[input.paymentMethod],
        value: input.amountCents / 100,
        nextDueDate: input.firstDueDate,
        cycle: input.cycle,
        description: `Precisari ${input.plan} (${input.propertyCount} imóvel(is))`,
        externalReference: subscriptionRef(input.userId, input.plan),
      },
    });
    try {
      const payment = await this.firstPayment(subscription.id);
      if (!payment) throw new IntegrationError('billing', 'first payment not generated');
      const pix = input.paymentMethod === 'PIX' ? await this.request(`/payments/${payment.id}/pixQrCode`, PixQrCode) : null;
      return {
        checkoutId: payment.id,
        providerRef: subscription.id,
        status: 'PENDING',
        redirectUrl: input.paymentMethod === 'CARD' ? (payment.invoiceUrl ?? null) : null,
        pixQrCode: pix ? `data:image/png;base64,${pix.encodedImage}` : null,
        pixCopyPaste: pix?.payload ?? null,
        boletoUrl: input.paymentMethod === 'BOLETO' ? (payment.bankSlipUrl ?? null) : null,
        expiresAt: endOfDueDate(payment.dueDate).toISOString(),
      };
    } catch (err) {
      // The caller never learns this id: left alive, it would keep charging the customer.
      await this.cancel(subscription.id).catch(() => undefined);
      throw err;
    }
  }

  /** Null means "not for us": it must still be acknowledged, because failures pause the shared queue. */
  async parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<BillingWebhookEvent | null> {
    const got = Buffer.from(header(headers, 'asaas-access-token'), 'utf8');
    const expected = Buffer.from(this.webhookToken, 'utf8');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      throw new IntegrationError('billing', 'invalid webhook token', 401);
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new IntegrationError('billing', 'invalid webhook JSON', 400);
    }
    const parsed = WebhookPayload.safeParse(json);
    if (!parsed.success) throw new IntegrationError('billing', 'invalid webhook payload', 400, parsed.error.flatten());
    const { id, event, payment, subscription } = parsed.data;

    if (SUBSCRIPTION_EVENTS.has(event)) {
      // No userId: a replaced subscription's cancellation must not cancel the user's current one.
      if (!subscription || !parseSubscriptionRef(subscription.externalReference)) return null;
      return { id, type: 'subscription.canceled', providerRef: subscription.id };
    }

    const type = PAYMENT_EVENTS[event];
    if (!type || !payment?.subscription) return null;
    const current = await this.subscription(payment.subscription);
    const ref = parseSubscriptionRef(current?.externalReference);
    if (!current || !ref) return null;
    if (type === 'subscription.past_due') return { id, type, providerRef: current.id, userId: ref.userId };

    const periodEnd = current.nextDueDate ? new Date(endOfDueDate(current.nextDueDate).getTime() + GRACE_DAYS * 86_400_000).toISOString() : undefined;
    return { id, type, providerRef: current.id, userId: ref.userId, plan: ref.plan, ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}) };
  }

  private async subscription(id: string): Promise<z.infer<typeof Subscription> | null> {
    try {
      return await this.request(`/subscriptions/${id}`, Subscription);
    } catch (err) {
      if (err instanceof IntegrationError && err.status === 404) return null;
      throw err;
    }
  }

  async cancel(providerRef: string): Promise<void> {
    await this.request(`/subscriptions/${providerRef}`, Deleted, { method: 'DELETE' });
  }

  async healthCheck(): Promise<HealthStatus> {
    const status = await this.request('/myAccount/status', AccountStatus);
    return { ok: status.general === 'APPROVED', detail: `conta ${status.general}` };
  }
}
