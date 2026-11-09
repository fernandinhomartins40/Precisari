# Modelo de Negócios — Precisari

> Precificação inteligente para anfitriões de Airbnb no Brasil, num app simples, nativo e bonito.
> Versão 0.1 · novembro de 2026

---

## 1. Resumo

A Precisari é um app (iOS, Android e web) que diz ao anfitrião de Airbnb **quanto cobrar em cada noite** e explica o motivo em português simples. O app cruza o calendário do anúncio com dados brasileiros que as ferramentas globais tratam de forma genérica: feriados e emendas, férias escolares por estado, eventos locais, clima e concorrência. O anfitrião recebe uma notificação, vê os ajustes sugeridos e aprova com um toque. Na fase 2, os preços passam a ser aplicados automaticamente no Airbnb.

**Tese:** a técnica de precificação dinâmica já existe (PriceLabs, Beyond, Wheelhouse). O que não existe é um produto pensado para o **anfitrião pequeno brasileiro**, com 1 a 3 imóveis, que não quer aprender revenue management e não confia em preço automático sem entender o porquê.

---

## 2. Problema

- O anfitrião pequeno cobra **o mesmo preço todo dia**. Perde dinheiro nos fins de semana e feriados, quando vende barato, e nos dias de semana, quando fica vazio por estar caro.
- O **Preço Inteligente do Airbnb** é gratuito, mas tende a priorizar ocupação em vez da receita do dono e não explica as sugestões.
- O **PriceLabs** é poderoso, mas foi feito para gestores profissionais: painel complexo, jargão (RevPAR, ADR) e configuração longa.
- O calendário brasileiro é peculiar: Carnaval móvel, feriados municipais, emendas, férias escolares diferentes por estado e eventos regionais. Ferramentas globais tratam tudo isso de forma superficial.
- Noites órfãs, estadias de uma noite que dão prejuízo por causa da faxina e descontos de última hora mal calibrados corroem o lucro sem o anfitrião perceber.

## 3. Cliente-alvo

| Segmento | Descrição | Prioridade |
|---|---|---|
| **Anfitrião pequeno** (persona principal) | 1 a 3 imóveis, renda complementar, gerencia sozinho pelo celular, não usa PMS nem channel manager | **MVP** |
| Coanfitrião / gestor pequeno | Gerencia 4 a 20 imóveis de terceiros, cobra comissão | Fase 2 |
| Gestora profissional | Mais de 20 imóveis, já usa PMS e muitas vezes PriceLabs | Fora do foco inicial |

**Persona principal — "Carla, 38 anos"**: tem um apartamento em Florianópolis e um studio em São Paulo. Trabalha CLT, responde hóspedes pelo celular no intervalo. Define preço "no feeling" olhando dois ou três vizinhos uma vez por mês. Quer ganhar mais sem gastar mais tempo.

## 4. Proposta de valor

> **"Seu imóvel cobrando o preço certo em cada noite, sem planilha e sem complicação."**

1. **Simples:** abriu o app, viu o que mudar hoje, aprovou. Menos de 1 minuto por dia.
2. **Explica o porquê:** "Sábado R$ 340 — show a 2 km e vizinhos 80% ocupados."
3. **Feito para o Brasil:** feriadões, Carnaval, férias por estado, eventos locais e clima.
4. **Foco no lucro:** considera faxina, taxas e custos fixos, e não só a receita.
5. **Visual moderno:** um app que dá vontade de abrir, sem cara de software corporativo.

## 5. Diferenciais competitivos

| Diferencial | Preço Inteligente (Airbnb) | PriceLabs | **Precisari** |
|---|---|---|---|
| Preço | Grátis | A partir de R$ 47,50/imóvel/mês | Grátis para começar; Pro mais barato |
| Público | Todos | Gestores profissionais | **Anfitrião pequeno** |
| App nativo simples | Dentro do app Airbnb | Foco em painel web | **App nativo first** |
| Explica cada preço | Não | Parcial | **Sim, em linguagem natural** |
| Calendário brasileiro (emendas, férias por estado, eventos locais) | Genérico | Bom, mas global | **Prioridade do produto** |
| Clima no preço | Não declarado | Não é foco | **Sim, por tipo de destino** |
| Lucro líquido (faxina e custos) | Não | Parcial | **Sim** |
| Funciona sem channel manager | Sim | Requer integração | **Sim (iCal) + automático na fase 2** |

**Barreiras de defesa (moats) que crescem com o tempo:**
- **Base de dados local:** eventos, feriados municipais e efeito do clima por destino, que melhora a cada cidade atendida.
- **Calibração por imóvel:** o motor aprende o efeito real de cada fator no histórico de cada anúncio.
- **Comunidade e marca** junto a anfitriões pequenos e criadores de conteúdo do nicho.

## 6. Produto e fases

| Fase | Entrega | Integração com o Airbnb |
|---|---|---|
| **MVP (fase 1)** | App nativo + web, recomendações diárias com explicação, aprovação manual (o anfitrião copia o preço para o Airbnb com um atalho) | **iCal** (somente leitura de datas ocupadas) |
| **Fase 2** | Aplicar preços, estadia mínima e descontos automaticamente | **Channex.io** (channel manager white-label, parceiro do Airbnb) |
| **Fase 3** | Multi-imóvel para coanfitriões, relatórios para proprietários, benchmark de mercado | Channex + dados de mercado pagos |

