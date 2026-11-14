'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronRight, PartyPopper, Plus, Keyboard, BedDouble } from 'lucide-react';
import { formatBRL, type ActionDto } from '@precisari/shared';
import { messages, t, tc } from '@/i18n';
import { useUser } from '@/lib/auth';
import { useSelectedProperty } from '@/lib/property-context';
import { useActionDecision, useNights, usePendingActions } from '@/lib/queries';
import { addDays, todayIso, weekdayOf } from '@/lib/dates';
import { copyText, openListing, prefersReducedMotion, priceForClipboard } from '@/lib/clipboard';
import { heatGroup } from '@/lib/heat';
import { useToast } from '@/components/ui/toast';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { ActionCard, formatActionValue, type Leaving } from '@/components/app/action-card';
import { PropertyPhoto } from '@/components/app/property-selector';
import s from './today.module.css';

function greeting(name: string): string {
  const h = new Date().getHours();
  const key = h < 12 ? 'today.greetingMorning' : h < 18 ? 'today.greetingAfternoon' : 'today.greetingEvening';
  return t(key, { name });
}

export function TodayView() {
  const user = useUser();
  const toast = useToast();
  const { properties, property, isLoading: propsLoading } = useSelectedProperty();
  const actions = usePendingActions();
  const decide = useActionDecision();
  const [leaving, setLeaving] = useState<{ id: string; dir: Exclude<Leaving, null> } | null>(null);
  const busy = useRef(false);

  const today = todayIso(property?.timezone);
  const week = useNights(property?.id, today, addDays(today, 6));

  const items = actions.data?.items ?? [];
  const current = items[0];
  const total = actions.data?.totalEstimatedGain ?? 0;

  const finish = useCallback(
    (a: ActionDto, dir: 'approve' | 'dismiss', copied: boolean) => {
      decide.mutate(
        { action: a, decision: dir },
        {
          onSettled: () => {
            setLeaving(null);
            busy.current = false;
          },
        },
      );
      const price = formatActionValue(a, a.toValue);
      toast({
        message: dir === 'dismiss' ? t('today.dismissedToast') : copied ? t('today.approvedToast', { price }) : t('today.approvedToastNoCopy', { price }),
        actionLabel: t('common.undo'),
        onAction: () => decide.mutate({ action: a, decision: 'revert' }, { onSuccess: () => toast({ message: t('today.revertedToast') }) }),
      });
    },
    [decide, toast],
  );

  const approve = useCallback(
    (a: ActionDto) => {
      if (busy.current) return;
      busy.current = true;
      const isPrice = a.type !== 'MIN_STAY';
      // Copy first (needs the user gesture), then open the listing in a new tab.
      const copied = isPrice ? copyText(priceForClipboard(a.toValue)) : Promise.resolve(false);
      if (isPrice) openListing(a.listingUrl);
      setLeaving({ id: a.id, dir: 'approve' });
      const delay = prefersReducedMotion() ? 50 : 1100;
      setTimeout(() => void copied.then((ok) => finish(a, 'approve', ok)), delay);
    },
    [finish],
  );

  const dismiss = useCallback(
    (a: ActionDto) => {
      if (busy.current) return;
      busy.current = true;
      setLeaving({ id: a.id, dir: 'dismiss' });
      setTimeout(() => finish(a, 'dismiss', false), prefersReducedMotion() ? 50 : 380);
    },
    [finish],
  );

  // Keyboard: → approve, ← dismiss (when focus is not in a form control).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [role="radiogroup"], [role="menu"], dialog')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        approve(current);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dismiss(current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, approve, dismiss]);

  const name = user.name ?? t('today.greetingFallbackName');

  if (!propsLoading && properties.length === 0) {
    return (
      <EmptyState
        icon={<Plus size={28} />}
        title={t('today.noPropertyTitle')}
        text={t('today.noPropertyText')}
        action={<ButtonLink href="/app/imoveis/novo">{t('today.noPropertyCta')}</ButtonLink>}
      />
    );
  }

  return (
    <div className={s.page}>
      <div className={s.mainCol}>
        <header className={s.greeting}>
          <h1>{greeting(name)}</h1>
          <p>{items.length > 0 ? t('today.subtitlePending') : t('today.subtitleDone')}</p>
        </header>

        <section className={s.summary} aria-labelledby="potential-title">
          <h2 id="potential-title" className={s.summaryTitle}>
            {t('today.potentialTitle')}
          </h2>
          {actions.isPending ? (
            <Skeleton height="var(--space-16)" width="60%" className={s.summarySkeleton} />
          ) : (
            <p className={s.summaryValue} data-testid="potential-gain">
              {formatBRL(total, { whole: true, signed: true })}
            </p>
          )}
          <p className={s.summaryCount}>{tc('today.potentialCount', items.length)}</p>
          <p className={s.summaryNote}>{t('today.potentialNote')}</p>
        </section>

        <section aria-labelledby="stack-title">
          <div className={s.stackHead}>
            <h2 id="stack-title">{t('today.stackTitle')}</h2>
            {items.length > 0 ? <span className={s.position}>{t('today.position', { current: 1, total: items.length })}</span> : null}
          </div>
          {actions.isPending ? (
            <Skeleton height="calc(var(--space-20) * 5)" />
          ) : current ? (
            <>
              <div className={s.stack}>
                {items.slice(1, 3).map((a, i) => (
                  <div key={a.id} className={s.behind} data-depth={i + 1} aria-hidden="true" />
                ))}
                <ActionCard
                  key={current.id}
                  action={current}
                  leaving={leaving?.id === current.id ? leaving.dir : null}
                  showProperty={properties.length > 1}
                  onApprove={() => approve(current)}
                  onDismiss={() => dismiss(current)}
                />
              </div>
              <div className={s.dots} aria-hidden="true">
                {items.slice(0, 6).map((a, i) => (
                  <span key={a.id} data-active={i === 0 || undefined} />
                ))}
              </div>
              <p className={s.hint}>
                <Keyboard size={16} aria-hidden="true" /> {t('today.keyboardHint')}
              </p>
            </>
          ) : (
            <div className={s.empty}>
              <EmptyState
                icon={<PartyPopper size={28} />}
                title={t('today.emptyTitle')}
                text={t('today.emptyText')}
                action={
                  <ButtonLink href="/app/calendario" variant="outline">
                    <CalendarDays size={18} aria-hidden="true" /> {t('today.emptyCta')}
                  </ButtonLink>
                }
              />
            </div>
          )}
        </section>
      </div>

      <aside className={s.sideCol}>
        {property ? (
          <Link href={`/app/imoveis/${property.id}`} className={s.propertyCard}>
            <PropertyPhoto property={property} size="md" />
            <span className={s.propertyText}>
              <strong>{property.name}</strong>
              <span>{property.city}</span>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
          </Link>
        ) : (
          <Skeleton height="var(--space-20)" />
        )}

        <section aria-labelledby="week-title" className={s.week}>
          <h2 id="week-title">{t('today.weekTitle')}</h2>
          {week.data ? (
            <ol className={s.weekList}>
              {week.data.nights.map((n) => {
                const wd = weekdayOf(n.date);
                const booked = n.status !== 'free';
                const price = formatBRL(n.suggestedPrice, { whole: true });
                return (
                  <li key={n.date} className={s.weekDay} data-heat={booked ? undefined : heatGroup(n.heat)} data-booked={booked || undefined}>
                    <Link href={`/app/calendario?noite=${n.date}`} aria-label={t('today.weekDay', { weekday: messages.weekdays.title[wd] ?? '', price: booked ? t('today.weekBooked') : price })}>
                      <span className={s.weekName}>{messages.weekdays.upper[wd]}</span>
                      {booked ? (
                        <span className={s.weekBooked}>
                          <BedDouble size={16} aria-hidden="true" />
                          <span className="visually-hidden">{t('today.weekBooked')}</span>
                        </span>
                      ) : (
                        <span className={s.weekPrice}>{price}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Skeleton height="var(--space-20)" />
          )}
        </section>
      </aside>
    </div>
  );
}
