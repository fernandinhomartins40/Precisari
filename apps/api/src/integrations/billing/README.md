# Billing gateway — pending business decision

The gateway is **not chosen yet** (PRD §9/§12: Asaas, Mercado Pago, Pagar.me or Stripe with Pix).
Until then `BILLING_PROVIDER=fake` (`fake-billing.adapter.ts`) is the only implementation.

## Adding the real gateway (skeleton)

1. Create `<gateway>.adapter.ts` implementing `BillingProvider` (`ports.ts`):
   - `createCheckout`: create customer (CPF/CNPJ = `taxId`) + subscription with `cycle` (MONTHLY/YEARLY)
     and `amountCents` (already multiplied by `propertyCount`). Map Pix (QR + copia-e-cola), card (hosted page
     → `redirectUrl`) and boleto (`boletoUrl`). `providerRef` = gateway subscription id.
   - `parseWebhook`: verify the gateway's signature with its secret, validate the payload with a Zod schema,
     and map to the normalized `BillingWebhookEvent` (`subscription.activated|renewed|past_due|canceled`).
     Use the gateway's event id as `id` (dedup via `WebhookEvent`).
   - `cancel`: cancel the subscription at period end.
2. Add the provider id to `BILLING_PROVIDER` in `config/env.ts`, its keys to `.env.example`, and the factory
   branch in `integrations.module.ts`.
3. Tests with mocked `fetch` (see `test/integrations/*.spec.ts`).

Notes per candidate (to confirm):
- **Asaas**: header `asaas-access-token` on webhooks (static token, not HMAC); sandbox `https://sandbox.asaas.com/api/v3`.
- **Mercado Pago**: `x-signature` (ts + v1 HMAC-SHA256 of a manifest) — subscriptions via `preapproval`.
- **Pagar.me v5**: webhooks with basic auth or signature; subscriptions with `plan_id`/items.
