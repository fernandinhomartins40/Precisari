import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserDto } from '@precisari/shared';
import { api, tokenStore } from './api';
import { persister, queryClient, qk } from './query';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface SessionValue {
  status: Status;
  requestCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<UserDto>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let alive = true;
    tokenStore.load().then((signedIn) => alive && setStatus(signedIn ? 'signedIn' : 'signedOut'));
    const unsub = tokenStore.subscribe((signedIn) => {
      setStatus(signedIn ? 'signedIn' : 'signedOut');
      if (!signedIn) {
        queryClient.clear();
        void persister.removeClient();
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const requestCode = useCallback((email: string) => api.auth.requestOtp(email), []);
  const verifyCode = useCallback(async (email: string, code: string) => {
    const session = await api.auth.verifyOtp({ email, code });
    queryClient.setQueryData(qk.me, session.user);
    return session.user;
  }, []);
  const signOut = useCallback(() => api.auth.logout(), []);

  const value = useMemo(() => ({ status, requestCode, verifyCode, signOut }), [status, requestCode, verifyCode, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