## 7. Modelo de receita

Assinatura mensal por imóvel, com pagamento por **Pix, cartão e boleto**.

| Plano | Preço sugerido | Inclui |
|---|---|---|
| **Grátis** | R$ 0 | 1 imóvel, recomendações para os próximos 30 dias, resumo semanal |
| **Pro** | R$ 29,90/imóvel/mês | Recomendações diárias para 180 dias, eventos, clima, noites órfãs, relatório de lucro |
| **Automático** | R$ 44,90/imóvel/mês | Tudo do Pro + aplicação automática no Airbnb via Channex |

- Desconto anual de 2 meses grátis.
- Desconto por volume a partir de 4 imóveis (para coanfitriões).
- **Teste:** 14 dias do plano Pro sem cartão.
- **Experimento futuro:** cobrança por resultado, um percentual da receita extra comprovada em relação aos 90 dias anteriores.

> Os preços são hipóteses para validar com clientes reais antes do lançamento.

## 8. Estrutura de custos (estimativa mensal)

| Item | Custo |
|---|---|
| Channex | US$ 130 fixo + US$ 0,50/imóvel conectado (só a partir da fase 2) |
| Infraestrutura (API, banco, filas, jobs) | ~R$ 300–1.000 no início |
| Google Maps Platform (Places/Geocoding) | Por uso; cache agressivo para reduzir |
| Clima (Open-Meteo comercial) | Plano pago de baixo custo |
| LLM (explicações e classificação de eventos) | Por uso; gerar em lote e cachear |
| Gateway de pagamento | ~1–5% por transação, conforme o meio |
| Lojas de apps | Apple US$ 99/ano; Google US$ 25 uma vez; comissão de 15% sobre assinaturas compradas dentro do app |

**Unit economics alvo (plano Pro):** custo variável por imóvel abaixo de R$ 5/mês, ou seja, margem bruta acima de 80%.

> Atenção às regras das lojas: assinatura de serviço digital vendida dentro do app iOS/Android normalmente precisa usar a compra in-app (comissão de 15% para pequenos desenvolvedores). Uma estratégia comum é vender pela web (Pix) e o app apenas reconhecer a assinatura. Valide as regras vigentes antes do lançamento.

## 9. Canais de aquisição

1. **Criadores de conteúdo do nicho Airbnb** (Instagram, TikTok, YouTube): reels educativos como o que originou a ideia, com link de afiliado.
2. **Conteúdo próprio:** reels curtos explicando uma técnica por vídeo (noite órfã, feriadão, chuva), sempre terminando com "o app faz isso por você".
3. **Ferramentas gratuitas de isca:** "calculadora de quanto você está perdendo" na web, que exige só o link do anúncio.
4. **Comunidades de anfitriões** em grupos do Facebook, fóruns e eventos regionais.
5. **Parcerias com coanfitriões, faxineiras e lavanderias** que atendem vários imóveis pequenos, com indicação remunerada.
6. **Indicação (referral):** 1 mês grátis para quem indica e para o indicado.

## 10. Métricas-chave

| Métrica | Meta inicial |
|---|---|
| Ativação: imóvel com iCal conectado e primeira recomendação vista | > 60% dos cadastros |
| Taxa de aprovação de recomendações | > 50% |
| Retenção D30 | > 40% |
| Conversão de Grátis para Pro | > 5% |
| Churn mensal Pro | < 5% |
| **Ganho de receita comprovado por imóvel** (vs. 90 dias anteriores) | +10% ou mais |
| CAC payback | < 3 meses |

## 11. Validação antes de construir tudo

1. **Semana 1–2:** 20 entrevistas com anfitriões pequenos. Como definem o preço? Usam o Preço Inteligente? Quanto pagariam?
2. **Semana 2–3:** landing page com lista de espera e a calculadora de "quanto você está perdendo".
3. **Semana 3–6:** concierge MVP: gerar recomendações para 10 imóveis e medir se o anfitrião aplica e se a receita sobe.
4. **Critério para seguir:** pelo menos 5 de 10 anfitriões dizendo que pagariam e ganho médio de receita visível.

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Airbnb melhora o Preço Inteligente | Diferenciar em explicação, dados locais, lucro e multiplataforma (Booking na fase 3) |
| PriceLabs simplifica e foca no pequeno | Velocidade, marca local, comunidade, preço |
| Dados de concorrência difíceis de obter legalmente | MVP sem concorrência direta; depois fornecedor pago (ex.: AirDNA) ou dados agregados da própria base |
| Dados de eventos incompletos | Curadoria manual por cidade no início + fontes abertas + sugestões dos próprios usuários |
| iCal só traz datas ocupadas | Suficiente para o MVP; Channex na fase 2 |
| Anfitrião não confia em preço automático | Explicação + aprovação manual + limites mínimo/máximo definidos por ele |
| Regras de assinatura das lojas | Venda via web, app reconhece a assinatura |
| Scraping do Airbnb | **Proibido no produto**: viola os termos de uso |

## 13. Próximos passos

1. Registrar a marca Precisari no INPI (classe 42), o domínio e as variações de grafia, e o @ nas redes.
2. Rodar as entrevistas e o concierge MVP.
3. Construir o MVP conforme `docs/prd.md`.
4. Agendar call com o Channex (staging, certificação white-label, recursos do Airbnb).
