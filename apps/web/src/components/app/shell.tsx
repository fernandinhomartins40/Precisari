'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bell, Building2, CalendarDays, ChartNoAxesCombined, ChevronDown, House, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { formatBRL } from '@precisari/shared';
import { t, type MessageKey } from '@/i18n';
import { useLogout, useUser } from '@/lib/auth';
import { usePendingActions } from '@/lib/queries';
import { isMockMode } from '@/lib/api';
import { Logo, ThemeToggle } from '../ui/primitives';
import { IconButton } from '../ui/button';
import s from './shell.module.css';

const NAV: { href: string; key: MessageKey; icon: React.ReactNode; match: (p: string) => boolean }[] = [
  { href: '/app', key: 'shell.nav.today', icon: <House size={22} />, match: (p) => p === '/app' },
  { href: '/app/calendario', key: 'shell.nav.calendar', icon: <CalendarDays size={22} />, match: (p) => p.startsWith('/app/calendario') },
  { href: '/app/resultados', key: 'shell.nav.results', icon: <ChartNoAxesCombined size={22} />, match: (p) => p.startsWith('/app/resultados') },
  { href: '/app/imoveis', key: 'shell.nav.properties', icon: <Building2 size={22} />, match: (p) => p.startsWith('/app/imoveis') },
];

function crumbs(pathname: string): string[] {
  const root = t('shell.breadcrumbRoot');
  if (pathname === '/app') return [root, t('shell.nav.today')];
  if (pathname.startsWith('/app/calendario')) return [root, t('shell.nav.calendar')];
  if (pathname.startsWith('/app/resultados')) return [root, t('shell.nav.results')];
  if (pathname === '/app/imoveis/novo') return [root, t('shell.nav.properties'), t('shell.newProperty')];
  if (pathname.startsWith('/app/imoveis/')) return [root, t('shell.nav.properties'), t('shell.propertySettings')];
  if (pathname.startsWith('/app/imoveis')) return [root, t('shell.nav.properties')];
  if (pathname.startsWith('/app/conta')) return [root, t('shell.nav.settings')];
  return [root];
}

function initials(name: string | null, email: string): string {
  const src = name ?? email;
  return src.trim().charAt(0).toUpperCase();
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function UserMenu({ placement }: { placement: 'sidebar' | 'topbar' }) {
  const user = useUser();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className={placement === 'sidebar' ? s.userMenu : s.userMenuTop} ref={ref}>
      <button type="button" className={s.userButton} aria-expanded={open} aria-haspopup="menu" aria-label={t('shell.userMenu')} onClick={() => setOpen((o) => !o)}>
        <span className={s.avatar} aria-hidden="true">
          {initials(user.name, user.email)}
        </span>
        {placement === 'sidebar' ? <span className={s.userName}>{user.name ?? user.email}</span> : null}
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className={s.menu} role="menu">
          <Link role="menuitem" href="/app/conta" className={s.menuItem} onClick={() => setOpen(false)}>
            <UserRound size={18} aria-hidden="true" /> {t('shell.myAccount')}
          </Link>
          {user.role === 'ADMIN' ? (
            <Link role="menuitem" href="/admin" className={s.menuItem} onClick={() => setOpen(false)}>
              <ShieldCheck size={18} aria-hidden="true" /> {t('shell.admin')}
            </Link>
          ) : null}
          <button role="menuitem" type="button" className={s.menuItem} onClick={() => void logout('/')}>
            <LogOut size={18} aria-hidden="true" /> {t('shell.logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Notifications() {
  const actions = usePendingActions();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const count = actions.data?.items.length ?? 0;
  return (
    <div className={s.notif} ref={ref}>
      <IconButton
        label={count > 0 ? t('shell.notificationsUnread', { count }) : t('shell.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={22} aria-hidden="true" />
        {count > 0 ? <span className={s.dot} aria-hidden="true" /> : null}
      </IconButton>
      {open ? (
        <div className={s.popover} role="dialog" aria-label={t('shell.notifications')}>
          {count > 0 ? (
            <Link href="/app" className={s.popoverItem} onClick={() => setOpen(false)}>
              <span className={s.popoverIcon} aria-hidden="true">
                <CalendarDays size={18} />
              </span>
              {t('shell.notificationsDaily', { count, gain: formatBRL(actions.data?.totalEstimatedGain ?? 0, { whole: true, signed: true }) })}
            </Link>
          ) : (
            <p className={s.popoverEmpty}>{t('shell.notificationsEmpty')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const trail = crumbs(pathname);
  const settingsActive = pathname.startsWith('/app/conta');
  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <Logo href="/app" width={168} />
        </div>
        <nav aria-label={t('shell.nav.label')} className={s.sideNav}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={s.sideLink} aria-current={n.match(pathname) ? 'page' : undefined}>
              <span aria-hidden="true">{n.icon}</span>
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className={s.sideBottom}>
          <Link href="/app/conta" className={s.sideLink} aria-current={settingsActive ? 'page' : undefined}>
            <Settings size={22} aria-hidden="true" />
            {t('shell.nav.settings')}
          </Link>
          <UserMenu placement="sidebar" />
        </div>
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <span className={s.mobileLogo}>
            <Logo href="/app" width={124} />
          </span>
          <nav aria-label={t('shell.breadcrumbLabel')} className={s.breadcrumb}>
            <ol>
              {trail.map((c, i) => (
                <li key={c} aria-current={i === trail.length - 1 ? 'page' : undefined}>
                  {c}
                </li>
              ))}
            </ol>
          </nav>
          <div className={s.topActions}>
            {isMockMode ? <span className={s.demo}>{t('common.demoMode')}</span> : null}
            <ThemeToggle />
            <Notifications />
            <UserMenu placement="topbar" />
          </div>
        </header>
        <main id="conteudo" className={s.content}>
          {children}
        </main>
      </div>

      <nav aria-label={t('shell.nav.label')} className={s.bottomNav}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={s.bottomLink} aria-current={n.match(pathname) ? 'page' : undefined}>
            <span aria-hidden="true">{n.icon}</span>
            {t(n.key)}
          </Link>
        ))}
        <Link href="/app/conta" className={s.bottomLink} aria-current={settingsActive ? 'page' : undefined}>
          <Settings size={22} aria-hidden="true" />
          {t('shell.nav.account')}
        </Link>
      </nav>
    </div>
  );
}

export function ShellSplash() {
  return (
    <div className={s.splash} role="status" aria-live="polite">
      <Logo width={168} />
      <span className={s.splashBar} aria-hidden="true" />
      <span className="visually-hidden">{t('shell.guardLoading')}</span>
    </div>
  );
}
