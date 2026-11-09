/**
 * BRL input mask for whole-real prices (nightly prices are whole reais in Precisari).
 * The user types digits; we keep cents (integer) and display "1.249".
 */
const MAX_DIGITS = 7; // up to R$ 9.999.999

export interface MaskedMoney {
  cents: number | null;
  display: string;
}

export function formatReaisDigits(reais: number): string {
  return String(Math.trunc(reais)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Parse raw text from a TextInput (may contain dots, "R$", spaces, commas). */
export function maskBRLInput(text: string): MaskedMoney {
  // Ignore anything after a decimal comma: whole reais only.
  const integerPart = text.split(',')[0] ?? '';
  const digits = integerPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
  if (digits === '') return { cents: null, display: '' };
  const reais = Number(digits);
  return { cents: reais * 100, display: formatReaisDigits(reais) };
}

/** Display value for an existing cents amount ("24900" → "249"). */
export function centsToMaskedDisplay(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return formatReaisDigits(Math.round(cents / 100));
}
