'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@precisari/shared';
import { api } from './api';
import { useMe } from './queries';
import { localTokenStore } from './token-store';

/** true/false once known on the client; null during SSR / first render. */
export function useHasSession(): boolean | null {
  return useSyncExternalStore(
    (cb) => localTokenStore.subscribe(cb),
    () => localTokenStore.hasSession(),
    () => null,
  );
}

const UserContext = createContext<UserDto | null>(null);

export function useUser(): UserDto {
  const u = useContext(UserContext);
  if (!u) throw new Error('useUser must be used inside <RequireAuth>');
  return u;
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async (to = '/') => {
    await api().auth.logout();
    qc.clear();
    router.replace(to);
  };
}

/** Sanitizes the post-login redirect (internal paths only). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/app';
  return next;
}

/**
 * Client-side route guard: redirects to /entrar when there is no session, waits for /me,
 * and exposes the user through context.
 */
export function RequireAuth({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const has = useHasSession();
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe(has === true);

  useEffect(() => {
    if (has === false) router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);
  }, [has, pathname, router]);

  if (has !== true || !me.data) return <>{fallback}</>;
  return <UserContext.Provider value={me.data}>{children}</UserContext.Provider>;
}
