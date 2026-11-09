import type { BillingCycle, PlanDto } from '@precisari/shared';

export const TRIAL_DAYS = 14;
/** Yearly = 10 × monthly (2 months free). */
export const YEARLY_MONTHS = 10;

const monthly = { FREE: 0, PRO: 2990, AUTO: 4490 } as const;

/** RF-70 plans (prices in cents, per property). */
export const PLANS: PlanDto[] = [
  {
    plan: 'FREE',
    name: 'Grátis',
    monthlyPricePerProperty: monthly.FREE,
    yearlyPricePerProperty: 0,
    horizonDays: 30,
    maxProperties: 1,
    features: ['1 imóvel', 'Recomendações para 30 dias', 'Resumo semanal por e-mail'],
    trialDays: 0,
  },
  {
    plan: 'PRO',
    name: 'Pro',
    monthlyPricePerProperty: monthly.PRO,
    yearlyPricePerProperty: monthly.PRO * YEARLY_MONTHS,
    horizonDays: 180,
    maxProperties: null,
    features: [
      'Recomendações para 180 dias',
      'Eventos e feriados da sua cidade',
      'Previsão do tempo nos próximos 7 dias',
      'Noites órfãs e estadia mínima inteligente',
      'Relatório de lucro',
      'Push diário e alertas',
    ],
    trialDays: TRIAL_DAYS,
  },
  {
    plan: 'AUTO',
    name: 'Automático',
    monthlyPricePerProperty: monthly.AUTO,
    yearlyPricePerProperty: monthly.AUTO * YEARLY_MONTHS,
    horizonDays: 180,
    maxProperties: null,
    features: ['Tudo do Pro', 'Preços aplicados automaticamente no Airbnb (via Channex)', 'Reservas sincronizadas em tempo real'],
    trialDays: TRIAL_DAYS,
  },
];

export function checkoutAmountCents(plan: 'PRO' | 'AUTO', cycle: BillingCycle, propertyCount: number): number {
  const p = PLANS.find((x) => x.plan === plan);
  if (!p) throw new Error(`unknown plan ${plan}`);
  return (cycle === 'YEARLY' ? p.yearlyPricePerProperty : p.monthlyPricePerProperty) * propertyCount;
}
