'use client';

import { useState } from 'react';
import { formatBRL, type MonthMetrics } from '@precisari/shared';
import { formatPct, t } from '@/i18n';
import { formatMonthShort, formatMonthYear } from '@/lib/dates';
import { Segmented } from '../ui/primitives';
import s from './history-chart.module.css';

type Metric = 'revenue' | 'occupancy';

/** Lightweight hand-rolled SVG bar chart. One measure at a time (no dual axis), hover/focus tooltip, table view. */
export function HistoryChart({ history, current }: { history: MonthMetrics[]; current: string }) {
  const [metric, setMetric] = useState<Metric>('revenue');
  const [active, setActive] = useState<number | null>(null);
  const values = history.map((m) => (metric === 'revenue' ? m.revenue : m.occupancy));
  const max = Math.max(...values, metric === 'occupancy' ? 1 : 1);
  const fmt = (v: number) => (metric === 'revenue' ? formatBRL(v, { whole: true }) : formatPct(v));
  const W = 600;
  const H = 220;
  const pad = { top: 28, bottom: 28, left: 8, right: 8 };
  const slot = (W - pad.left - pad.right) / history.length;
  const barW = Math.min(56, slot * 0.56);
  const plotH = H - pad.top - pad.bottom;
  const label = metric === 'revenue' ? t('results.chartRevenue') : t('results.chartOccupancy');

  return (
    <figure className={s.figure}>
      <div className={s.head}>
        <figcaption className={s.title}>{t('results.chartTitle')}</figcaption>
        <Segmented<Metric>
          label={t('results.chartTitle')}
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'revenue', label: t('results.chartRevenue') },
            { value: 'occupancy', label: t('results.chartOccupancy') },
          ]}
        />
      </div>
      <div className={s.plot}>
        <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={`${t('results.chartTitle')}: ${label}`}>
          <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} className={s.baseline} />
          {history.map((m, i) => {
            const v = values[i] ?? 0;
            const h = Math.max(4, (v / max) * plotH);
            const x = pad.left + slot * i + (slot - barW) / 2;
            const y = H - pad.bottom - h;
            const isCurrent = m.month === current;
            return (
              <g
                key={m.month}
                className={s.bar}
                data-current={isCurrent || undefined}
                data-active={active === i || undefined}
                tabIndex={0}
                aria-label={`${formatMonthYear(m.month)}: ${fmt(v)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <rect x={pad.left + slot * i} y={pad.top - 20} width={slot} height={plotH + 20} className={s.hit} />
                <path
                  d={`M${x},${H - pad.bottom} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + barW - 4} Q${x + barW},${y} ${x + barW},${y + 4} V${H - pad.bottom} Z`}
                  className={s.mark}
                />
                {isCurrent || active === i ? (
                  <text x={x + barW / 2} y={y - 8} textAnchor="middle" className={s.value}>
                    {fmt(v)}
                  </text>
                ) : null}
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className={s.axis}>
                  {formatMonthShort(m.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className={s.tableToggle}>
        <summary>{t('results.chartTableCaption')}</summary>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{t('results.chartMonth')}</th>
              <th scope="col">{t('results.chartRevenue')}</th>
              <th scope="col">{t('results.chartOccupancy')}</th>
            </tr>
          </thead>
          <tbody>
            {history.map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonthYear(m.month)}</th>
                <td>{formatBRL(m.revenue, { whole: true })}</td>
                <td>{formatPct(m.occupancy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
