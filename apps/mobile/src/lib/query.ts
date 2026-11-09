import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PrecisariApiError } from '@precisari/api-client';

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: DAY,
      retry: (count, err) => !(err instanceof PrecisariApiError && err.status < 500) && count < 2,
    },
  },
});

/** Persisted cache: main screens render instantly from AsyncStorage, then revalidate (<1s screens). */
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'precisari.query-cache', throttleTime: 1000 });

export const persistOptions = { persister, maxAge: DAY, buster: 'v1' } as const;

export const qk = {
  me: ['me'] as const,
  properties: ['properties'] as const,
  property: (id: string) => ['properties', id] as const,
  nights: (id: string, days: number) => ['nights', id, days] as const,
  night: (id: string, date: string) => ['night', id, date] as const,
  actions: (propertyId?: string) => ['actions', 'PENDING', propertyId ?? 'all'] as const,
  insights: (id: string, month: string) => ['insights', id, month] as const,
  plans: ['plans'] as const,
};
