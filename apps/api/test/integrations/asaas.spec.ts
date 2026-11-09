import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { ASAAS_WEBHOOK_EVENTS, AsaasBillingProvider } from '../../src/integrations/billing/asaas.adapter';
import { IntegrationError, type FetchFn } from '../../src/integrations/common/http';
import { adapterFactories } from '../../src/integrations/integrations.module';
import type { CreateCheckoutInput } from '../../src/integrations/ports';
import { json, mockFetch } from './mock-fetch';

const TOKEN = 't'.repeat(40);
const input: CreateCheckoutInput = {
  userId: 'usr1', email: 'ana@example.com', name: 'Ana', plan: 'PRO', cycle: 'YEARLY', paymentMethod: 'PIX',
  propertyCount: 2, amountCents: 59800, taxId: '12345678909', firstDueDate: '2026-11-23',
};
const provider = (fetchFn: FetchFn) => new AsaasBillingProvider('key', TOKEN, 'https://asaas.test/v3', fetchFn, 0);
const webhook = (p: AsaasBillingProvider, body: unknown, token = TOKEN) => p.parseWebhook({ 'asaas-access-token': token }, JSON.stringify(body));
const payment = { id: 'pay_1', dueDate: '2026-11-23', invoiceUrl: 'https://asaas.test/i/1', bankSlipUrl: 'https://asaas.test/b/1' };

