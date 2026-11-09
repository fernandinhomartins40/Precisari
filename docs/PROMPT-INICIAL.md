# Prompt inicial para o Claude Code

## Como usar
1. Crie uma pasta vazia para o projeto e abra no VS Code.
2. Copie para dentro dela: `CLAUDE.md` (na raiz) e a pasta `docs/` com `modelo-de-negocios.md` e `prd.md`.
3. Abra o Claude Code (extensão do VS Code ou `claude` no terminal integrado).
4. Ative o **modo de planejamento** (Shift+Tab até aparecer "plan mode") e cole o prompt abaixo.
5. Revise o plano, aprove e acompanhe marco a marco.

Pré-requisitos na sua máquina: Node.js LTS, pnpm, Docker Desktop, Git e o app Expo Go no celular para testar.

---

## Prompt (copie a partir daqui)

```
Você vai construir o produto descrito neste repositório. Antes de qualquer coisa, leia por completo:
- CLAUDE.md (regras permanentes do projeto)
- docs/prd.md (requisitos — fonte da verdade)
- docs/modelo-de-negocios.md (contexto de negócio)

Objetivo desta sessão: executar o marco M0 (Fundação) e o marco M1 (Motor de precificação) do PRD.

M0 — Fundação:
1. Crie o monorepo pnpm + Turborepo com a estrutura da seção 8.2 do PRD (apps/api, apps/worker, apps/mobile, apps/web, packages/pricing-engine, packages/shared, packages/api-client, packages/design-tokens).
2. Configure TypeScript strict, ESLint, Prettier, Vitest e um workflow de CI no GitHub Actions (lint, typecheck, test).
3. docker-compose.yml com PostgreSQL e Redis; .env.example completo.
4. apps/api em NestJS com Prisma e o modelo de dados da seção 8.3; primeira migração.
5. Autenticação por e-mail com código (OTP) + refresh token rotativo (RF-01/RF-02). Login com Apple e Google pode ficar com a interface pronta e TODO, sem credenciais.
6. packages/design-tokens com uma proposta de identidade visual moderna e disruptiva (cores com tema claro e escuro, tipografia, espaçamento, raios, curvas de animação). Me mostre a paleta proposta antes de aplicar.
7. apps/mobile (Expo Router) e apps/web (Next.js) com a tela de login funcionando contra a API e o tema aplicado.

M1 — Motor de precificação:
1. Implemente packages/pricing-engine exatamente conforme a seção 7 do PRD (fórmula, perfil de agressividade, todas as regras da tabela 7.2, saída NightRecommendation).
2. Testes para cada regra e para cenários completos, incluindo: fim de semana x meio de semana, alta e baixa temporada, evento grande em baixa temporada, data se aproximando vazia, noite órfã entre duas reservas, noite adjacente a check-out, proteção de lucro com faxina alta, chuva em destino de praia, limites mínimo e máximo.
3. Cobertura acima de 90%.

Forma de trabalhar:
- Comece em modo de planejamento: me apresente o plano de M0 em etapas pequenas e espere minha aprovação.
- Pare e me pergunte sempre que faltar uma decisão de negócio ou credencial.
- Ao final de cada etapa, rode lint, typecheck e testes e me diga o que foi feito e como eu testo localmente.
- Não avance para M2 sem minha confirmação.
```

---

## Prompts para os próximos marcos

Use um por sessão, depois de concluir o anterior:

- **M2:** `Leia CLAUDE.md e docs/prd.md. Execute o marco M2 (onboarding completo do imóvel, conexão e sincronização de iCal com job BullMQ, detecção de noites órfãs e lacunas, tela de calendário-mapa de calor no mobile e na web). Comece com um plano e espere minha aprovação.`
- **M3:** `Execute o marco M3: adapters de BrasilAPI (feriados), Open-Meteo (clima) e Google Places (endereço e pontos de interesse), tabelas de feriados estaduais/municipais e férias escolares, e o painel admin de curadoria de eventos. Use implementações fake quando faltar chave de API. Plano primeiro.`
- **M4:** `Execute o marco M4: geração de ações, home com cartões deslizáveis, aprovar/ignorar/desfazer, explicações via API da Anthropic com saída validada por Zod e cache, e notificações push diárias com Expo. Plano primeiro.`
- **M5:** `Execute o marco M5: tela de resultados (ocupação, ADR, receita, lucro estimado), planos e assinaturas com adapter BillingProvider (comece com implementação fake; vou escolher o gateway), checkout na web e webhooks. Plano primeiro.`
- **M7 (fase 2):** `Execute o marco M7: integração com Channex.io usando o ambiente de staging (staging.channex.io), conexão do imóvel, envio de tarifas/estadia mínima por noite, recebimento de reservas por webhook e modo automático. Leia a documentação oficial do Channex antes de implementar e me liste as dúvidas que precisam ser confirmadas com eles.`
