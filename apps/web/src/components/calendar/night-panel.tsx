'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BedDouble, CalendarRange, CircleCheck, Cloud, CloudLightning, CloudRain, CloudSun, ExternalLink, Flame, Info, Snowflake, Sun, TrendingDown, Unlink } from 'lucide-react';
import { formatBRL, type ActionDto, type ActionsResponse, type NightDetailDto, type PropertyDto, type WeatherDto } from '@precisari/shared';
import { formatPct, t, tc } from '@/i18n';
import { api } from '@/lib/api';
import { copyText, openListing, priceForClipboard } from '@/lib/clipboard';
import { formatNightLong } from '@/lib/dates';
import { heatGroup, heatLabel } from '@/lib/heat';
import { useActionDecision, useNight } from '@/lib/queries';
import { useToast } from '../ui/toast';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/primitives';
import { FactorIcon, formatWeight } from '../app/factor-icon';
import s from './night-panel.module.css';

function WeatherIcon({ c }: { c: WeatherDto['condition'] }) {
  const p = { size: 26, 'aria-hidden': true } as const;
  if (c === 'sun') return <Sun {...p} />;
  if (c === 'partly') return <CloudSun {...p} />;
  if (c === 'cloud') return <Cloud {...p} />;
  if (c === 'rain') return <CloudRain {...p} />;
  if (c === 'storm') return <CloudLightning {...p} />;
  return <Snowflake {...p} />;
}

function limitLine(n: NightDetailDto): string {
  const min = formatBRL(n.minPrice, { whole: true });
  const max = formatBRL(n.maxPrice, { whole: true });
  if (n.suggestedPrice <= n.minPrice) return t('night.atMin', { min });
  if (n.suggestedPrice >= n.maxPrice) return t('night.atMax', { max });
  return t('night.withinLimit', { min, max });
}

