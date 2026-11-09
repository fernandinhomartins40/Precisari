# PRD — Precisari

> Documento de requisitos do produto: app nativo (iOS/Android), aplicação web e API própria.
> Versão 0.1 · novembro de 2026 · Ler junto com `docs/modelo-de-negocios.md`.

---

## 1. Objetivo

Permitir que um anfitrião de Airbnb com 1 a 3 imóveis **cobre o preço certo em cada noite** gastando menos de 1 minuto por dia. O app mostra recomendações explicadas e, na fase 2, aplica os preços automaticamente.

### Metas do MVP
- Cadastro até a primeira recomendação em **menos de 3 minutos**.
- Pelo menos **50%** das recomendações aprovadas.
- Ganho de receita mensurável em relação aos 90 dias anteriores.

### Fora do escopo do MVP
- WhatsApp (decisão de produto: custo e complexidade da API no Brasil).
- Scraping do Airbnb (viola os termos de uso).
- Booking.com e outros canais (fase 3).
- Mensagens automáticas para hóspedes.

---

## 2. Princípios de produto e design

1. **Uma tela, uma decisão.** A home responde "o que eu preciso fazer hoje?".
2. **Sempre explicar.** Todo preço sugerido tem um motivo legível em uma linha.
3. **O anfitrião manda.** Limites mínimo e máximo, aprovação manual por padrão, desfazer sempre disponível.
4. **Visual moderno e disruptivo**, sem cara de software corporativo:
   - **Calendário-mapa de calor** como elemento central: cada noite é um bloco colorido por oportunidade (frio = abaixo do mercado, quente = demanda alta).
   - **Cartões de ação** empilhados com gesto de deslizar: direita aprova, esquerda ignora.
   - Tipografia grande e expressiva para números (preço e ganho estimado em destaque).
   - Microanimações com propósito: o bloco "acende" quando um evento é detectado e o preço "sobe" com mola ao aprovar.
   - Tema escuro e claro desde o início; paleta própria com uma cor de destaque marcante.
   - Linguagem humana: "Sábado tá disputado — show a 2 km" em vez de "Demand index: 0.82".
5. **Rápido:** telas principais com dados em cache local e carregamento abaixo de 1 segundo.

---

## 3. Personas

- **Carla (principal):** 1–3 imóveis, usa só o celular, nunca usou ferramenta de precificação.
- **Rafael (secundária, fase 2+):** coanfitrião com 10 imóveis de terceiros, usa web e celular, quer relatórios para os proprietários.

---

## 4. Jornadas principais

### 4.1 Onboarding (meta: < 3 min)
1. Login com Apple, Google ou e-mail com código (sem senha).
2. "Cole o link do calendário do seu anúncio": tela com tutorial animado mostrando onde achar o link iCal no Airbnb.
3. Endereço do imóvel com autocomplete (Google Places) e confirmação no mapa.
4. Tipo de destino, inferido automaticamente e editável: praia, serra, urbano/negócios, interior/rural, turístico-cultural.
5. Preço atual (base), preço mínimo aceitável, custo de faxina e capacidade.
6. Ativar notificações.
7. **Momento "uau":** calendário-mapa de calor dos próximos 90 dias com o "ganho potencial estimado" em destaque.

### 4.2 Rotina diária
1. Notificação push: "3 ajustes para hoje · +R$ 280 estimado".
2. Home com cartões de ação ordenados por impacto.
3. O anfitrião aprova ou ignora. No MVP, ao aprovar, o app mostra o valor e um atalho para abrir o anúncio no app do Airbnb. Na fase 2, o preço é aplicado automaticamente.
4. O app registra a decisão para aprender e medir resultados.

### 4.3 Explorar o calendário
- Toque numa noite → painel com preço sugerido, faixa (mín./máx.), fatores aplicados com o peso de cada um, previsão do tempo, eventos próximos e estadia mínima sugerida.

### 4.4 Resultados
- Ocupação, diária média (ADR), receita e **lucro estimado** no mês, comparados ao mesmo período anterior e à recomendação ("se tivesse aprovado tudo: +R$ X").

---

## 5. Telas (app nativo e web)

