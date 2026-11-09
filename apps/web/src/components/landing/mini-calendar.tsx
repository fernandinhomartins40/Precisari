'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBRL } from '@precisari/shared';
import { messages, t } from '@/i18n';
import { buildMonthGrid } from '@/lib/calendar-grid';
import { addMonths, formatMonthShort, formatNightLong, weekdayOf } from '@/lib/dates';
import s from './landing.module.css';

/** Illustrative prices by weekday (Sun…Sat), in cents. */
const SAMPLE = [21900, 21900, 21900, 22900, 23900, 29900, 34900] as const;
const FROM = 24900;

function samplePrice(iso: string): number {
  const wd = weekdayOf(iso);
  const day = Number(iso.slice(8, 10));
  const base = SAMPLE[wd] ?? FROM;
  return wd === 6 && day > 14 ? 32900 : base;
}

function heatFor(price: number): 0 | 1 | 2 | 3 | 4 {
  if (price >= 34900) return 4;
  if (price >= 29900) return 3;
  if (price >= 23900) return 1;
  return 0;
}

function firstSaturday(month: string): string {
  for (let d = 1; d <= 7; d++) {
    const iso = `${month}-0${d}`;
    if (weekdayOf(iso) === 6) return iso;
  }
  return `${month}-01`;
}

/** Real (interactive) mini calendar used in the landing hero. Shows the first 3 weeks of a month. */
export function MiniCalendar({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(() => firstSaturday(today.slice(0, 7)));
  const weeks = useMemo(() => buildMonthGrid(month, 0).slice(0, 3), [month]);
  const price = samplePrice(selected);
  const wd = weekdayOf(selected);
  const headline =
    wd === 6 ? t('landing.hotCard.saturday') : wd === 5 ? t('landing.hotCard.friday') : wd === 0 ? t('landing.hotCard.sunday') : t('landing.hotCard.weekday');
  const chip = wd === 6 ? t('landing.hotCard.chipEvent') : wd === 5 || wd === 0 ? t('landing.hotCard.chipWeekend') : t('landing.hotCard.chipCalm');

  const changeMonth = (n: number) => {
    const m = addMonths(month, n);
    setMonth(m);
    setSelected(firstSaturday(m));
  };

  return (
    <div className={s.miniWrap}>
      <div className={s.miniCard} role="group" aria-label={t('landing.miniCalendar.ariaLabel')}>
        <div className={s.miniHead}>
          <CalendarDays className={s.miniIcon} size={26} aria-hidden="true" />
          <div className={s.miniTitles}>
            <strong>{t('landing.miniCalendar.title')}</strong>
            <span>{t('landing.miniCalendar.subtitle')}</span>
          </div>
          <div className={s.miniMonth}>
            <button type="button" onClick={() => changeMonth(-1)} aria-label={t('landing.miniCalendar.prevMonth')}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span aria-live="polite">{formatMonthShort(month)}</span>
            <button type="button" onClick={() => changeMonth(1)} aria-label={t('landing.miniCalendar.nextMonth')}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={s.miniGrid}>
          <div className={s.miniRow}>
            {messages.weekdays.short.map((w) => (
              <span key={w} aria-hidden="true" className={s.miniWeekday}>
                {w}
              </span>
            ))}
          </div>
          {weeks.map((week, i) => (
            <div className={s.miniRow} key={i}>
              {week.map((iso, j) =>
                iso ? (
                  <button
                    key={iso}
                    type="button"
                   
                    className={s.miniCell}
                    data-heat={heatFor(samplePrice(iso))}
                    aria-pressed={iso === selected}
                    aria-label={t('landing.miniCalendar.dayLabel', { date: formatNightLong(iso), price: formatBRL(samplePrice(iso), { whole: true }) })}
                    onClick={() => setSelected(iso)}
                  >
                    <span className={s.miniDay}>{Number(iso.slice(8))}</span>
                    <span className={s.miniPrice}>{formatBRL(samplePrice(iso), { whole: true })}</span>
                  </button>
                ) : (
                  <span key={`e${j}`} className={s.miniEmpty} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={s.hotCard} aria-live="polite">
        <span className={s.hotIcon} aria-hidden="true">
          {wd === 6 ? <Flame size={20} /> : <CalendarDays size={20} />}
        </span>
        <div className={s.hotText}>
          <strong>{headline}</strong>
          <span aria-label={t('landing.hotCard.priceChangeLabel', { from: formatBRL(FROM, { whole: true }), to: formatBRL(price, { whole: true }) })}>
            {formatBRL(FROM, { whole: true })} → <em>{formatBRL(price, { whole: true })}</em>
          </span>
        </div>
        <span className={s.hotChip}>{chip}</span>
      </div>
    </div>
  );
}
