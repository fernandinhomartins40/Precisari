/** Format cents as BRL for display only. `whole` drops centavos (R$ 349). */
export function formatBRL(cents: number, opts: { whole?: boolean; signed?: boolean } = {}): string {
  const value = cents / 100;
  const s = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: opts.whole ? 0 : 2,
    maximumFractionDigits: opts.whole ? 0 : 2,
  }).format(Math.abs(value));
  const sign = value < 0 ? '−' : opts.signed && value > 0 ? '+' : '';
  return `${sign}${s}`.replace(/ /g, ' ');
}

/** Parse "249", "249,90" or "R$ 1.249,90" into cents. Returns null when invalid. */
export function parseBRLToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