| # | Tela | Conteúdo principal |
|---|---|---|
| 1 | Boas-vindas / login | Apple, Google, e-mail com código |
| 2 | Onboarding (5 passos) | iCal, endereço, tipo, preços e custos, notificações |
| 3 | **Hoje** (home) | Resumo do ganho estimado, pilha de cartões de ação |
| 4 | **Calendário** | Mapa de calor 90/180 dias, filtros, toque para detalhe |
| 5 | Detalhe da noite | Preço, fatores, explicação, clima, eventos, estadia mínima |
| 6 | **Resultados** | Ocupação, ADR, receita, lucro, comparativos |
| 7 | Imóveis | Lista, adicionar imóvel, status da sincronização |
| 8 | Configurações do imóvel | Base, mín./máx., faxina, agressividade (conservador/equilibrado/ousado), regras ligadas/desligadas |
| 9 | Conta e plano | Assinatura, pagamento, notificações, exclusão de conta (LGPD) |
| 10 | Conectar Airbnb (fase 2) | Fluxo de conexão via Channex |

A web replica as telas 3 a 9 com layout de desktop; a landing page e o checkout de assinatura ficam na web.

---

## 6. Requisitos funcionais

### 6.1 Contas e autenticação
- RF-01: login com Apple, Google e e-mail com código de uso único.
- RF-02: tokens de acesso de curta duração + refresh token rotativo.
- RF-03: exclusão de conta e exportação de dados (LGPD).

### 6.2 Imóveis
- RF-10: CRUD de imóveis com endereço geocodificado (lat/lng), tipo de destino, capacidade, quartos.
- RF-11: parâmetros financeiros: preço base, mínimo, máximo (padrão: base × 3), faxina, custos fixos mensais opcionais, taxa do Airbnb (padrão 3% anfitrião).
- RF-12: perfil de agressividade que escala os multiplicadores.

### 6.3 Sincronização de calendário
- RF-20: importar o iCal do Airbnb a cada 30 minutos (job) e sob demanda (puxar para atualizar).
- RF-21: identificar noites ocupadas, check-ins e check-outs, noites órfãs e lacunas.
- RF-22: alertar se o link iCal parar de funcionar.
- RF-23 (fase 2): sincronização bidirecional via Channex (disponibilidade, tarifas, restrições, reservas via webhook).

### 6.4 Motor de precificação
- RF-30: calcular preço, estadia mínima e desconto para cada noite dos próximos 180 dias (Pro) ou 30 dias (Grátis).
- RF-31: recalcular diariamente e sempre que o calendário, o clima (D-7) ou os eventos mudarem.
- RF-32: gerar a explicação em linguagem natural para cada recomendação relevante.
- RF-33: respeitar sempre os limites mínimo e máximo do anfitrião.
- Especificação detalhada na **seção 7**.

### 6.5 Recomendações e ações
- RF-40: gerar "ações" quando a diferença entre o preço atual conhecido e o sugerido for maior que 5% ou houver regra nova (órfã, estadia mínima).
- RF-41: aprovar, ignorar e desfazer; histórico de decisões.
- RF-42: no MVP, o "preço atual conhecido" é o último valor aprovado ou o base. Na fase 2, vem do Channex.
- RF-43 (fase 2): modo automático, com aplicação sem aprovação dentro dos limites.

### 6.6 Notificações
- RF-50: push diário em horário escolhido (padrão 9h) com resumo.
- RF-51: alertas imediatos para eventos relevantes detectados, mudança forte de clima no fim de semana e iCal quebrado.
- RF-52: resumo semanal por e-mail.

### 6.7 Resultados
- RF-60: métricas mensais de ocupação, ADR, receita e lucro estimado.
- RF-61: comparativo com os 90 dias anteriores ao cadastro (baseline).
- RF-62: no MVP, a receita é estimada pelas noites ocupadas × preço aprovado. Na fase 2, é a real via Channex.

### 6.8 Assinaturas
- RF-70: planos Grátis, Pro e Automático com teste de 14 dias.
- RF-71: checkout na web com Pix, cartão e boleto; o app reconhece a assinatura ativa.
- RF-72: webhooks do gateway atualizam o status da assinatura.

### 6.9 Painel administrativo (interno, web)
- RF-80: curadoria de eventos por cidade (criar, editar, definir porte e raio de impacto).
- RF-81: curadoria de feriados municipais e férias escolares por estado.
- RF-82: visão de saúde das integrações e jobs.

---

## 7. Motor de precificação (especificação)

Pacote isolado `packages/pricing-engine`: **TypeScript puro, sem I/O, 100% testado**. Recebe um contexto e devolve recomendações. A IA não define o preço; ela classifica eventos e escreve explicações. O cálculo é determinístico e auditável.

### 7.1 Fórmula

```
preco_bruto = base
            × m_dia_semana
            × m_sazonalidade
            × m_demanda       (feriados, emendas, eventos, férias escolares)
            × m_clima         (somente D-0 a D-7)
            × m_antecedencia
            × m_ocupacao_local (fase 3, quando houver dados de mercado)

preco_final = arredondar_psicologico( limitar(preco_bruto, minimo, maximo) )
```

