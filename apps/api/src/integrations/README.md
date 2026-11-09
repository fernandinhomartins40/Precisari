# Integrations (adapters)

Every third-party integration lives here behind an interface + DI token (`ports.ts`), with a **fake**
implementation used in tests and local development, selected by env in `integrations.module.ts`
(see `.env.example`). Domain code depends only on the interfaces. Responses from third parties
(and LLM output) are validated with Zod; failures raise `IntegrationError` (`common/http.ts`).

| Folder | Port / token | Real | Env | Fake |
|---|---|---|---|---|
| `email/` | `EMAIL_SENDER` | Resend | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | logs + `sent[]` |
| `holidays/` | `HOLIDAYS_PROVIDER` | BrasilAPI | `HOLIDAYS_PROVIDER=brasilapi`, `BRASILAPI_BASE_URL` | Easter-based list |
| `weather/` | `WEATHER_PROVIDER` | Open-Meteo | `WEATHER_PROVIDER=open-meteo`, `OPEN_METEO_BASE_URL` | deterministic |
| `geo/` | `GEO_PROVIDER` | Google Places (New) | `GEO_PROVIDER=google`, `GOOGLE_MAPS_API_KEY` | launch-city addresses |
| `llm/` | `LLM_PROVIDER` | Anthropic Messages | `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | templates |
| `push/` | `PUSH_PROVIDER` | Expo push | `PUSH_PROVIDER=expo`, `EXPO_ACCESS_TOKEN` | logs + `sent[]` |
| `billing/` | `BILLING_PROVIDER` | gateway TBD (see `billing/README.md`) | `BILLING_WEBHOOK_SECRET` | full fake gateway |
| `channex/` | `CHANNEX_PROVIDER` | Channex staging (skeleton) | `CHANNEX_PROVIDER=channex`, `CHANNEX_API_KEY`, `CHANNEX_BASE_URL` | in-memory |

Rules:
- A real provider without its credential falls back to the fake outside production and fails fast in production.
- The LLM only writes explanations and classifies events; it never decides prices. Output: JSON → Zod → one retry →
  deterministic template (`llm/templates.ts`).
- Each adapter exposes `provider` and, when cheap (no billed call), `healthCheck()` for `/admin/health`.
