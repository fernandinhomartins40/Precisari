# Integrations (adapters)

Every third-party integration lives here behind an interface + DI token, with a **fake** implementation
used in tests and local development (selected by env, see `.env.example`). Domain code depends only on
the interfaces. Responses from third parties are validated with Zod.
