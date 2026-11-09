'use client';

import { Building2, Plus, Settings } from 'lucide-react';
import { formatBRL } from '@precisari/shared';
import { t, tc } from '@/i18n';
import { useUser } from '@/lib/auth';
import { useSelectedProperty } from '@/lib/property-context';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { PropertyPhoto } from '@/components/app/property-selector';
import { SyncBadge, SyncButton } from '@/components/app/sync-status';
import p from '@/components/app/page.module.css';
import s from './properties.module.css';

export function PropertiesView() {
  const user = useUser();
  const { properties, isLoading } = useSelectedProperty();
  const atLimit = user.subscription.plan === 'FREE' && properties.length >= 1;

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <h1>{t('properties.title')}</h1>
          <p className={p.subtitle}>{t('properties.subtitle')}</p>
        </div>
        {atLimit ? null : (
          <ButtonLink href="/app/imoveis/novo">
            <Plus size={20} aria-hidden="true" /> {t('properties.add')}
          </ButtonLink>
        )}
      </header>
      {atLimit ? <p className={p.muted}>{t('properties.planLimit')}</p> : null}

      {isLoading ? (
        <Skeleton height="calc(var(--space-20) * 2)" />
      ) : properties.length === 0 ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title={t('properties.emptyTitle')}
          text={t('properties.emptyText')}
          action={<ButtonLink href="/app/imoveis/novo">{t('properties.add')}</ButtonLink>}
        />
      ) : (
        <ul className={s.list}>
          {properties.map((pr) => (
            <li key={pr.id} className={s.item}>
              <PropertyPhoto property={pr} size="lg" />
              <div className={s.body}>
                <div>
                  <h2 className={s.name}>{pr.name}</h2>
                  <p className={p.muted}>
                    {pr.city} · {t(`property.destination.${pr.destinationType}`)} · {tc('properties.capacity', pr.capacity)}
                  </p>
                </div>
                <p className={s.base}>{t('properties.basePrice', { price: formatBRL(pr.basePrice, { whole: true }) })}</p>
                <SyncBadge property={pr} />
                <div className={p.actionsRow}>
                  <ButtonLink href={`/app/imoveis/${pr.id}`} variant="secondary" size="sm">
                    <Settings size={16} aria-hidden="true" /> {t('properties.configure')}
                  </ButtonLink>
                  <SyncButton property={pr} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
