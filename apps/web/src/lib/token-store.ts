import type { TokenStore } from '@precisari/api-client';
import type { AuthTokens } from '@precisari/shared';

const ACCESS = 'precisari.accessToken';
const REFRESH = 'precisari.refreshToken';
const EXPIRES = 'precisari.accessExpiresAt';

type Listener = (authenticated: boolean) => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** localStorage-backed token store (access + refresh). The api-client handles refresh rotation. */
export const localTokenStore: TokenStore & { hasSession(): boolean; subscribe(l: Listener): () => void } = {
  getAccessToken: () => storage()?.getItem(ACCESS) ?? null,
  getRefreshToken: () => storage()?.getItem(REFRESH) ?? null,
  setTokens: (t: AuthTokens) => {
    const s = storage();
    if (!s) return;
    s.setItem(ACCESS, t.accessToken);
    s.setItem(REFRESH, t.refreshToken);
    s.setItem(EXPIRES, String(Date.now() + t.expiresIn * 1000));
    listeners.forEach((l) => l(true));
  },
  clear: () => {
    const s = storage();
    s?.removeItem(ACCESS);
    s?.removeItem(REFRESH);
    s?.removeItem(EXPIRES);
    listeners.forEach((l) => l(false));
  },
  hasSession: () => Boolean(storage()?.getItem(REFRESH)),
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
