'use client';

import { Check } from 'lucide-react';
import { formatBRL, type PlanDto } from '@precisari/shared';
import { messages, t } from '@/i18n';
import { usePlans } from '@/lib/queries';
import { ButtonLink, Button } from '../ui/button';
import s from './landing.module.css';

/** Static fallback (same values as the business model) used when GET /billing/plans is unavailable. */
const FALLBACK: PlanDto[] = [
  { plan: 'FREE', name: messages.landing.pricing.plans.FREE.name, monthlyPricePerProperty: 0, yearlyPricePerProperty: 0, horizonDays: 30, maxProperties: 1, features: [...messages.landing.pricing.plans.FREE.features], trialDays: 0 },
  { plan: 'PRO', name: messages.landing.pricing.plans.PRO.name, monthlyPricePerProperty: 2990, yearlyPricePerProperty: 29900, horizonDays: 180, maxProperties: null, features: [...messages.landing.pricing.plans.PRO.features], trialDays: 14 },
  { plan: 'AUTO', name: messages.landing.pricing.plans.AUTO.name, monthlyPricePerProperty: 4490, yearlyPricePerProperty: 44900, horizonDays: 180, maxProperties: null, features: [...messages.landing.pricing.plans.AUTO.features], trialDays: 14 },
];

export function Pricing() {
  const { data } = usePlans();
  const plans = data && data.length > 0 ? data : FALLBACK;
  return (
    <div className={s.plans}>
      {plans.map((p) => {
        const isPro = p.plan === 'PRO';
        const isAuto = p.plan === 'AUTO';
        return (
          <article key={p.plan} className={[s.plan, isPro ? s.planPro : '', isAuto ? s.planSoon : ''].join(' ')} aria-labelledby={`plan-${p.plan}`}>
            <div className={s.planHead}>
              <h3 id={`plan-${p.plan}`}>{p.name}</h3>
              {isPro ? <span className={s.planBadge}>{t('landing.pricing.popular')}</span> : null}
              {isAuto ? <span className={s.planBadgeMuted}>{t('landing.pricing.phase2')}</span> : null}
            </div>
            <p className={s.planPrice}>
              <strong className="tabular">{formatBRL(p.monthlyPricePerProperty, { whole: p.monthlyPricePerProperty === 0 })}</strong>
              {p.monthlyPricePerProperty > 0 ? <span>{t('landing.pricing.perPropertyMonth')}</span> : null}
            </p>
            <ul className={s.planFeatures}>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={18} aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            {isAuto ? (
              <Button variant="secondary" block disabled>
                {t('landing.pricing.phase2')}
              </Button>
            ) : (
              <ButtonLink href="/entrar" variant={isPro ? 'primary' : 'outline'} block>
                {isPro ? t('landing.pricing.startTrial') : t('landing.pricing.startFree')}
              </ButtonLink>
            )}
          </article>
        );
      })}
    </div>
  );
}
