import { createClient, type PrecisariClient } from '@precisari/api-client';
import { createMockFetch, MOCK_BASE_URL } from './mock-api';
import { localTokenStore } from './token-store';

/** Mock mode is on unless NEXT_PUBLIC_API_MOCK is explicitly "false". */
export const isMockMode = process.env.NEXT_PUBLIC_API_MOCK !== 'false';
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

let client: PrecisariClient | null = null;

function onSessionExpired() {
  if (typeof window === 'undefined') return;
  localTokenStore.clear();
  if (window.location.pathname.startsWith('/app') || window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/checkout')) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/entrar?expirou=1&next=${next}`);
  }
}

/** Browser singleton of the typed API client (real or mock fetch). */
export function api(): PrecisariClient {
  if (client) return client;
  const storage = typeof window !== 'undefined' ? safeLocalStorage() : null;
  client = createClient({
    baseUrl: isMockMode ? MOCK_BASE_URL : apiBaseUrl,
    tokens: localTokenStore,
    fetch: isMockMode ? createMockFetch({ storage, latencyMs: 180 }) : undefined,
    onSessionExpired,
  });
  return client;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
