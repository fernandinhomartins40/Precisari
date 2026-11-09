'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { RuleKey, parseBRLToCents, type Aggressiveness, type PropertyDto } from '@precisari/shared';
import { formatNumber, t } from '@/i18n';
import { api } from '@/lib/api';
import { formatAgo } from '@/lib/dates';
import { qk, useProperty, useUpdateProperty } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Dialog, EmptyState, Field, Segmented, Skeleton, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { PropertyPhoto } from '@/components/app/property-selector';
import { SyncBadge, SyncButton } from '@/components/app/sync-status';
import p from '@/components/app/page.module.css';

const reais = (c: number | null) => (c === null ? '' : formatNumber(c / 100, 2));

function Form({ property }: { property: PropertyDto }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const update = useUpdateProperty(property.id);
  const [base, setBase] = useState(reais(property.basePrice));
  const [min, setMin] = useState(reais(property.minPrice));
  const [max, setMax] = useState(reais(property.maxPrice));
  const [cleaning, setCleaning] = useState(reais(property.cleaningFee));
  const [fixed, setFixed] = useState(reais(property.monthlyFixedCosts));
  const [fee, setFee] = useState(formatNumber(property.platformFeePct * 100, 1));
  const [aggr, setAggr] = useState<Aggressiveness>(property.aggressiveness);
  const [rules, setRules] = useState<Record<string, boolean>>(property.rulesConfig.enabled);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [icalUrl, setIcalUrl] = useState('');

  const del = useMutation({
    mutationFn: () => api().properties.delete(property.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.properties });
      await qc.invalidateQueries({ queryKey: ['actions'] });
      toast({ message: t('propertySettings.deleted') });
      router.push('/app/imoveis');
    },
  });

  const connect = useMutation({
    mutationFn: () => api().properties.connectCalendar(property.id, icalUrl.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.property(property.id) });
      void qc.invalidateQueries({ queryKey: qk.properties });
    },
  });

  useEffect(() => setError(null), [base, min, max]);

  const save = () => {
    const b = parseBRLToCents(base);
    const mi = parseBRLToCents(min);
    const ma = parseBRLToCents(max);
    const cl = parseBRLToCents(cleaning || '0');
    const fx = fixed.trim() ? parseBRLToCents(fixed) : null;
    const pct = Number(fee.replace(',', '.'));
    if (!b || !mi || !ma || mi > b || b > ma || cl === null || Number.isNaN(pct)) {
      setError(t('propertySettings.limitsError'));
      return;
    }
    update.mutate(
      {
        basePrice: b,
        minPrice: mi,
        maxPrice: ma,
        cleaningFee: cl,
        monthlyFixedCosts: fx,
        platformFeePct: Math.min(0.5, Math.max(0, pct / 100)),
        aggressiveness: aggr,
        rulesConfig: { ...property.rulesConfig, enabled: rules },
      },
      {
        onSuccess: () => toast({ message: t('common.saved') }),
        onError: () => setError(t('common.errorGeneric')),
      },
    );
  };

  const src = property.calendarSources[0];
  const cur = t('common.currency');

  return (
    <div className={[p.page, p.narrow].join(' ')}>
      <header className={p.header}>
        <div className={p.statusRow}>
          <PropertyPhoto property={property} size="md" />
          <div>
            <h1>{property.name}</h1>
            <p className={p.subtitle}>
              {property.city}/{property.state} · {t(`property.destination.${property.destinationType}`)}
            </p>
          </div>
        </div>
      </header>

      <form
        className={p.stack}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <section className={p.section} aria-labelledby="prices">
          <div className={p.sectionHead}>
            <h2 id="prices">{t('propertySettings.pricesTitle')}</h2>
          </div>
          <div className={p.formGrid}>
            <Field label={t('propertySettings.base')} prefix={cur} inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
            <Field label={t('propertySettings.min')} prefix={cur} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
            <Field label={t('propertySettings.max')} prefix={cur} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
            <Field label={t('propertySettings.cleaning')} prefix={cur} inputMode="decimal" value={cleaning} onChange={(e) => setCleaning(e.target.value)} />
            <Field label={t('propertySettings.fixedCosts')} prefix={cur} inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} />
            <Field label={t('propertySettings.platformFee')} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          {error ? (
            <p className={p.errorText} role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section className={p.section} aria-labelledby="aggr">
          <div className={p.sectionHead}>
            <h2 id="aggr">{t('propertySettings.aggressivenessTitle')}</h2>
            <p>{t('propertySettings.aggressivenessText')}</p>
          </div>
          <Segmented<Aggressiveness>
            label={t('propertySettings.aggressivenessTitle')}
            value={aggr}
            onChange={setAggr}
            options={(['CONSERVATIVE', 'BALANCED', 'BOLD'] as const).map((v) => ({ value: v, label: t(`propertySettings.aggressiveness.${v}`) }))}
          />
          <p className={p.muted}>{t(`propertySettings.aggressivenessHint.${aggr}`)}</p>
        </section>

        <section className={p.section} aria-labelledby="rules">
          <div className={p.sectionHead}>
            <h2 id="rules">{t('propertySettings.rulesTitle')}</h2>
            <p>{t('propertySettings.rulesText')}</p>
          </div>
          <div className={[p.stack, p.divided].join(' ')}>
            {RuleKey.options.map((k) => (
              <Switch
                key={k}
                checked={rules[k] ?? true}
                onChange={(v) => setRules({ ...rules, [k]: v })}
                label={t(`propertySettings.rules.${k}`)}
                description={t(`propertySettings.rulesHint.${k}`)}
              />
            ))}
          </div>
        </section>

        <div className={p.actionsRow}>
          <Button type="submit" size="lg" loading={update.isPending}>
            {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>

      <section className={p.section} aria-labelledby="ical">
        <div className={p.sectionHead}>
          <h2 id="ical">{t('propertySettings.calendarTitle')}</h2>
        </div>
        {src ? (
          <>
            <div className={p.statusRow}>
              <SyncBadge property={property} />
              <span className={[p.muted, p.small].join(' ')}>{src.urlMasked}</span>
            </div>
            <p className={[p.muted, p.small].join(' ')}>{t('propertySettings.calendarLastSync', { ago: formatAgo(src.lastSyncAt) })}</p>
            {src.lastError ? <p className={p.errorText}>{src.lastError}</p> : null}
            <div className={p.actionsRow}>
              <SyncButton property={property} size="md" />
            </div>
          </>
        ) : (
          <>
            <p className={p.muted}>{t('propertySettings.calendarNone')}</p>
            <Field label={t('onboarding.ical.label')} placeholder={t('onboarding.ical.placeholder')} value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} error={connect.isError ? t('onboarding.ical.invalid') : null} />
            <div className={p.actionsRow}>
              <Button onClick={() => connect.mutate()} loading={connect.isPending}>
                {t('propertySettings.calendarConnect')}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className={[p.section, p.danger].join(' ')} aria-labelledby="danger">
        <div className={p.sectionHead}>
          <h2 id="danger">{t('propertySettings.dangerTitle')}</h2>
          <p>{t('propertySettings.dangerText')}</p>
        </div>
        <div className={p.actionsRow}>
          <Button variant="dangerOutline" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} aria-hidden="true" /> {t('propertySettings.deleteButton')}
          </Button>
        </div>
      </section>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('propertySettings.deleteConfirmTitle', { name: property.name })}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => del.mutate()} loading={del.isPending}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{t('propertySettings.deleteConfirmText')}</p>
      </Dialog>
    </div>
  );
}

export function PropertySettings({ id }: { id: string }) {
  const q = useProperty(id);
  if (q.isError) return <EmptyState icon={<Trash2 size={28} />} title={t('propertySettings.notFound')} />;
  if (!q.data) return <Skeleton height="calc(var(--space-20) * 4)" />;
  return <Form key={q.data.id} property={q.data} />;
}
