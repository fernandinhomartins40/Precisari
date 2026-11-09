import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { FetchFn } from '../common/http';
import type {
  EventClassificationInput, EventClassificationOutput, ExplanationInput, ExplanationOutput, HealthStatus, LlmProvider,
} from '../ports';
import {
  EventClassificationSchema, ExplanationSchema, HEADLINE_MAX, TEXT_MAX, heuristicEventClassification, templateExplanation,
} from './templates';

const EXPLAIN_SYSTEM = `Você escreve explicações curtíssimas, em português do Brasil, para anfitriões de Airbnb sobre o preço sugerido de uma noite.
Regras:
- Tom humano, leve e direto (ex.: "Sábado tá disputado"). Nada de jargão técnico.
- "headline": no máximo ${HEADLINE_MAX} caracteres.
- "text": no máximo ${TEXT_MAX} caracteres, uma ou duas frases.
- Use SOMENTE os fatos fornecidos (fatores, datas, preços). Não invente eventos, distâncias, números ou clima.
- Você NÃO decide o preço: apenas explica o preço já calculado.
- Responda apenas com JSON: {"headline": string, "text": string}.`;

const CLASSIFY_SYSTEM = `Você classifica eventos no Brasil pelo impacto em hospedagem por temporada.
Porte: P (até ~2 mil pessoas), M (~2 a 15 mil), G (~15 a 80 mil), XG (acima de ~80 mil ou atração nacional/internacional).
radiusKm: raio de impacto em hospedagem (0.5 a 50). confidence: 0 a 1.
Responda apenas com JSON: {"size": "P"|"M"|"G"|"XG", "radiusKm": number, "confidence": number}.`;

const EXPLAIN_JSON_SCHEMA = {
  type: 'object',
  properties: { headline: { type: 'string' }, text: { type: 'string' } },
  required: ['headline', 'text'],
  additionalProperties: false,
};
const CLASSIFY_JSON_SCHEMA = {
  type: 'object',
  properties: { size: { type: 'string', enum: ['P', 'M', 'G', 'XG'] }, radiusKm: { type: 'number' }, confidence: { type: 'number' } },
  required: ['size', 'radiusKm', 'confidence'],
  additionalProperties: false,
};

/** Numbers the model is allowed to mention (guards against invented facts). */
export function allowedNumbers(input: ExplanationInput): Set<string> {
  const set = new Set<string>();
  const add = (n: number) => set.add(String(n));
  add(Math.round(input.toPrice / 100));
  add(Math.round(input.fromPrice / 100));
  add(Math.abs(Math.round((input.toPrice - input.fromPrice) / 100)));
  add(input.minStay);
  const [y, m, d] = input.date.split('-').map(Number);
  [y, m, d].forEach((n) => n !== undefined && add(n));
  for (const f of input.factors) {
    add(Math.round(Math.abs(f.multiplier - 1) * 100));
    (f.label.match(/\d+(?:[.,]\d+)?/g) ?? []).forEach((s) => set.add(s));
  }
  if (input.fromPrice > 0) add(Math.round(Math.abs(input.toPrice / input.fromPrice - 1) * 100));
  return set;
}

export function mentionsOnlyKnownNumbers(out: ExplanationOutput, input: ExplanationInput): boolean {
  const allowed = allowedNumbers(input);
  const found = `${out.headline} ${out.text}`.replace(/(\d)\.(\d{3})/g, '$1$2').match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.every((n) => allowed.has(n) || allowed.has(n.replace(',', '.')));
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Anthropic Messages API. Used ONLY for short explanations and event classification — never for prices.
 * Each call: JSON output → Zod validation → one retry → deterministic fallback.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly provider = 'anthropic';
  private readonly client: Anthropic;
  private readonly log = new Logger('AnthropicLlmProvider');

  constructor(
    apiKey: string,
    readonly model: string,
    opts: { fetchFn?: FetchFn; timeoutMs?: number } = {},
  ) {
    this.client = new Anthropic({
      apiKey,
      maxRetries: 0, // retry policy handled here (one retry, then fallback)
      timeout: opts.timeoutMs ?? 15_000,
      ...(opts.fetchFn ? { fetch: opts.fetchFn } : {}),
    });
  }

  async explain(input: ExplanationInput): Promise<ExplanationOutput> {
    const user = JSON.stringify({
      data: input.date,
      diaDaSemana: input.weekdayLabel,
      status: input.status,
      precoAnteriorReais: Math.round(input.fromPrice / 100),
      precoSugeridoReais: Math.round(input.toPrice / 100),
      estadiaMinima: input.minStay,
      tipoDeDestino: input.destinationType,
      imovel: input.propertyName,
      fatores: input.factors.map((f) => ({ fator: f.key, peso: Number(f.multiplier.toFixed(2)), descricao: f.label })),
    });
    const out = await this.ask(EXPLAIN_SYSTEM, user, EXPLAIN_JSON_SCHEMA, ExplanationSchema, 200, (o) =>
      mentionsOnlyKnownNumbers(o, input),
    );
    return out ?? templateExplanation(input);
  }

  async classifyEvent(input: EventClassificationInput): Promise<EventClassificationOutput> {
    const out = await this.ask(CLASSIFY_SYSTEM, JSON.stringify(input), CLASSIFY_JSON_SCHEMA, EventClassificationSchema, 100);
    return out ?? heuristicEventClassification(input);
  }

  private async ask<T>(
    system: string,
    user: string,
    jsonSchema: Record<string, unknown>,
    schema: ZodType<T>,
    maxTokens: number,
    extraCheck?: (v: T) => boolean,
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { format: { type: 'json_schema', schema: jsonSchema } },
        });
        const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        const parsed = schema.safeParse(extractJson(text));
        if (!parsed.success) throw new Error(`invalid LLM output: ${parsed.error.message}`);
        if (extraCheck && !extraCheck(parsed.data)) throw new Error('LLM output mentions facts not in the input');
        return parsed.data;
      } catch (err) {
        this.log.warn(`LLM attempt ${attempt} failed: ${(err as Error).message}`);
      }
    }
    return null;
  }

  async healthCheck(): Promise<HealthStatus> {
    // Calls are billed: report configuration only.
    return { ok: true, detail: `modelo ${this.model}` };
  }
}
