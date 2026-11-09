import { createClient } from '@precisari/api-client';
import { config, MOCK_BASE_URL } from './config';
import { createMockFetch } from './mock-api';
import { createSecureTokenStore } from './token-store';

export const tokenStore = createSecureTokenStore();

/** Single typed API client. In mock mode, requests go to an in-memory fake implementing the same contract. */
export const api = createClient({
  baseUrl: config.mock ? MOCK_BASE_URL : config.apiUrl,
  tokens: tokenStore,
  fetch: config.mock ? (createMockFetch() as typeof fetch) : undefined,
  onSessionExpired: () => void tokenStore.clear(),
});
