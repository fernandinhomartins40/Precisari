import type { ActionType } from '@prisma/client';
import { formatBRL, type FactorDto } from '@precisari/shared';
import { shortDateLabel, weekdayLabel } from '../common/dates';

/** Factors that only inform (multiplier 1) or that are bookkeeping are not good "reasons". */
const NON_REASON_KEYS = new Set(['limit', 'minStay']);

export function topFactors(factors: readonly FactorDto[], n = 2): FactorDto[] {
  return [...factors]
    .filter((f) => !NON_REASON_KEYS.has(f.key) && Math.abs(f.multiplier - 1) >= 0.01)
    .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1))
    .slice(0, n);
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Deterministic pt-BR headline/explanation used until the LLM layer fills one (rule 5: every
 * recommendation needs a readable explanation). Short, human, no jargon.
 */
export function fallbackExplanation(input: {
  type: ActionType;
  date: string;
  fromValue: number;
  toValue: number;
  factors: readonly FactorDto[];
}): { headline: string; explanation: string } {
  const day = `${weekdayLabel(input.date)} ${shortDateLabel(input.date)}`;
  const reasons = topFactors(input.factors).map((f) => lowerFirst(f.label));
  const because = reasons.length ? ` Motivo: ${reasons.join(' e ')}.` : '';
  const from = formatBRL(input.fromValue, { whole: true });
  const to = formatBRL(input.toValue, { whole: true });

  switch (input.type) {
    case 'MIN_STAY': {
      const n = input.toValue;
      return {
        headline: `${day}: estadia mínima de ${n} ${n === 1 ? 'noite' : 'noites'}`,
        explanation: `Sugerimos mudar a estadia mínima de ${input.fromValue} para ${n} ${n === 1 ? 'noite' : 'noites'}.${because || ' Isso ajuda a evitar lacunas difíceis de vender.'}`,
      };
    }
    case 'ORPHAN':
      return {
        headline: `${day}: noite solta entre reservas`,
        explanation: `Essa noite ficou isolada entre duas reservas. Baixar de ${from} para ${to} aumenta a chance de vendê-la.${because}`,
      };
    case 'ADJACENT':
      return {
        headline: `${day}: colada a uma reserva`,
        explanation: `Um desconto leve (de ${from} para ${to}) atrai quem quer entrar no dia da saída de outro hóspede.${because}`,
      };
    case 'PRICE':
    default: {
      const up = input.toValue > input.fromValue;
      return {
        headline: up ? `${day} tá disputado` : `${day} pede um preço mais leve`,
        explanation: up
          ? `Dá para cobrar ${to} em vez de ${from}.${because || ' A procura está acima do normal.'}`
          : `Baixar de ${from} para ${to} deixa a noite mais competitiva.${because || ' A procura está abaixo do normal.'}`,
      };
    }
  }
}
