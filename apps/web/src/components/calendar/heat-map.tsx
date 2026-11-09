'use client';

import { useEffect, useMemo, useRef } from 'react';
import { BedDouble, Flame, Lock, TrendingDown, Unlink } from 'lucide-react';
import { formatBRL, type NightDto } from '@precisari/shared';
import { messages, t } from '@/i18n';
import { buildMonthGrid, moveByKey, weekdayOrder } from '@/lib/calendar-grid';
import { formatMonthYear, formatNightLong } from '@/lib/dates';
import { heatGroup, heatLabel, heatLevel } from '@/lib/heat';
import s from './heat-map.module.css';

interface Props {
  month: string;
  nights: Map<string, NightDto>;
  today: string;
  rangeEnd: string;
  selected?: string | null;
  pendingDates?: Set<string>;
  onSelect?: (date: string) => void;
  /** Called when keyboard navigation leaves the visible month. */
  onNavigateOutside?: (date: string) => void;
  compact?: boolean;
  /** Show the month title above the grid (compact/multi-month mode). */
  showTitle?: boolean;
}

function cellLabel(iso: string, n: NightDto | undefined, pending: boolean): string {
  const date = formatNightLong(iso);
  if (!n) return date;
  if (n.status === 'booked') return t('calendar.cellLabelBooked', { date });
  if (n.status === 'blocked') return t('calendar.cellLabelBlocked', { date });
  const parts = [t('calendar.cellLabel', { date, price: formatBRL(n.suggestedPrice, { whole: true }), heat: heatLabel(n.heat).toLowerCase() })];
  if (n.isOrphan) parts.push(t('calendar.cellOrphan'));
  if (pending) parts.push(t('calendar.cellPending'));
  return parts.join(', ');
}