Cada multiplicador é escalado pelo perfil de agressividade:
`m_efetivo = 1 + (m − 1) × k`, com k = 0,6 (conservador), 1,0 (equilibrado) e 1,4 (ousado).

### 7.2 Regras e valores padrão (calibráveis por imóvel)

| Regra (técnica do vídeo) | Padrão inicial |
|---|---|
| **Dia da semana** | Dom 0,90 · Seg 0,85 · Ter 0,85 · Qua 0,88 · Qui 0,95 · Sex 1,15 · Sáb 1,20. Para destino urbano/negócios, inverter a lógica: dias úteis mais altos |
| **Sazonalidade** | Curva mensal por tipo de destino e região (ex.: praia Sul: jan 1,45, jul 0,75; praia Nordeste: jul 1,20, abr–mai 0,85). Tabela em `seasonality.ts` |
| **Leitura de demanda** | Feriado nacional 1,25 · emenda/feriadão 1,35 · Carnaval 1,3–2,0 conforme cidade · réveillon 1,8–2,5 · evento: porte P 1,1, M 1,3, G 1,8, XG 2,5, com decaimento por distância (raio padrão de 5 km) · férias escolares do estado de origem principal 1,15 |
| **Clima** (somente D-0 a D-7) | Praia: chuva > 70% de probabilidade → 0,85; sol após semana chuvosa → 1,05. Serra: frio intenso → 1,10. Urbano: neutro |
| **Curva de antecedência** | > 60 dias: 1,05 · 30–60: 1,00 · 14–30: 0,97 · 7–14: 0,93 · 3–7: 0,88 · 0–2: 0,80. Só se aplica a noites livres |
| **Estadia mínima** | > 30 dias: 3 noites · 14–30: 2 · < 14: 1. Feriadão: mínimo = duração do feriadão |
| **Noite órfã** | Lacuna de 1–2 noites entre reservas: mínimo = tamanho da lacuna, multiplicador 0,80 |
| **Noite adjacente** | Noite livre colada a um check-out ou check-in: sugerir desconto de 5–10% para "entrada no dia da saída" |
| **Proteção de lucro** | Se `preco_final − (faxina / estadia_minima) − taxas < lucro_minimo`, aumentar a estadia mínima em vez de baixar o preço |
| **Arredondamento** | Terminar em 9 ou 5 (ex.: 287 → 289) |

### 7.3 Saída por noite

```ts
type NightRecommendation = {
  date: string;              // ISO yyyy-mm-dd
  status: 'free' | 'booked' | 'blocked';
  suggestedPrice: number;    // BRL inteiro
  minStay: number;
  discountPct?: number;      // adjacente / órfã
  factors: { key: FactorKey; multiplier: number; label: string }[];
  heat: number;              // 0..1 para o mapa de calor
  explanation?: string;      // gerada por LLM, cacheada
  isOrphan: boolean;
};
```

### 7.4 Aprendizado (pós-MVP)
- Guardar contexto e decisão de cada recomendação, e o resultado (reservou ou não, com quanto tempo de antecedência).
- Ajuste mensal dos multiplicadores por imóvel com regressão simples e limites de segurança (nunca mais que ±15% de mudança por ciclo).

---

## 8. Arquitetura técnica

### 8.1 Stack recomendada

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, TypeScript estrito em tudo |
| API | **NestJS** (REST + OpenAPI gerado automaticamente), validação com Zod |
| Banco | PostgreSQL + Prisma |
| Filas e jobs | Redis + BullMQ (sync iCal, recálculo, clima, notificações) |
| App nativo | **Expo (React Native) + Expo Router**, React Query, Reanimated, Gesture Handler, Expo Notifications |
| Web | **Next.js** (App Router) — landing, checkout, app web e painel admin |
| Design system | `packages/design-tokens` (cores, tipografia, espaçamento, movimento) compartilhado entre mobile e web |
| Tipos e contratos | `packages/shared` (schemas Zod e tipos) |
| Motor | `packages/pricing-engine` (TS puro, Vitest) |
| Cliente de API | Gerado a partir do OpenAPI (`packages/api-client`) |
| Observabilidade | Sentry (apps e API), logs estruturados (pino) |
| Infra | Docker; web, API, workers, PostgreSQL e Redis em VPS própria (Hostinger), atrás do nginx do host; builds mobile com EAS |

### 8.2 Estrutura do monorepo

