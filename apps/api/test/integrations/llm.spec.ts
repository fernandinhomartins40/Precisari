import { describe, expect, it } from 'vitest';
import { AnthropicLlmProvider, mentionsOnlyKnownNumbers } from '../../src/integrations/llm/anthropic.adapter';
import { FakeLlmProvider } from '../../src/integrations/llm/llm.fake';
import { templateExplanation, heuristicEventClassification } from '../../src/integrations/llm/templates';
import type { ExplanationInput } from '../../src/integrations/ports';
import { mockFetch } from './mock-fetch';

const input: ExplanationInput = {
  date: '2026-11-14',
  weekdayLabel: 'Sábado',
  status: 'free',
  fromPrice: 25900,
  toPrice: 28900,
  minStay: 2,
  destinationType: 'BEACH',
  propertyName: 'Casa Campeche',
  factors: [
    { key: 'weekday', multiplier: 1.2, label: 'Sábado costuma lotar' },
    { key: 'event', multiplier: 1.3, label: 'Show a 2 km' },
  ],
};

function message(text: string) {
  return {
    body: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    },
  };
}

describe('Anthropic LLM adapter', () => {
  it('returns validated JSON explanations from the Messages API', async () => {
    const { fetchFn, calls } = mockFetch(() => message('{"headline":"Sábado tá disputado","text":"Show a 2 km e sábado cheio: sugerimos R$ 289."}'));
    const llm = new AnthropicLlmProvider('sk-test', 'claude-haiku-5-5', { fetchFn });
    const out = await llm.explain(input);
    expect(out).toEqual({ headline: 'Sábado tá disputado', text: 'Show a 2 km e sábado cheio: sugerimos R$ 289.' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/v1/messages');
    expect(calls[0]?.headers['x-api-key'] ?? calls[0]?.headers.authorization).toMatch(/sk-test/);
    const body = calls[0]?.body as { model: string; output_config: { format: { type: string } } };
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.output_config.format.type).toBe('json_schema');
  });

  it('retries once on invalid output, then succeeds', async () => {
    const { fetchFn, calls } = mockFetch(
      () => message('{"headline":"Um título muito longo que passa de quarenta caracteres com folga","text":"x"}'),
      () => message('{"headline":"Sábado tá disputado","text":"Sábado costuma lotar e tem show a 2 km."}'),
    );
    const out = await new AnthropicLlmProvider('k', 'm', { fetchFn }).explain(input);
    expect(calls).toHaveLength(2);
    expect(out.headline).toBe('Sábado tá disputado');
  });

  it('falls back to the deterministic template after two failures (HTTP error / invented numbers)', async () => {
    const { fetchFn, calls } = mockFetch(
      () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'boom' } } }),
      () => message('{"headline":"Sábado lotado","text":"Show com 50 mil pessoas a 7 km do imóvel."}'),
    );
    const out = await new AnthropicLlmProvider('k', 'm', { fetchFn }).explain(input);
    expect(calls).toHaveLength(2);
    expect(out).toEqual(templateExplanation(input));
  });

  it('classifies events and falls back to the keyword heuristic', async () => {
    const ok = mockFetch(() => message('{"size":"XG","radiusKm":15,"confidence":0.9}'));
    expect(await new AnthropicLlmProvider('k', 'm', { fetchFn: ok.fetchFn }).classifyEvent({ name: 'Rock in Rio', city: 'Rio de Janeiro' })).toEqual({
      size: 'XG', radiusKm: 15, confidence: 0.9,
    });
    const bad = mockFetch(() => message('not json'));
    const out = await new AnthropicLlmProvider('k', 'm', { fetchFn: bad.fetchFn }).classifyEvent({ name: 'Festival de Inverno', city: 'Gramado' });
    expect(bad.calls).toHaveLength(2);
    expect(out).toEqual(heuristicEventClassification({ name: 'Festival de Inverno', city: 'Gramado' }));
    expect(out.size).toBe('G');
  });

  it('guards against numbers not present in the input', () => {
    expect(mentionsOnlyKnownNumbers({ headline: 'Sábado tá disputado', text: 'Show a 2 km, sugerimos R$ 289.' }, input)).toBe(true);
    expect(mentionsOnlyKnownNumbers({ headline: 'Sábado', text: 'Show para 45 mil pessoas' }, input)).toBe(false);
  });
});

describe('Templates and fake LLM', () => {
  it('produce short, deterministic pt-BR copy', async () => {
    const t = templateExplanation(input);
    expect(t.headline).toBe('Sábado tem evento por perto');
    expect(t.headline.length).toBeLessThanOrEqual(40);
    expect(t.text.length).toBeLessThanOrEqual(140);
    expect(t.text).toContain('R$ 289');
    expect(t.text).toContain('Mínimo de 2 noites');
    const fake = new FakeLlmProvider();
    expect(await fake.explain(input)).toEqual(await fake.explain(input));
    expect(fake.explainCalls).toBe(2);
    const down = templateExplanation({ ...input, toPrice: 19900, factors: [{ key: 'weather', multiplier: 0.85, label: 'Chuva forte prevista' }] });
    expect(down.headline).toBe('Chuva pode esfriar a procura');
  });
});