/** One month of the heat-map calendar. Each night shows date + price + a text/icon state (never color only). */
export function HeatMapMonth({ month, nights, today, rangeEnd, selected, pendingDates, onSelect, onNavigateOutside, compact, showTitle }: Props) {
  const weeks = useMemo(() => buildMonthGrid(month, 1), [month]);
  const order = weekdayOrder(1);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const interactive = Boolean(onSelect);
  const firstFocusable = useMemo(() => {
    const all = weeks.flat().filter((d): d is string => Boolean(d) && (d as string) >= today && (d as string) <= rangeEnd);
    return selected && all.includes(selected) ? selected : all[0];
  }, [weeks, selected, today, rangeEnd]);

  const focusDate = useRef<string | null>(null);
  useEffect(() => {
    if (focusDate.current) {
      refs.current.get(focusDate.current)?.focus();
      focusDate.current = null;
    }
  });

  const onKeyDown = (e: React.KeyboardEvent, iso: string) => {
    const next = moveByKey(iso, e.key);
    if (!next) return;
    e.preventDefault();
    if (next < today || next > rangeEnd) return;
    focusDate.current = next;
    if (next.slice(0, 7) !== month) onNavigateOutside?.(next);
    onSelect?.(next);
  };

  return (
    <div className={[s.month, compact ? s.compact : ''].join(' ')}>
      {showTitle ? <h3 className={s.monthTitle}>{formatMonthYear(month)}</h3> : null}
      <table className={s.grid} aria-label={t('calendar.gridLabel', { month: formatMonthYear(month) })}>
        <thead>
          <tr>
            {order.map((d) => (
              <th key={d} scope="col" abbr={messages.weekdays.title[d]}>
                {messages.weekdays.upper[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((iso, di) => {
                if (!iso) return <td key={`e${di}`} className={s.empty} />;
                const n = nights.get(iso);
                const inRange = iso >= today && iso <= rangeEnd;
                const day = Number(iso.slice(8));
                if (!inRange || !n) {
                  return (
                    <td key={iso}>
                      <span className={s.cell} data-state="off">
                        <span className={s.day}>{day}</span>
                        <span className="visually-hidden">{iso < today ? t('calendar.past') : t('calendar.outOfRange')}</span>
                      </span>
                    </td>
                  );
                }
                const pending = pendingDates?.has(iso) ?? false;
                const state = n.status === 'free' ? 'free' : n.status;
                const group = heatGroup(n.heat);
                const content = (
                  <>
                    <span className={s.dayRow}>
                      <span className={s.day}>{day}</span>
                      {state === 'free' && group === 'high' ? <Flame className={s.stateIcon} size={14} aria-hidden="true" /> : null}
                      {state === 'free' && group === 'low' ? <TrendingDown className={s.stateIcon} size={14} aria-hidden="true" /> : null}
                      {n.isOrphan && state === 'free' ? (
                        <span className={s.orphan}>
                          <Unlink size={11} aria-hidden="true" />
                          <span className={s.orphanText}>{t('calendar.orphan')}</span>
                        </span>
                      ) : null}
                      {pending ? <span className={s.pendingDot} aria-hidden="true" /> : null}
                    </span>
                    {state === 'booked' ? (
                      <span className={s.booked}>
                        <BedDouble size={14} aria-hidden="true" />
                        <span className={s.bookedText}>{t('calendar.booked')}</span>
                      </span>
                    ) : state === 'blocked' ? (
                      <span className={s.booked}>
                        <Lock size={14} aria-hidden="true" />
                        <span className={s.bookedText}>{t('calendar.blocked')}</span>
                      </span>
                    ) : (
                      <span className={s.price}>{formatBRL(n.suggestedPrice, { whole: true })}</span>
                    )}
                  </>
                );
                return (
                  <td key={iso}>
                    {interactive ? (
                      <button
                        ref={(el) => {
                          if (el) refs.current.set(iso, el);
                          else refs.current.delete(iso);
                        }}
                        type="button"
                        className={s.cell}
                        data-state={state}
                        data-heat={state === 'free' ? heatLevel(n.heat) : undefined}
                        aria-pressed={selected === iso}
                        aria-label={cellLabel(iso, n, pending)}
                        tabIndex={iso === firstFocusable ? 0 : -1}
                        onClick={() => onSelect?.(iso)}
                        onKeyDown={(e) => onKeyDown(e, iso)}
                        data-date={iso}
                      >
                        {content}
                      </button>
                    ) : (
                      <span className={s.cell} data-state={state} data-heat={state === 'free' ? heatLevel(n.heat) : undefined} aria-label={cellLabel(iso, n, pending)} role="img">
                        {content}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeatLegend({ examples }: { examples: { low: number | null; mid: number | null; high: number | null } }) {
  const fmt = (v: number | null) => (v ? formatBRL(v, { whole: true }) : '—');
  return (
    <ul className={s.legend} aria-label={t('calendar.legendLabel')}>
      <li>
        <span className={s.swatch} data-heat="0" aria-hidden="true">
          <TrendingDown size={12} />
        </span>
        {t('calendar.legendLow', { price: fmt(examples.low) })}
      </li>
      <li>
        <span className={s.swatch} data-heat="2" aria-hidden="true" />
        {t('calendar.legendMid', { price: fmt(examples.mid) })}
      </li>
      <li>
        <span className={s.swatch} data-heat="4" aria-hidden="true">
          <Flame size={12} />
        </span>
        {t('calendar.legendHigh', { price: fmt(examples.high) })}
      </li>
      <li>
        <span className={s.swatch} data-state="booked" aria-hidden="true">
          <BedDouble size={12} />
        </span>
        {t('calendar.legendBooked')}
      </li>
      <li>
        <span className={s.swatch} data-state="orphan" aria-hidden="true">
          <Unlink size={12} />
        </span>
        {t('calendar.legendOrphan')}
      </li>
      <li>
        <span className={s.swatch} data-state="selected" aria-hidden="true" />
        {t('calendar.legendSelected')}
      </li>
    </ul>
  );
}