```
/apps
  /api          NestJS: módulos auth, properties, calendar, pricing, recommendations, notifications, billing, integrations, admin
  /worker       Processos BullMQ (pode ser o mesmo código da API com entrypoint diferente)
  /mobile       Expo
  /web          Next.js
/packages
  /pricing-engine
  /shared
  /api-client
  /design-tokens
/docs
  modelo-de-negocios.md
  prd.md
```

### 8.3 Modelo de dados (principal)

```
User(id, email, name, authProvider, createdAt, deletedAt)
Subscription(id, userId, plan[FREE|PRO|AUTO], status, provider, providerRef, currentPeriodEnd, trialEndsAt)
Property(id, userId, name, address, lat, lng, city, state, ibgeCode, destinationType, capacity, bedrooms,
         basePrice, minPrice, maxPrice, cleaningFee, monthlyFixedCosts, platformFeePct, aggressiveness,
         rulesConfig JSONB, timezone, createdAt)
CalendarSource(id, propertyId, type[ICAL|CHANNEX], url, channexPropertyId, lastSyncAt, status, lastError)
Booking(id, propertyId, source, externalUid, checkIn, checkOut, status, revenue?)   -- receita real só via Channex
NightPrice(id, propertyId, date, suggestedPrice, minStay, discountPct, factors JSONB, heat, explanation,
           computedAt, engineVersion)
Action(id, propertyId, date, type[PRICE|MIN_STAY|ORPHAN|ADJACENT], fromValue, toValue, estimatedGain,
       status[PENDING|APPROVED|DISMISSED|APPLIED|REVERTED], decidedAt, appliedAt)
Event(id, name, city, state, lat, lng, startDate, endDate, size[P|M|G|XG], radiusKm, source, verified)
Holiday(id, date, scope[NATIONAL|STATE|MUNICIPAL], state?, ibgeCode?, name, isBridge)
SchoolVacation(id, state, startDate, endDate, year)
WeatherForecast(id, lat, lng, date, precipProb, precipMm, tempMin, tempMax, fetchedAt)
DeviceToken(id, userId, expoPushToken, platform)
AuditLog(id, userId, action, payload JSONB, createdAt)
```

### 8.4 API própria (REST, prefixo `/v1`)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/otp/request`, `/auth/otp/verify` | Login por e-mail com código |
| POST | `/auth/oauth/{apple\|google}` | Login social |
| POST | `/auth/refresh`, `/auth/logout` | Sessão |
| GET/PATCH/DELETE | `/me` | Perfil, exclusão (LGPD) |
| GET/POST | `/properties` | Listar e criar |
| GET/PATCH/DELETE | `/properties/:id` | Detalhe e edição |
| POST | `/properties/:id/calendar-sources` | Conectar iCal (valida o link na hora) |
| POST | `/properties/:id/sync` | Forçar sincronização |
| GET | `/properties/:id/nights?from&to` | Recomendações por noite (calendário) |
| GET | `/properties/:id/nights/:date` | Detalhe de uma noite |
| GET | `/actions?status=PENDING` | Cartões da home |
| POST | `/actions/:id/approve`, `/actions/:id/dismiss`, `/actions/:id/revert` | Decisões |
| GET | `/properties/:id/insights?month=` | Resultados |
| POST | `/devices` | Registrar token de push |
| GET | `/billing/plans`, POST `/billing/checkout`, POST `/billing/webhook` | Assinaturas |
| POST | `/integrations/channex/connect`, POST `/integrations/channex/webhook` | Fase 2 |
| `/admin/*` | Eventos, feriados, férias, saúde dos jobs | Interno, com RBAC |

Padrões: JSON, paginação por cursor, erros no formato `{ code, message, details }`, idempotência via header `Idempotency-Key` em POSTs de cobrança e de ações, rate limiting por usuário.

### 8.5 Jobs (BullMQ)

| Job | Frequência | Função |
|---|---|---|
| `ical.sync` | 30 min por imóvel | Baixa e processa o iCal; dispara recálculo se mudou |
| `weather.refresh` | 6 h por região (grade de lat/lng arredondada) | Previsão D-0 a D-16 |
| `pricing.recompute` | Diário (madrugada) + por gatilho | Recalcula 30/180 dias e gera ações |
| `explanations.generate` | Após recálculo | LLM em lote, só para ações novas, com cache |
| `events.ingest` | Diário | Coleta de fontes de eventos + fila de curadoria |
| `notifications.daily` | No horário de cada usuário | Push com resumo |
| `insights.monthly` | Mensal | Consolida métricas |
| `channex.push` (fase 2) | Por ação aprovada / modo automático | Envia tarifas e restrições |