describe('Asaas billing adapter', () => {
  it('creates a tagged customer and subscription, returning the Pix of the first payment', async () => {
    const { fetchFn, calls } = mockFetch(
      json({ data: [] }),
      json({ id: 'cus_1' }),
      json({ id: 'sub_1' }),
      json({ data: [payment] }),
      json({ encodedImage: 'QUJD', payload: 'pix-copia-e-cola' }),
    );
    const r = await provider(fetchFn).createCheckout(input);
    expect(calls[0]?.url).toContain('/customers?externalReference=precisari%3Ausr1');
    expect(calls[0]?.headers).toMatchObject({ access_token: 'key', 'user-agent': 'precisari-api' });
    expect(calls[1]?.body).toMatchObject({ cpfCnpj: '12345678909', name: 'Ana', externalReference: 'precisari:usr1' });
    expect(calls[2]?.body).toMatchObject({
      customer: 'cus_1', billingType: 'PIX', value: 598, cycle: 'YEARLY', nextDueDate: '2026-11-23', externalReference: 'precisari:usr1:PRO',
    });
    expect(r).toMatchObject({ checkoutId: 'pay_1', providerRef: 'sub_1', status: 'PENDING', pixCopyPaste: 'pix-copia-e-cola', pixQrCode: 'data:image/png;base64,QUJD' });
  });

  it('reuses the customer and maps card and boleto to their URLs', async () => {
    const card = mockFetch(json({ data: [{ id: 'cus_1' }] }), json({ id: 'sub_1' }), json({ data: [payment] }));
    const r = await provider(card.fetchFn).createCheckout({ ...input, paymentMethod: 'CARD' });
    expect(card.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'GET']);
    expect(card.calls[1]?.body).toMatchObject({ billingType: 'CREDIT_CARD' });
    expect(r).toMatchObject({ redirectUrl: payment.invoiceUrl, pixQrCode: null, boletoUrl: null });

    const boleto = mockFetch(json({ data: [{ id: 'cus_1' }] }), json({ id: 'sub_1' }), json({ data: [payment] }));
    expect(await provider(boleto.fetchFn).createCheckout({ ...input, paymentMethod: 'BOLETO' })).toMatchObject({ boletoUrl: payment.bankSlipUrl, redirectUrl: null });
  });

  it('refuses a checkout without CPF/CNPJ before calling Asaas', async () => {
    const { fetchFn, calls } = mockFetch(json({}));
    await expect(provider(fetchFn).createCheckout({ ...input, taxId: undefined })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('deletes the subscription when the first payment cannot be obtained, so it never charges unseen', async () => {
    const { fetchFn, calls } = mockFetch(
      json({ data: [{ id: 'cus_1' }] }), json({ id: 'sub_1' }),
      json({ data: [] }), json({ data: [] }), json({ data: [] }), json({ data: [] }), json({ data: [] }),
      json({ deleted: true }),
    );
    await expect(provider(fetchFn).createCheckout(input)).rejects.toBeInstanceOf(IntegrationError);
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: 'https://asaas.test/v3/subscriptions/sub_1' });
  });

  it('rejects a wrong or missing webhook token without calling Asaas', async () => {
    const { fetchFn, calls } = mockFetch(json({}));
    const p = provider(fetchFn);
    await expect(webhook(p, { id: 'e', event: 'PAYMENT_RECEIVED' }, 'x'.repeat(40))).rejects.toMatchObject({ status: 401 });
    await expect(p.parseWebhook({}, '{}')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
    expect(() => new AsaasBillingProvider('key', '', 'https://asaas.test/v3')).toThrow(/token/);
  });

  it('maps a confirmed payment to a renewal with plan, user and period end plus grace', async () => {
    const { fetchFn, calls } = mockFetch(json({ id: 'sub_1', nextDueDate: '2026-12-23', externalReference: 'precisari:usr1:AUTO' }));
    const ev = await webhook(provider(fetchFn), { id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', subscription: 'sub_1' } });
    expect(calls[0]?.url).toBe('https://asaas.test/v3/subscriptions/sub_1');
    expect(ev).toEqual({ id: 'evt_1', type: 'subscription.renewed', providerRef: 'sub_1', userId: 'usr1', plan: 'AUTO', currentPeriodEnd: '2026-12-27T02:59:59.000Z' });
  });

  it('maps overdue, refund and chargeback to past due', async () => {
    for (const event of ['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED']) {
      const { fetchFn } = mockFetch(json({ id: 'sub_1', externalReference: 'precisari:usr1:PRO' }));
      expect(await webhook(provider(fetchFn), { id: 'evt', event, payment: { subscription: 'sub_1' } })).toEqual({ id: 'evt', type: 'subscription.past_due', providerRef: 'sub_1', userId: 'usr1' });
    }
  });

  it('maps a deleted subscription to canceled without a userId', async () => {
    const { fetchFn, calls } = mockFetch(json({}));
    const ev = await webhook(provider(fetchFn), { id: 'evt', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_old', externalReference: 'precisari:usr1:PRO' } });
    expect(ev).toEqual({ id: 'evt', type: 'subscription.canceled', providerRef: 'sub_old' });
    expect(calls).toHaveLength(0);
  });

  it('ignores events from the other products that share the Asaas account', async () => {
    for (const externalReference of ['sub:uuid:PRO', 'fuseaprova:1', null, 'precisari:usr1', 'precisari:usr1:FREE']) {
      const { fetchFn } = mockFetch(json({ id: 'sub_x', externalReference }));
      expect(await webhook(provider(fetchFn), { id: 'e', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_x' } })).toBeNull();
      expect(await webhook(provider(fetchFn), { id: 'e', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_x', externalReference } })).toBeNull();
    }
    const { fetchFn, calls } = mockFetch(json({}));
    expect(await webhook(provider(fetchFn), { id: 'e', event: 'PAYMENT_RECEIVED', payment: { id: 'one_off' } })).toBeNull();
    expect(await webhook(provider(fetchFn), { id: 'e', event: 'PAYMENT_CREATED', payment: { subscription: 'sub_x' } })).toBeNull();
    expect(calls).toHaveLength(0);
    const gone = mockFetch(json({ errors: [] }, 404));
    expect(await webhook(provider(gone.fetchFn), { id: 'e', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_x' } })).toBeNull();
  });

  it('keeps a failing Asaas lookup retryable and rejects malformed bodies', async () => {
    const down = mockFetch(json({}, 503));
    await expect(webhook(provider(down.fetchFn), { id: 'e', event: 'PAYMENT_RECEIVED', payment: { subscription: 'sub_1' } })).rejects.toMatchObject({ status: 503 });
    const { fetchFn } = mockFetch(json({}));
    await expect(provider(fetchFn).parseWebhook({ 'asaas-access-token': TOKEN }, 'not json')).rejects.toMatchObject({ status: 400 });
  });

  it('cancels by subscription id and subscribes only to the mapped events', async () => {
    const { fetchFn, calls } = mockFetch(json({ deleted: true, id: 'sub_1' }));
    await provider(fetchFn).cancel('sub_1');
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://asaas.test/v3/subscriptions/sub_1' });
    expect(ASAAS_WEBHOOK_EVENTS).toEqual(expect.arrayContaining(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'SUBSCRIPTION_DELETED']));
  });

  it('needs both the API key and the webhook token in production', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(32), BILLING_PROVIDER: 'asaas' };
    expect(() => adapterFactories.billing(loadEnv({ ...base, ASAAS_API_KEY: 'k' }))).toThrow(/credential missing/);
    expect(() => adapterFactories.billing(loadEnv({ ...base, ASAAS_WEBHOOK_TOKEN: TOKEN }))).toThrow(/credential missing/);
    expect(adapterFactories.billing(loadEnv({ ...base, ASAAS_API_KEY: 'k', ASAAS_WEBHOOK_TOKEN: TOKEN })).provider).toBe('asaas');
  });
});