export function NightPanel({ property, date }: { property: PropertyDto; date: string | null }) {
  const night = useNight(property.id, date);
  const qc = useQueryClient();
  const toast = useToast();
  const decide = useActionDecision();

  if (!date) {
    return (
      <div className={s.panel}>
        <p className={s.placeholder}>{t('calendar.selectNight')}</p>
      </div>
    );
  }
  if (!night.data) {
    return (
      <div className={s.panel} aria-busy="true">
        <Skeleton height="var(--space-8)" width="70%" />
        <Skeleton height="var(--space-16)" width="50%" />
        <Skeleton height="calc(var(--space-20) * 2)" />
      </div>
    );
  }
  const n = night.data;
  const free = n.status === 'free';
  const group = heatGroup(n.heat);

  const findAction = (): ActionDto | undefined => {
    for (const [, data] of qc.getQueriesData<ActionsResponse>({ queryKey: ['actions'] })) {
      const a = data?.items.find((x) => x.id === n.pendingActionId);
      if (a) return a;
    }
    return undefined;
  };

  const decideNight = (decision: 'approve' | 'dismiss') => {
    if (!n.pendingActionId) return;
    const a = findAction();
    if (a) decide.mutate({ action: a, decision });
    else
      void api()
        .actions[decision](n.pendingActionId)
        .then(() => qc.invalidateQueries());
  };

  const copyAndOpen = () => {
    const copied = copyText(priceForClipboard(n.suggestedPrice));
    openListing(property.listingUrl);
    decideNight('approve');
    void copied.then(() => toast({ message: t('night.copiedToast', { price: formatBRL(n.suggestedPrice, { whole: true }) }) }));
  };

  return (
    <div className={s.panel} aria-live="polite" data-testid="night-panel">
      <h2 className={s.title}>{formatNightLong(n.date)}</h2>

      {free ? (
        <>
          <div className={s.badges}>
            <span className={[s.heatBadge, s[group]].join(' ')}>
              {group === 'high' ? <Flame size={16} aria-hidden="true" /> : group === 'low' ? <TrendingDown size={16} aria-hidden="true" /> : null}
              {heatLabel(n.heat)}
            </span>
            {n.isOrphan ? (
              <span className={s.orphanBadge}>
                <Unlink size={14} aria-hidden="true" /> {t('night.orphanBadge')}
              </span>
            ) : null}
          </div>
          <p className={s.price}>
            <strong className="tabular">{formatBRL(n.suggestedPrice, { whole: true })}</strong>
            <span>{t('common.perNight')}</span>
          </p>
          <p className={s.reference}>{t('night.referencePrice', { price: formatBRL(n.currentPrice, { whole: true }) })}</p>

          <hr className={s.rule} />
          {n.headline ? <h3 className={s.headline}>{n.headline}</h3> : null}
          {n.explanation ? <p className={s.explanation}>{n.explanation}</p> : null}

          {n.factors.length > 0 ? (
            <section aria-label={t('night.factorsTitle')}>
              <ul className={s.factors}>
                {n.factors.map((f) => (
                  <li key={f.key + f.label} className={s.factor}>
                    <span className={s.factorIcon}>
                      <FactorIcon k={f.key} size={20} />
                    </span>
                    <span className={s.factorLabel}>{f.label}</span>
                    <span className={[s.weight, f.multiplier >= 1 ? s.weightUp : s.weightDown].join(' ')}>{formatWeight(f.multiplier)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {n.events.length > 0 ? (
            <section className={s.block}>
              <h4>{t('night.eventsTitle')}</h4>
              <ul className={s.simpleList}>
                {n.events.map((e) => (
                  <li key={e.id}>
                    <Flame size={16} aria-hidden="true" />
                    <span>
                      <strong>{e.name}</strong>
                      <span className={s.muted}> · {t('night.eventLine', { distance: String(e.distanceKm).replace('.', ','), size: e.size })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {n.holidays.length > 0 ? (
            <section className={s.block}>
              <h4>{t('night.holidaysTitle')}</h4>
              <ul className={s.simpleList}>
                {n.holidays.map((h) => (
                  <li key={h.name}>
                    <CalendarRange size={16} aria-hidden="true" /> {h.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className={s.limit}>
            <CircleCheck size={20} aria-hidden="true" /> {limitLine(n)}
          </p>
          <p className={s.row}>
            <BedDouble size={22} aria-hidden="true" />
            <span>
              {t('night.minStay')} <strong>{tc('common.nights', n.minStay)}</strong>
            </span>
          </p>
          {n.discountPct ? <p className={s.row}>{t('night.discount', { pct: formatPct(n.discountPct) })}</p> : null}
          {n.weather ? (
            <p className={s.row}>
              <span className={s.weatherIcon}>
                <WeatherIcon c={n.weather.condition} />
              </span>
              <span>
                {t('night.weatherLine', { condition: t(`night.weather.${n.weather.condition}`), tempMax: Math.round(n.weather.tempMax) })}
                {n.weather.precipProb >= 0.3 ? <span className={s.muted}> · {t('night.rainChance', { pct: formatPct(n.weather.precipProb) })}</span> : null}
              </span>
            </p>
          ) : null}

          <div className={s.actions}>
            <Button size="lg" block onClick={copyAndOpen}>
              <ExternalLink size={20} aria-hidden="true" /> {t('night.copyAndOpen')}
            </Button>
            <Button
              variant="outline"
              block
              disabled={!n.pendingActionId}
              onClick={() => {
                decideNight('dismiss');
                toast({ message: t('night.ignoredToast') });
              }}
            >
              {t('night.ignore')}
            </Button>
          </div>
          <p className={s.note}>
            <Info size={16} aria-hidden="true" /> {t('night.note')}
          </p>
        </>
      ) : (
        <div className={s.bookedBox}>
          <BedDouble size={28} aria-hidden="true" />
          <h3>{n.status === 'booked' ? t('night.bookedTitle') : t('night.blockedTitle')}</h3>
          <p>{n.status === 'booked' ? t('night.bookedText') : t('night.blockedText')}</p>
        </div>
      )}
    </div>
  );
}
