'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Barcode, Check, Copy, CreditCard, ExternalLink, PartyPopper, QrCode } from 'lucide-react';
import { formatBRL, type BillingCycle, type CheckoutDto, type PaymentMethod, type PlanDto } from '@precisari/shared';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { copyText } from '@/lib/clipboard';
import { formatTimeBR } from '@/lib/dates';
import { qk, usePlans, useProperties } from '@/lib/queries';
import { isValidTaxId, maskTaxId, onlyDigits } from '@/lib/tax-id';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Logo, NumberStepper, Segmented, ThemeToggle } from '@/components/ui/primitives';
import s from './checkout.module.css';

type PaidPlan = 'PRO' | 'AUTO';
/** Automático (Channex auto-apply) is phase 2 (PRD RF-43). */
const AUTO_ENABLED = false;
const METHOD_ICON: Record<PaymentMethod, React.ReactNode> = {
  PIX: <QrCode size={22} aria-hidden="true" />,
  CARD: <CreditCard size={22} aria-hidden="true" />,
  BOLETO: <Barcode size={22} aria-hidden="true" />,
};

export function CheckoutFlow() {
  const user = useUser();
  const params = useSearchParams();
  const plans = usePlans();
  const properties = useProperties();
  // ?plano=pro|auto (from /assinar, used by the mobile app). Automático is phase 2, so it stays visible but disabled.
  const requested = params.get('plano')?.toUpperCase();
  const [plan, setPlan] = useState<PaidPlan>(requested === 'AUTO' && AUTO_ENABLED ? 'AUTO' : 'PRO');
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [count, setCount] = useState(1);
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [taxId, setTaxId] = useState('');
  const [taxError, setTaxError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutDto | null>(null);
  const [copied, setCopied] = useState(false);
  const returning = Boolean(params.get('retorno'));
  const waiting = Boolean(result) || returning;

  useEffect(() => {
    if (properties.data?.length) setCount(properties.data.length);
  }, [properties.data]);

  const me = useQuery({
    queryKey: qk.me,
    queryFn: () => api().me.get(),
    refetchInterval: (q) => (waiting && q.state.data?.subscription.status !== 'ACTIVE' ? 2500 : false),
    initialData: user,
  });
  const active = waiting && me.data.subscription.status === 'ACTIVE';

  const planDto: PlanDto | undefined = plans.data?.find((p) => p.plan === plan);
  const unit = planDto ? (cycle === 'MONTHLY' ? planDto.monthlyPricePerProperty : planDto.yearlyPricePerProperty) : 0;
  const total = unit * count;
  const trialDays = user.subscription.trialEndsAt ? Math.max(0, Math.ceil((new Date(user.subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;

  async function pay() {
    if (!isValidTaxId(taxId)) {
      setTaxError(t('checkout.taxIdInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api().billing.checkout({ plan, cycle, paymentMethod: method, propertyCount: count, taxId: onlyDigits(taxId) });
      if (r.redirectUrl && method === 'CARD') {
        window.location.assign(r.redirectUrl);
        return;
      }
      setResult(r);
    } catch {
      setError(t('checkout.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <Logo href="/app" width={150} />
        <div className={s.headerActions}>
          <ThemeToggle />
          <ButtonLink href="/app/conta" variant="ghost" size="sm">
            <ArrowLeft size={16} aria-hidden="true" /> {t('common.back')}
          </ButtonLink>
        </div>
      </header>
      <main id="conteudo" className={s.main}>
        {active ? (
          <section className={s.success} data-testid="checkout-success">
            <span className={s.successIcon} aria-hidden="true">
              <PartyPopper size={36} />
            </span>
            <h1>{t('checkout.successTitle')}</h1>
            <p>{t('checkout.successText', { plan: t(`landing.pricing.plans.${me.data.subscription.plan}.name`) })}</p>
            <ButtonLink href="/app" size="lg">
              {t('checkout.successCta')}
            </ButtonLink>
          </section>
        ) : waiting ? (
          <section className={s.pending} aria-live="polite">
            {result?.pixQrCode ? (
              <>
                <h1>{t('checkout.pixTitle')}</h1>
                <p className={s.muted}>{t('checkout.pixText')}</p>
                <Image className={s.qr} src={result.pixQrCode} alt={t('checkout.pixQrAlt')} width={220} height={220} unoptimized />
                {result.pixCopyPaste ? (
                  <div className={s.copyRow}>
                    <code className={s.code}>{result.pixCopyPaste}</code>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setCopied(await copyText(result.pixCopyPaste ?? ''));
                      }}
                    >
                      {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
                      {copied ? t('common.copied') : t('checkout.pixCopy')}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : result?.boletoUrl ? (
              <>
                <h1>{t('checkout.boletoTitle')}</h1>
                <p className={s.muted}>{t('checkout.boletoText')}</p>
                <a className={s.boleto} href={result.boletoUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={18} aria-hidden="true" /> {t('checkout.boletoOpen')}
                </a>
              </>
            ) : null}
            {result?.expiresAt ? <p className={s.muted}>{t('checkout.expires', { time: formatTimeBR(result.expiresAt) })}</p> : null}
            <p className={s.waiting} role="status">
              <span className={s.spinner} aria-hidden="true" /> {t('checkout.waiting')}
            </p>
          </section>
        ) : (
          <form
            className={s.grid}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void pay();
            }}
          >
            <div className={s.form}>
              <div>
                <h1>{t('checkout.title')}</h1>
                <p className={s.muted}>{t('checkout.subtitle')}</p>
              </div>

              <fieldset className={s.fieldset}>
                <legend>{t('checkout.planLabel')}</legend>
                <div className={s.options}>
                  {(['PRO', 'AUTO'] as const).map((pl) => {
                    const dto = plans.data?.find((x) => x.plan === pl);
                    const soon = pl === 'AUTO' && !AUTO_ENABLED;
                    return (
                      <label key={pl} className={s.option} data-checked={plan === pl || undefined} data-disabled={soon || undefined}>
                        <input type="radio" name="plan" className="visually-hidden" checked={plan === pl} disabled={soon} onChange={() => setPlan(pl)} />
                        <span className={s.optionHead}>
                          <strong>{t(`landing.pricing.plans.${pl}.name`)}</strong>
                          {soon ? <span className={s.soon}>{t('common.soonBadge')}</span> : null}
                        </span>
                        <span className={s.optionPrice}>
                          {dto ? formatBRL(dto.monthlyPricePerProperty) : '—'} <small>{t('landing.pricing.perPropertyMonth')}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className={s.row}>
                <div className={s.fieldset}>
                  <span className={s.legend}>{t('checkout.cycleLabel')}</span>
                  <Segmented<BillingCycle>
                    label={t('checkout.cycleLabel')}
                    value={cycle}
                    onChange={setCycle}
                    options={[
                      { value: 'MONTHLY', label: t('checkout.monthly') },
                      { value: 'YEARLY', label: `${t('checkout.yearly')} · ${t('checkout.yearlyBadge')}` },
                    ]}
                  />
                </div>
                <NumberStepper label={t('checkout.propertiesLabel')} value={count} min={1} max={50} onChange={setCount} />
              </div>

              <fieldset className={s.fieldset}>
                <legend>{t('checkout.methodLabel')}</legend>
                <div className={s.methods}>
                  {(['PIX', 'CARD', 'BOLETO'] as const).map((m) => (
                    <label key={m} className={s.option} data-checked={method === m || undefined}>
                      <input type="radio" name="method" className="visually-hidden" checked={method === m} onChange={() => setMethod(m)} />
                      <span className={s.methodHead}>
                        {METHOD_ICON[m]}
                        <strong>{t(`checkout.methods.${m}`)}</strong>
                      </span>
                      <small className={s.muted}>{t(`checkout.methodHint.${m}`)}</small>
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field
                label={t('checkout.taxIdLabel')}
                placeholder={t('checkout.taxIdPlaceholder')}
                inputMode="numeric"
                autoComplete="off"
                value={taxId}
                onChange={(e) => {
                  setTaxId(maskTaxId(e.target.value));
                  setTaxError(null);
                }}
                error={taxError}
              />
              {error ? (
                <p className={s.error} role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <aside className={s.summary} aria-labelledby="summary-title">
              <h2 id="summary-title">{t('checkout.summaryTitle')}</h2>
              <p className={s.muted}>
                {t('checkout.summaryLine', { plan: t(`landing.pricing.plans.${plan}.name`), count, price: formatBRL(unit) })}
              </p>
              <p className={s.total}>
                <span>{t('checkout.total')}</span>
                <strong className="tabular" data-testid="checkout-total">
                  {formatBRL(total)}
                </strong>
                <small>{cycle === 'MONTHLY' ? t('checkout.perMonth') : t('checkout.perYear')}</small>
              </p>
              {user.subscription.status === 'TRIALING' && trialDays > 0 ? <p className={s.trial}>{t('checkout.trialNote', { days: trialDays })}</p> : null}
              <Button type="submit" size="lg" block loading={busy}>
                {busy ? t('checkout.paying') : t('checkout.pay')}
              </Button>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
}
