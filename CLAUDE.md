# CLAUDE.md — Precisari

Instruções permanentes para o Claude Code neste repositório.

## Contexto
App de precificação dinâmica para anfitriões de Airbnb no Brasil (1 a 3 imóveis). App nativo (Expo), web (Next.js) e API própria (NestJS).
- Visão de negócio: `docs/modelo-de-negocios.md`
- Requisitos completos: `docs/prd.md` — **fonte da verdade**. Em caso de dúvida, siga o PRD; se o PRD estiver ambíguo, pergunte antes de decidir.

## Regras de produto que nunca podem ser violadas
1. **Nada de WhatsApp.** Notificações apenas por push (Expo) e e-mail.
2. **Nada de scraping do Airbnb** ou de qualquer site que proíba isso nos termos de uso.
3. O preço é calculado de forma **determinística** em `packages/pricing-engine`. A IA (LLM) só classifica eventos e escreve explicações; nunca define preço.
4. Todo preço sugerido respeita o mínimo e o máximo definidos pelo anfitrião.
5. Toda recomendação precisa de uma explicação legível para o usuário.
6. Integrações de terceiros sempre atrás de interfaces (adapters) em `apps/api/src/integrations/`, com implementação fake para testes e desenvolvimento local.

## Stack
- Monorepo pnpm + Turborepo, TypeScript `strict` em todos os pacotes.
- `apps/api`: NestJS, Prisma + PostgreSQL, BullMQ + Redis, Zod, OpenAPI.
- `apps/worker`: entrypoint dos jobs BullMQ.
- `apps/mobile`: Expo + Expo Router, React Query, Reanimated, Gesture Handler.
- `apps/web`: Next.js App Router (landing, checkout, app web, admin).
- `packages/pricing-engine`: TS puro, sem I/O, testes com Vitest.
- `packages/shared`: schemas Zod e tipos compartilhados.
- `packages/api-client`: cliente gerado do OpenAPI.
- `packages/design-tokens`: cores, tipografia, espaçamento, movimento.

## Comandos
- `pnpm install` — instalar dependências
- `pnpm dev` — subir tudo (turbo)
- `pnpm test` — testes de todos os pacotes
- `pnpm lint` / `pnpm typecheck`
- `docker compose up -d` — Postgres e Redis locais
- `pnpm --filter api prisma migrate dev` — migrações
- `pnpm --filter api dev` — API em modo dev (http://localhost:3333, OpenAPI em `/docs`)
- `pnpm --filter api start:worker` (ou `pnpm --filter worker start`) — worker BullMQ (requer Redis e `JOBS_ENABLED=true`)
- `pnpm --filter api db:seed` — dados de demonstração (carla@precisari.dev, Studio do Campeche)
- `pnpm --filter api test` — testes da API (usa `TEST_DATABASE_URL` ou `DATABASE_URL`, senão `precisari_core_test` local)

Atualize esta seção sempre que criar ou mudar um comando.

## Convenções de código
- Código, nomes de variáveis, tabelas e commits **em inglês**. Textos da interface **em pt-BR**, sempre via arquivos de i18n (nunca hardcoded nos componentes).
- Valores monetários em **centavos (inteiros)** no banco e na API; formatar como BRL só na interface.
- Datas de noites como `yyyy-mm-dd` (sem hora); timestamps em UTC; fuso do imóvel em `Property.timezone`.
- Validação com Zod em todas as fronteiras (rotas, webhooks, respostas de terceiros, saída do LLM).
- Erros da API no formato `{ code, message, details }`.
- Sem `any`. Sem segredos no código: use `.env` e mantenha `.env.example` atualizado.
- Componentes de UI usam apenas tokens de `packages/design-tokens`; nada de cores ou espaçamentos soltos.

## Design
Moderno, simples e disruptivo (detalhes na seção 2 do PRD):
- Calendário-mapa de calor como elemento central.
- Cartões de ação com gesto de deslizar (aprovar/ignorar).
- Números grandes e expressivos; microanimações com propósito (Reanimated).
- Tema claro e escuro desde o início; acessibilidade AA.
- Linguagem humana e curta nos textos.

## Como trabalhar
- Siga os marcos M0 a M7 do PRD (seção 11), **um de cada vez**. Antes de cada marco, apresente um plano curto e espere aprovação.
- Escreva testes junto com o código. O `pricing-engine` exige cobertura acima de 90% e testes para cada regra da seção 7.2 do PRD.
- Ao terminar uma tarefa: rode `pnpm lint`, `pnpm typecheck` e `pnpm test` e só então declare concluído.
- Commits pequenos e descritivos (Conventional Commits).
- Se precisar de uma credencial ou decisão de negócio (gateway de pagamento, chave de API), pare e pergunte; use o adapter fake enquanto isso.
- Não instale dependências pesadas sem justificar.

## Decisões já tomadas (fundação)
- Identidade visual: assets oficiais em `assets/brand` (guia em `docs/brand-guide.md`). Paleta: marinho `#162B49`, tangerina `#FF8845`, marfim `#F7F5F0`. Tokens em `packages/design-tokens` (tema claro e escuro). Fontes: Manrope (títulos/números) e Inter (corpo). Ícones: Lucide.
- Dinheiro: centavos em todo lugar, inclusive no `pricing-engine` (o preço final é sempre reais inteiros terminando em 9 ou 5, ex.: 28900).
- Contratos da API: `packages/shared` (Zod) + rotas em `packages/shared/src/routes.ts`. `packages/api-client` é o cliente tipado usado por web e mobile.
- Pacotes internos compilam para `dist/` (CommonJS); `turbo` roda `^build` antes de `dev`, `typecheck`, `lint` e `test`.
- Banco local: `docker compose up -d` (ou Postgres/Redis locais). Copie `.env.example` para `apps/api/.env`.
