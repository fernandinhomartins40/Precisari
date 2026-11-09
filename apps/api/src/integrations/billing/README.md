# Billing gateway

`BILLING_PROVIDER=asaas` in production (`asaas.adapter.ts`); `fake` for development and tests.

## Asaas

- The account is **shared** with other products and its webhooks are account-wide. Everything created here carries
  an `externalReference` starting with `precisari:`, and events without it are acknowledged and ignored.
  Never use the prefixes `ai:`, `confere:`, `ind:`, `sub:` or `fuseaprova:`: other products' handlers act on them.
- Webhook: `POST /v1/billing/webhook`, authenticated by the static `asaas-access-token` header (`ASAAS_WEBHOOK_TOKEN`).
  Answer 200 for anything that is not ours: repeated failures pause the delivery queue.
- Keys and token live only in `/opt/precisari/.env`. In that file, keep the API key in single quotes: it starts with `$`.
- First due date = end of the 14-day trial on the first checkout, today otherwise.
