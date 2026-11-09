import type { FactorDto } from '@precisari/shared';

/** Signed percentage effect of a multiplier: 1.3 → +30, 0.85 → −15. */
export function factorPct(multiplier: number): number {
  return Math.round((multiplier - 1) * 100);
}

export function formatFactorPct(multiplier: number): string {
  const pct = factorPct(multiplier);
  if (pct === 0) return '0%';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

/** Bar width 0..1 relative to the strongest factor in the list. */
export function factorWeights(factors: readonly FactorDto[]): { factor: FactorDto; weight: number }[] {
  const max = Math.max(0.01, ...factors.map((f) => Math.abs(f.multiplier - 1)));
  return [...factors]
    .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1))
    .map((factor) => ({ factor, weight: Math.abs(factor.multiplier - 1) / max }));
}
