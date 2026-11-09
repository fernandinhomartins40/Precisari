'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { ArrowRight, Check, Flame, ShieldAlert, ShieldCheck, TrendingDown, Unlink, BedDouble } from 'lucide-react';
import { motion } from '@precisari/design-tokens';
import { formatBRL, type ActionDto } from '@precisari/shared';
import { t } from '@/i18n';
import { formatNightLong, formatNightShort } from '@/lib/dates';
import { Button } from '../ui/button';
import { FactorIcon } from './factor-icon';
import s from './action-card.module.css';

export type Leaving = 'approve' | 'dismiss' | null;

function badgeFor(a: ActionDto): { label: string; icon: React.ReactNode; hot: boolean } {
  if (a.type === 'ORPHAN') return { label: t('action.badge.ORPHAN'), icon: <Unlink size={14} aria-hidden="true" />, hot: false };
  if (a.type === 'ADJACENT') return { label: t('action.badge.ADJACENT'), icon: <BedDouble size={14} aria-hidden="true" />, hot: false };
  if (a.type === 'MIN_STAY') return { label: t('action.badge.MIN_STAY'), icon: <BedDouble size={14} aria-hidden="true" />, hot: false };
  return a.toValue >= a.fromValue
    ? { label: t('action.badge.PRICE_UP'), icon: <Flame size={14} aria-hidden="true" />, hot: true }
    : { label: t('action.badge.PRICE_DOWN'), icon: <TrendingDown size={14} aria-hidden="true" />, hot: false };
}

export function formatActionValue(a: ActionDto, v: number): string {
  return a.type === 'MIN_STAY' ? String(v) : formatBRL(v, { whole: true });
}

interface Props {
  action: ActionDto;
  leaving: Leaving;
  showProperty: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}

/** Swipeable action card: drag right approves, left dismisses (threshold from motion tokens). */
export function ActionCard({ action: a, leaving, showProperty, onApprove, onDismiss }: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; id: number } | null>(null);
  const badge = badgeFor(a);
  const isMinStay = a.type === 'MIN_STAY';
  const threshold = motion.swipe.thresholdPx;

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, a') || leaving) return;
    start.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDx(e.clientX - start.current.x);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    if (dx > threshold) onApprove();
    else if (dx < -threshold) onDismiss();
    setDx(0);
  };

  const dragging = dx !== 0;
  const rotation = Math.max(-1, Math.min(1, dx / (threshold * 2))) * motion.swipe.rotationDeg;
  const intent = dx > threshold / 2 ? 'approve' : dx < -threshold / 2 ? 'dismiss' : null;

  return (
    <article
      className={s.card}
      data-leaving={leaving ?? undefined}
      data-dragging={dragging || undefined}
      data-intent={intent ?? undefined}
      style={dragging ? { transform: `translateX(${dx}px) rotate(${rotation}deg)` } : undefined}
      aria-label={t('action.cardLabel', { date: formatNightLong(a.date) })}
      aria-describedby={`swipe-hint-${a.id}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="action-card"
    >
      <span id={`swipe-hint-${a.id}`} className="visually-hidden">
        {t('action.swipeHint')}
      </span>
      <div className={s.top}>
        <span className={s.date}>{formatNightShort(a.date)}</span>
        <span className={[s.badge, badge.hot ? s.badgeHot : ''].join(' ')}>
          {badge.icon}
          {badge.label}
        </span>
      </div>
      {showProperty ? <p className={s.property}>{a.propertyName}</p> : null}
      <h3 className={s.headline}>{a.headline}</h3>
      <p className={s.explanation}>{a.explanation}</p>

      <p className={s.prices}>
        <span className="visually-hidden">
          {isMinStay
            ? t('action.minStayChange', { from: a.fromValue, to: a.toValue })
            : t('action.priceChange', { from: formatActionValue(a, a.fromValue), to: formatActionValue(a, a.toValue) })}
        </span>
        <span className={s.from} aria-hidden="true">
          {formatActionValue(a, a.fromValue)}
        </span>
        <ArrowRight className={s.arrow} size={26} aria-hidden="true" />
        <span className={s.to} aria-hidden="true">
          {formatActionValue(a, a.toValue)}
        </span>
        <span className={s.unit} aria-hidden="true">
          {isMinStay ? t('action.nightsUnit') : t('common.perNight')}
        </span>
      </p>

      {a.factors.length > 0 ? (
        <ul className={s.chips}>
          {a.factors.slice(0, 3).map((f) => (
            <li key={f.key + f.label} className={s.chip}>
              <FactorIcon k={f.key} size={16} />
              {f.label}
            </li>
          ))}
        </ul>
      ) : null}

      <p className={[s.limits, a.withinLimits ? '' : s.limitsAdjusted].join(' ')}>
        {a.withinLimits ? <ShieldCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />}
        {a.withinLimits ? t('action.withinLimits') : t('action.outsideLimits')}
      </p>

      <div className={s.buttons}>
        <Button size="lg" block onClick={onApprove} disabled={Boolean(leaving)}>
          {isMinStay ? t('action.approveMinStay') : t('action.approve')}
        </Button>
        <Button variant="secondary" block onClick={onDismiss} disabled={Boolean(leaving)}>
          {t('action.dismiss')}
        </Button>
      </div>

      {leaving === 'approve' ? (
        <div className={s.approvedOverlay} aria-hidden="true">
          <span className={s.approvedCheck}>
            <Check size={28} />
          </span>
          <span className={s.approvedPrice}>{formatActionValue(a, a.toValue)}</span>
          <span className={s.approvedLabel}>{t('action.approved')}</span>
        </div>
      ) : null}
    </article>
  );
}
