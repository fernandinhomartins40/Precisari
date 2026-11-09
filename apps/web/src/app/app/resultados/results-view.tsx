'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { formatBRL, type MonthMetrics } from '@precisari/shared';
import { formatNumber, formatPct, t } from '@/i18n';
import { addMonths, formatMonthYear, todayIso } from '@/lib/dates';
import { useSelectedProperty } from '@/lib/property-context';
import { useInsights } from '@/lib/queries';
import { PropertySelector } from '@/components/app/property-selector';
import { HistoryChart } from '@/components/app/history-chart';
import { IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import p from '@/components/app/page.module.css';
import s from './results.module.css';

type Key = 'occupancy' | 'adr' | 'revenue' | 'estimatedProfit';

function fmtValue(k: Key, m: MonthMetrics): string {
  return k === 'occupancy' ? formatPct(m.occupancy) : formatBRL(m[k], { whole: true });
}

function delta(k: Key, cur: MonthMetrics, ref: MonthMetrics | null): { text: string; dir: 'up' | 'down' | 'flat' } | null {
  if (!ref) return null;
  if (k === 'occupancy') {
    const pp = Math.round((cur.occupancy - ref.occupancy) * 100);
    const sign = pp > 0 ? '+' : pp < 0 ? '−' : '';
    return { text: t('results.pp', { value: `${sign}${formatNumber(Math.abs(pp))}` }), dir: pp > 0 ? 'up' : pp < 0 ? 'down' : 'flat' };
  }
  const d = cur[k] - ref[k];
  return { text: formatBRL(d, { whole: true, signed: true }), dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
}

function Delta({ d, label }: { d: ReturnType<typeof delta>; label: string }) {
  if (!d) return <span className={s.delta}>{t('results.noComparison')}</span>;
  return (
    <span className={s.delta} data-dir={d.dir}>
      {d.dir === 'up' ? <TrendingUp size={14} aria-hidden="true" /> : d.dir === 'down' ? <TrendingDown size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
      <strong>{d.text}</strong> {label}
    </span>
  );
}

export function ResultsView() {
  const { property } = useSelectedProperty();
  const currentMonth = todayIso(property?.timezone).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const q = useInsights(property?.id, month);
  const d = q.data;
  const cards: { key: Key; label: string; hero?: boolean }[] = [
    { key: 'occupancy', label: t('results.occupancy') },
    { key: 'adr', label: t('results.adr') },
    { key: 'revenue', label: t('results.revenue') },
    { key: 'estimatedProfit', label: t('results.profit'), hero: true },
  ];

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <h1>{t('results.title')}</h1>
          <p className={p.subtitle}>{t('results.subtitle', { month: formatMonthYear(month).toLowerCase() })}</p>
        </div>
        <div className={s.controls}>
          <PropertySelector />
          <div className={s.monthNav}>
            <IconButton label={t('results.prevMonth')} onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft size={20} aria-hidden="true" />
            </IconButton>
            <span className={s.monthLabel} aria-live="polite">
              {formatMonthYear(month)}
            </span>
            <IconButton label={t('results.nextMonth')} onClick={() => setMonth(addMonths(month, 1))} disabled={month >= currentMonth}>
              <ChevronRight size={20} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </header>

      {!d ? (
        <div className={s.cards}>
          {cards.map((c) => (
            <Skeleton key={c.key} height="calc(var(--space-20) * 1.6)" />
          ))}
        </div>
      ) : (
        <>
          <ul className={s.cards}>
            {cards.map((c) => (
              <li key={c.key} className={[s.card, c.hero ? s.hero : ''].join(' ')}>
                <span className={s.cardLabel}>{c.label}</span>
                <strong className={s.cardValue}>{fmtValue(c.key, d.current)}</strong>
                {c.key === 'occupancy' ? (
                  <span className={s.cardNote}>{t('results.nightsBooked', { booked: d.current.nightsBooked, available: d.current.nightsAvailable })}</span>
                ) : null}
                <Delta d={delta(c.key, d.current, d.previous)} label={t('results.vsPrevious')} />
                <Delta d={delta(c.key, d.current, d.baseline)} label={t('results.vsBaseline')} />
              </li>
            ))}
          </ul>

          <section className={s.callout} aria-labelledby="if-approved">
            <span className={s.calloutIcon} aria-hidden="true">
              <Sparkles size={26} />
            </span>
            <div className={s.calloutText}>
              <h2 id="if-approved">{t('results.ifApprovedTitle')}</h2>
              <p>{t('results.ifApprovedText')}</p>
              <p className={s.rate}>{t('results.approvalRate', { pct: formatPct(d.approvalRate) })}</p>
            </div>
            <strong className={s.calloutValue}>{formatBRL(d.ifApprovedAllGain, { whole: true, signed: true })}</strong>
          </section>

          <section className={p.section}>
            <HistoryChart history={d.history} current={month} />
            <p className={[p.muted, p.small].join(' ')}>{t('results.revenueNote')}</p>
          </section>
        </>
      )}
    </div>
  );
}
