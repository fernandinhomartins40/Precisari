/**
 * Deterministic pt-BR copy used as LLM fallback (and by the fake LLM). Uses only facts present in the input.
 */
import { z } from 'zod';
import { formatBRL } from '@precisari/shared';
import { clip, normalize } from '../common/text';
import type { EventClassificationInput, EventClassificationOutput, ExplanationInput, ExplanationOutput } from '../ports';

export const HEADLINE_MAX = 40;
export const TEXT_MAX = 140;

export const ExplanationSchema = z.object({
  headline: z.string().trim().min(3).max(HEADLINE_MAX),
  text: z.string().trim().min(10).max(TEXT_MAX),
});

export const EventClassificationSchema = z.object({
  size: z.enum(['P', 'M', 'G', 'XG']),
  radiusKm: z.number().min(0.5).max(50),
  confidence: z.number().min(0).max(1),
});

function topFactor(input: ExplanationInput): ExplanationInput['factors'][number] | undefined {
  return [...input.factors]
    .filter((f) => f.key !== 'limit')
    .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1))[0];
}

function headlineFor(input: ExplanationInput): string {
  const day = input.weekdayLabel;
  const up = input.toPrice >= input.fromPrice;
  const f = topFactor(input);
  switch (f?.key) {
    case 'event':
      return `${day} tem evento por perto`;
    case 'carnival':
      return 'Carnaval puxa a procura';
    case 'newYear':
      return 'Réveillon disputado';
    case 'longWeekend':
      return 'Feriadão à vista';
    case 'holiday':
      return 'Feriado aquece a procura';
    case 'schoolVacation':
      return 'Férias escolares chegando';
    case 'weather':
      return f.multiplier < 1 ? 'Chuva pode esfriar a procura' : 'Tempo bom ajuda';
    case 'leadTime':
      return f.multiplier < 1 ? 'Data chegando: preço mais leve' : 'Reserva antecipada vale mais';
    case 'orphan':
      return 'Noite solta entre reservas';
    case 'adjacent':
      return 'Colada numa reserva';
    case 'minStay':
      return 'Estadia mínima ajustada';
    case 'profitProtection':
      return 'Protegendo seu lucro';
    case 'seasonality':
      return f.multiplier >= 1 ? 'Alta temporada' : 'Baixa temporada';
    case 'weekday':
      return f.multiplier >= 1 ? `${day} tá disputado` : `${day} pede preço mais leve`;
    default:
      return up ? `${day} pede preço maior` : `${day} pede preço mais leve`;
  }
}

export function templateExplanation(input: ExplanationInput): ExplanationOutput {
  const f = topFactor(input);
  const price = formatBRL(input.toPrice, { whole: true });
  const reason = f ? `${f.label}.` : input.toPrice >= input.fromPrice ? 'Procura acima do normal.' : 'Procura abaixo do normal.';
  const stay = input.minStay > 1 ? ` Mínimo de ${input.minStay} noites.` : '';
  const text = `${reason} Sugerimos ${price}.${stay}`;
  return { headline: clip(headlineFor(input), HEADLINE_MAX), text: clip(text, TEXT_MAX) };
}

const XG = ['rock in rio', 'lollapalooza', 'formula 1', 'formula1', 'grande premio', 'grand prix', 'reveillon', 'the town', 'olimpiada', 'copa do mundo'];
const G = ['festival', 'oktoberfest', 'natal luz', 'parada', 'maratona', 'carnaval', 'micareta', 'show de', 'turne', 'final do campeonato'];
const M = ['show', 'congresso', 'feira', 'expo', 'conferencia', 'jogo', 'campeonato', 'festa'];
const RADIUS: Record<EventClassificationOutput['size'], number> = { P: 2, M: 5, G: 10, XG: 20 };

export function heuristicEventClassification(input: EventClassificationInput): EventClassificationOutput {
  const t = normalize(`${input.name} ${input.description ?? ''} ${input.venue ?? ''}`);
  const size: EventClassificationOutput['size'] = XG.some((k) => t.includes(k))
    ? 'XG'
    : G.some((k) => t.includes(k))
      ? 'G'
      : M.some((k) => t.includes(k))
        ? 'M'
        : 'P';
  return { size, radiusKm: RADIUS[size], confidence: 0.3 };
}
