'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { formatBRL, type NightDto } from '@precisari/shared';
import { t, tc } from '@/i18n';
import { useUser } from '@/lib/auth';
import { monthsInRange } from '@/lib/calendar-grid';
import { addDays, formatMonthYear, todayIso } from '@/lib/dates';
import { legendExamples } from '@/lib/heat';
import { useSelectedProperty } from '@/lib/property-context';
import { useNights, usePendingActions } from '@/lib/queries';
import { buttonClass } from '@/components/ui/button';
import { Segmented, Skeleton } from '@/components/ui/primitives';
import { HeatLegend, HeatMapMonth } from '@/components/calendar/heat-map';
import { NightPanel } from '@/components/calendar/night-panel';
import { PropertySelector } from '@/components/app/property-selector';
import s from './calendar.module.css';

type Range = '90' | '180';

export function CalendarView() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const { property, isLoading } = useSelectedProperty();
  const today = todayIso(property?.timezone);
  const isFree = user.subscription.plan === 'FREE';
  const [range, setRange] = useState<Range>('90');
  const rangeEnd = addDays(today, Number(range) - 1);
  const months = useMemo(() => monthsInRange(today, rangeEnd), [today, rangeEnd]);
  const [month, setMonth] = useState(() => (params.get('noite') ?? today).slice(0, 7));
  const [selected, setSelected] = useState<string | null>(params.get('noite'));

  const nightsQ = useNights(property?.id, today, rangeEnd);
  const actions = usePendingActions(property?.id);

  const nights = useMemo(() => new Map<string, NightDto>((nightsQ.data?.nights ?? []).map((n) => [n.date, n])), [nightsQ.data]);
  const pendingDates = useMemo(() => new Set((actions.data?.items ?? []).map((a) => a.date)), [actions.data]);
  const visibleNights = useMemo(() => (nightsQ.data?.nights ?? []).filter((n) => n.date.startsWith(month)), [nightsQ.data, month]);

  // Default selection: first pending suggestion, else today.
  useEffect(() => {
    if (selected || !actions.data) return;
    const first = [...actions.data.items].sort((a, b) => a.date.localeCompare(b.date))[0];
    const d = first?.date ?? today;
    setSelected(d);
    setMonth(d.slice(0, 7));
  }, [actions.data, selected, today]);

  useEffect(() => {
    if (!months.includes(month)) setMonth(months[months.length - 1] ?? today.slice(0, 7));
  }, [months, month, today]);

  const select = (d: string) => {
    setSelected(d);
    router.replace(`/app/calendario?noite=${d}`, { scroll: false });
  };

  const idx = months.indexOf(month);
  const count = actions.data?.items.length ?? 0;
  const gain = actions.data?.totalEstimatedGain ?? 0;

  return (
    <div className={s.page}>
      <div className={s.main}>
        <h1 className={s.title}>
          {t('calendar.titlePrefix')}{' '}
          <span className={s.underline}>
            {t('calendar.titleHighlight')}
            <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
              <path d="M2 9 C 30 2, 80 2, 118 8" />
            </svg>
          </span>
        </h1>

        <div className={s.toolbar}>
          <PropertySelector />
          <Segmented<Range>
            label={t('calendar.range')}
            value={range}
            onChange={setRange}
            options={[
              { value: '90', label: t('calendar.range90') },
              { value: '180', label: isFree ? t('calendar.range180Locked') : t('calendar.range180'), disabled: isFree },
            ]}
          />
        </div>

        <section className={s.band} aria-label={t('calendar.summaryGain')}>
          <span className={s.bandIcon} aria-hidden="true">
            <CalendarDays size={30} />
            <Sparkles size={16} className={s.spark} />
          </span>
          <strong className={s.bandCount}>{count > 0 ? tc('calendar.summaryCount', count) : t('calendar.summaryNone')}</strong>
          {count > 0 ? (
            <>
              <span className={s.bandDivider} aria-hidden="true" />
              <span className={s.bandGain}>
                <strong className="tabular">{formatBRL(gain, { whole: true, signed: true })}</strong>
                <span>{t('calendar.summaryGain')}</span>
              </span>
              <Link href="/app" className={buttonClass('inverse', 'md', false, s.bandCta)}>
                {t('calendar.summaryCta')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </>
          ) : null}
        </section>

        <div className={s.monthNav}>
          <button type="button" className={s.navBtn} onClick={() => setMonth(months[idx - 1] ?? month)} disabled={idx <= 0} aria-label={t('calendar.prevMonth')}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <h2 className={s.monthTitle} aria-live="polite">
            {formatMonthYear(month)}
          </h2>
          <button
            type="button"
            className={s.navBtn}
            onClick={() => setMonth(months[idx + 1] ?? month)}
            disabled={idx >= months.length - 1}
            aria-label={t('calendar.nextMonth')}
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonClass('outline', 'md', false, s.todayBtn)}
            onClick={() => {
              setMonth(today.slice(0, 7));
              select(today);
            }}
          >
            {t('calendar.today')}
          </button>
        </div>

        {isLoading || nightsQ.isPending ? (
          <Skeleton height="calc(var(--space-20) * 5)" />
        ) : (
          <HeatMapMonth
            month={month}
            nights={nights}
            today={today}
            rangeEnd={rangeEnd}
            selected={selected}
            pendingDates={pendingDates}
            onSelect={select}
            onNavigateOutside={(d) => setMonth(d.slice(0, 7))}
          />
        )}
        <HeatLegend examples={legendExamples(visibleNights.length ? visibleNights : (nightsQ.data?.nights ?? []))} />
      </div>

      <aside className={s.panel} aria-label={t('calendar.selectNight')}>
        {property ? <NightPanel property={property} date={selected} /> : null}
      </aside>
    </div>
  );
}
