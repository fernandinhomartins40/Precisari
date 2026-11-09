import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '@precisari/api-client';
import type { AuthTokens } from '@precisari/shared';

const ACCESS = 'precisari.accessToken';
const REFRESH = 'precisari.refreshToken';

/** SecureStore on iOS/Android; localStorage on web (SecureStore is native-only). */
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};

type Listener = (signedIn: boolean) => void;

/** Persistent token store with an in-memory cache and change listeners (drives the session state). */
export function createSecureTokenStore(): TokenStore & { subscribe(l: Listener): () => void; load(): Promise<boolean> } {
  let access: string | null = null;
  let refresh: string | null = null;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(access !== null));
  return {
    async load() {
      [access, refresh] = await Promise.all([storage.get(ACCESS), storage.get(REFRESH)]);
      return access !== null;
    },
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    async setTokens(tokens: AuthTokens) {
      const wasSignedIn = access !== null;
      access = tokens.accessToken;
      refresh = tokens.refreshToken;
      await Promise.all([storage.set(ACCESS, access), storage.set(REFRESH, refresh)]);
      if (!wasSignedIn) emit();
    },
    async clear() {
      access = null;
      refresh = null;
      await Promise.all([storage.remove(ACCESS), storage.remove(REFRESH)]);
      emit();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
