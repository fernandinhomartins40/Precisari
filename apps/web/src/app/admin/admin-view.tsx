'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CircleCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  BrazilState,
  EventBody,
  EventSize,
  HolidayBody,
  HolidayKind,
  HolidayScope,
  SchoolVacationBody,
  type EventDto,
  type HolidayDto,
  type SchoolVacationDto,
} from '@precisari/shared';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { formatAgo, formatDateBR } from '@/lib/dates';
import { ButtonLink, Button } from '@/components/ui/button';
import { Badge, EmptyState, Logo, Skeleton, ThemeToggle } from '@/components/ui/primitives';
import { CrudSection } from './crud-section';
import s from './admin.module.css';

type Tab = 'events' | 'holidays' | 'vacations' | 'health';
const TABS: Tab[] = ['events', 'holidays', 'vacations', 'health'];
const states = BrazilState.options.map((v) => ({ value: v, label: v }));

function Health() {
  const q = useQuery({ queryKey: ['admin', 'health'], queryFn: () => api().admin.health() });
  if (!q.data) return <Skeleton height="calc(var(--space-20) * 3)" />;
  const h = q.data;
  return (
    <div className={s.health}>
      <div className={s.healthTop}>
        <div className={s.kpi}>
          <span>{t('admin.health.brokenCalendars')}</span>
          <strong>{h.brokenCalendars}</strong>
          <small>{t('admin.health.brokenCalendarsText')}</small>
        </div>
        <Button variant="outline" onClick={() => void q.refetch()} loading={q.isFetching}>
          <RefreshCw size={16} aria-hidden="true" /> {t('admin.health.refresh')}
        </Button>
      </div>
      <section aria-labelledby="jobs">
        <h2 id="jobs" className={s.h2}>
          {t('admin.health.jobsTitle')}
        </h2>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('admin.health.job')}</th>
                <th scope="col">{t('admin.health.waiting')}</th>
                <th scope="col">{t('admin.health.active')}</th>
                <th scope="col">{t('admin.health.failed')}</th>
                <th scope="col">{t('admin.health.completed')}</th>
                <th scope="col">{t('admin.health.lastFinished')}</th>
              </tr>
            </thead>
            <tbody>
              {h.jobs.map((j) => (
                <tr key={j.name}>
                  <th scope="row">
                    <code>{j.name}</code>
                  </th>
                  <td>{j.waiting}</td>
                  <td>{j.active}</td>
                  <td>
                    {j.failed > 0 ? (
                      <Badge tone="danger">
                        <AlertTriangle aria-hidden="true" /> {j.failed}
                      </Badge>
                    ) : (
                      j.failed
                    )}
                  </td>
                  <td>{j.completed}</td>
                  <td>{formatAgo(j.lastFinishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="integrations">
        <h2 id="integrations" className={s.h2}>
          {t('admin.health.integrationsTitle')}
        </h2>
        <ul className={s.integrations}>
          {h.integrations.map((i) => (
            <li key={i.name}>
              <div>
                <strong>{i.name}</strong>
                <span className={s.muted}> · {i.provider}</span>
                {i.detail ? <p className={s.muted}>{i.detail}</p> : null}
              </div>
              {i.ok ? (
                <Badge tone="positive">
                  <CircleCheck aria-hidden="true" /> {t('admin.health.ok')}
                </Badge>
              ) : (
                <Badge tone="danger">
                  <AlertTriangle aria-hidden="true" /> {t('admin.health.fail')}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function AdminView() {
  const user = useUser();
  const [tab, setTab] = useState<Tab>('events');

  if (user.role !== 'ADMIN') {
    return (
      <main id="conteudo" className={s.forbidden}>
        <EmptyState
          icon={<ShieldAlert size={28} />}
          title={t('admin.forbiddenTitle')}
          text={t('admin.forbiddenText')}
          action={<ButtonLink href="/app">{t('admin.backToApp')}</ButtonLink>}
        />
      </main>
    );
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <Logo href="/app" width={140} />
        <h1 className={s.title}>{t('admin.title')}</h1>
        <div className={s.headerActions}>
          <ThemeToggle />
          <ButtonLink href="/app" variant="ghost" size="sm">
            <ArrowLeft size={16} aria-hidden="true" /> {t('admin.backToApp')}
          </ButtonLink>
        </div>
      </header>
      <main id="conteudo" className={s.main}>
        <div role="tablist" aria-label={t('admin.tabsLabel')} className={s.tabs}>
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              tabIndex={tab === k ? 0 : -1}
              className={s.tab}
              onClick={() => setTab(k)}
              onKeyDown={(e) => {
                const i = TABS.indexOf(k);
                if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length] ?? k);
                if (e.key === 'ArrowLeft') setTab(TABS[(i - 1 + TABS.length) % TABS.length] ?? k);
              }}
            >
              {t(`admin.tabs.${k}`)}
            </button>
          ))}
        </div>
        <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={s.panel}>
          {tab === 'events' ? (
            <CrudSection<EventDto, ReturnType<typeof EventBody.parse>>
              queryKey="events"
              list={() => api().admin.events.list()}
              create={(b) => api().admin.events.create(b)}
              update={(id, b) => api().admin.events.update(id, b)}
              remove={(id) => api().admin.events.delete(id)}
              schema={EventBody}
              rowName={(r) => r.name}
              titleNew={t('admin.events.formTitleNew')}
              titleEdit={t('admin.events.formTitleEdit')}
              columns={[
                { label: t('admin.events.name'), render: (r) => <strong>{r.name}</strong> },
                { label: t('admin.events.city'), render: (r) => `${r.city}/${r.state}` },
                { label: t('admin.events.startDate'), render: (r) => `${formatDateBR(r.startDate)} – ${formatDateBR(r.endDate)}` },
                { label: t('admin.events.size'), render: (r) => <Badge tone="accent">{r.size}</Badge> },
                { label: t('admin.events.radiusKm'), render: (r) => `${r.radiusKm} km` },
                { label: t('admin.events.verified'), render: (r) => (r.verified ? t('common.yes') : t('common.no')) },
              ]}
              fields={[
                { name: 'name', label: t('admin.events.name'), type: 'text' },
                { name: 'city', label: t('admin.events.city'), type: 'text' },
                { name: 'state', label: t('admin.events.state'), type: 'select', options: states },
                { name: 'lat', label: t('admin.events.lat'), type: 'number' },
                { name: 'lng', label: t('admin.events.lng'), type: 'number' },
                { name: 'startDate', label: t('admin.events.startDate'), type: 'date' },
                { name: 'endDate', label: t('admin.events.endDate'), type: 'date' },
                { name: 'size', label: t('admin.events.size'), type: 'select', options: EventSize.options.map((v) => ({ value: v, label: t(`admin.events.sizes.${v}`) })) },
                { name: 'radiusKm', label: t('admin.events.radiusKm'), type: 'number' },
                { name: 'verified', label: t('admin.events.verified'), type: 'checkbox' },
              ]}
              toValues={(r) => ({
                name: r?.name ?? '',
                city: r?.city ?? '',
                state: r?.state ?? 'SC',
                lat: r ? String(r.lat) : '',
                lng: r ? String(r.lng) : '',
                startDate: r?.startDate ?? '',
                endDate: r?.endDate ?? '',
                size: r?.size ?? 'M',
                radiusKm: r ? String(r.radiusKm) : '5',
                verified: r?.verified ?? false,
              })}
            />
          ) : null}
          {tab === 'holidays' ? (
            <CrudSection<HolidayDto, ReturnType<typeof HolidayBody.parse>>
              queryKey="holidays"
              list={() => api().admin.holidays.list()}
              create={(b) => api().admin.holidays.create(b)}
              update={(id, b) => api().admin.holidays.update(id, b)}
              remove={(id) => api().admin.holidays.delete(id)}
              schema={HolidayBody}
              rowName={(r) => r.name}
              titleNew={t('admin.holidays.formTitleNew')}
              titleEdit={t('admin.holidays.formTitleEdit')}
              columns={[
                { label: t('admin.holidays.date'), render: (r) => formatDateBR(r.date) },
                { label: t('admin.holidays.name'), render: (r) => <strong>{r.name}</strong> },
                { label: t('admin.holidays.scope'), render: (r) => `${t(`admin.holidays.scopes.${r.scope}`)}${r.state ? ` · ${r.state}` : ''}` },
                { label: t('admin.holidays.kind'), render: (r) => t(`admin.holidays.kinds.${r.kind}`) },
                { label: t('admin.holidays.isBridge'), render: (r) => (r.isBridge ? t('common.yes') : t('common.no')) },
              ]}
              fields={[
                { name: 'date', label: t('admin.holidays.date'), type: 'date' },
                { name: 'name', label: t('admin.holidays.name'), type: 'text' },
                { name: 'scope', label: t('admin.holidays.scope'), type: 'select', options: HolidayScope.options.map((v) => ({ value: v, label: t(`admin.holidays.scopes.${v}`) })) },
                { name: 'state', label: t('admin.holidays.state'), type: 'select', options: states, optional: true },
                { name: 'ibgeCode', label: t('admin.holidays.ibgeCode'), type: 'text', optional: true },
                { name: 'kind', label: t('admin.holidays.kind'), type: 'select', options: HolidayKind.options.map((v) => ({ value: v, label: t(`admin.holidays.kinds.${v}`) })) },
                { name: 'isBridge', label: t('admin.holidays.isBridge'), type: 'checkbox' },
              ]}
              toValues={(r) => ({
                date: r?.date ?? '',
                name: r?.name ?? '',
                scope: r?.scope ?? 'NATIONAL',
                state: r?.state ?? '',
                ibgeCode: r?.ibgeCode ?? '',
                kind: r?.kind ?? 'REGULAR',
                isBridge: r?.isBridge ?? false,
              })}
            />
          ) : null}
          {tab === 'vacations' ? (
            <CrudSection<SchoolVacationDto, ReturnType<typeof SchoolVacationBody.parse>>
              queryKey="vacations"
              list={() => api().admin.schoolVacations.list()}
              create={(b) => api().admin.schoolVacations.create(b)}
              update={(id, b) => api().admin.schoolVacations.update(id, b)}
              remove={(id) => api().admin.schoolVacations.delete(id)}
              schema={SchoolVacationBody}
              rowName={(r) => `${r.state} ${r.year}`}
              titleNew={t('admin.vacations.formTitleNew')}
              titleEdit={t('admin.vacations.formTitleEdit')}
              columns={[
                { label: t('admin.vacations.state'), render: (r) => <strong>{r.state}</strong> },
                { label: t('admin.vacations.startDate'), render: (r) => formatDateBR(r.startDate) },
                { label: t('admin.vacations.endDate'), render: (r) => formatDateBR(r.endDate) },
                { label: t('admin.vacations.year'), render: (r) => r.year },
              ]}
              fields={[
                { name: 'state', label: t('admin.vacations.state'), type: 'select', options: states },
                { name: 'startDate', label: t('admin.vacations.startDate'), type: 'date' },
                { name: 'endDate', label: t('admin.vacations.endDate'), type: 'date' },
                { name: 'year', label: t('admin.vacations.year'), type: 'number' },
              ]}
              toValues={(r) => ({ state: r?.state ?? 'SC', startDate: r?.startDate ?? '', endDate: r?.endDate ?? '', year: String(r?.year ?? new Date().getFullYear()) })}
            />
          ) : null}
          {tab === 'health' ? <Health /> : null}
        </section>
      </main>
    </div>
  );
}