---

## 9. Integrações de terceiros

Todas atrás de **interfaces (adapters)** em `apps/api/src/integrations/*`, para trocar de fornecedor sem mexer no domínio e para permitir mocks nos testes.

| Integração | Uso | Observações |
|---|---|---|
| **iCal do Airbnb** | Datas ocupadas (MVP) | Só datas; sem preço nem hóspede. Parser `node-ical` |
| **Channex.io** (fase 2) | Channel manager white-label: tarifas, disponibilidade, estadia mínima, reservas | Staging em `staging.channex.io`; no teste com Airbnb usar anúncio real com cuidado (não criar anúncios falsos). Custo de US$ 130/mês + US$ 0,50/imóvel. Confirmar suporte a preço por noite, estadia mínima por data e certificação white-label |
| **Google Maps Platform** | Autocomplete de endereço, geocoding, pontos de interesse próximos | Cachear resultados; restringir chaves por app/domínio |
| **Open-Meteo** | Previsão de 16 dias e histórico climático | Plano comercial para produção |
| **BrasilAPI** | Feriados nacionais | Feriados estaduais e municipais por curadoria própria (tabela `Holiday`) |
| **Fontes de eventos** | Shows, festas, congressos | Começar com curadoria manual por cidade no admin + APIs públicas disponíveis; **sem scraping que viole termos** |
| **LLM (API da Anthropic)** | Explicações curtas e classificação de porte e raio de eventos | Saída em JSON validado com Zod; modelo configurável via env; cache por (imóvel, data, hash dos fatores) |
| **Gateway de pagamento brasileiro** (ex.: Asaas, Mercado Pago, Pagar.me ou Stripe com Pix) | Assinaturas com Pix, cartão e boleto | Escolher após comparar taxas; adapter `BillingProvider` |
| **Expo Push** | Notificações iOS e Android | Tokens em `DeviceToken` |
| **E-mail transacional** (ex.: Resend) | Código de login, resumo semanal | — |
| **Sentry** | Erros | — |

---

## 10. Requisitos não funcionais

- **Segurança:** HTTPS; segredos só em variáveis de ambiente; URLs iCal e tokens do Channex criptografados no banco; RBAC para admin; validação de entrada em todas as rotas.
- **LGPD:** base legal e termos claros, exclusão e exportação de dados, coleta mínima, registro de consentimento.
- **Desempenho:** p95 da API < 300 ms nas rotas de leitura; recálculo de 180 noites < 200 ms por imóvel.
- **Disponibilidade:** 99,5% no MVP; jobs com retry exponencial e dead-letter queue.
- **Acessibilidade:** contraste AA, suporte a fonte dinâmica, rótulos para leitores de tela.
- **Internacionalização:** pt-BR no lançamento, com strings externalizadas (i18n) desde o início.
- **Qualidade:** cobertura acima de 90% no `pricing-engine`; testes de integração para a API; testes E2E dos fluxos de onboarding e aprovação (Maestro no mobile, Playwright na web).

---

## 11. Marcos de entrega

| Marco | Conteúdo | Critério de aceite |
|---|---|---|
| **M0 — Fundação** | Monorepo, CI, lint, design tokens, banco, auth | Login funcionando no app e na web |
| **M1 — Motor** | `pricing-engine` com todas as regras e testes | Testes cobrindo cada regra e cenários do vídeo |
| **M2 — Imóvel + iCal** | Onboarding, sync de iCal, detecção de órfãs | Calendário real importado e exibido |
| **M3 — Dados locais** | Feriados, férias, clima, eventos (admin) | Fatores aparecendo no detalhe da noite |
| **M4 — Recomendações** | Ações, cartões, aprovação, explicações por LLM, push | Fluxo diário completo no app |
| **M5 — Resultados + cobrança** | Insights, planos, checkout web, webhooks | Assinatura Pro ativa reconhecida no app |
| **M6 — Beta fechado** | 20 anfitriões reais | Métricas da seção 10 do modelo de negócios |
| **M7 — Fase 2** | Channex: conectar, aplicar automático, reservas via webhook | Preço aprovado aparece no Airbnb em < 5 min |

---

## 12. Questões em aberto

- Identidade visual definitiva da marca Precisari (logo, paleta, tom de voz).
- Gateway de pagamento: Asaas (decidido em 2026-11-09).
- Fontes de eventos por cidade no lançamento (quais 5 cidades primeiro?).
- Resposta do Channex sobre certificação white-label e recursos do Airbnb.
- Regras vigentes das lojas para assinatura vendida fora do app.
