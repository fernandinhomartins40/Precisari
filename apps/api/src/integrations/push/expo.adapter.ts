import { z } from 'zod';
import { fetchJson, type FetchFn } from '../common/http';
import type { HealthStatus, PushMessage, PushProvider, PushResult } from '../ports';

/** https://docs.expo.dev/push-notifications/sending-notifications/#http2-api */
export const ExpoPushTicket = z.union([
  z.object({ status: z.literal('ok'), id: z.string() }),
  z.object({
    status: z.literal('error'),
    message: z.string().default(''),
    details: z.object({ error: z.string().optional() }).passthrough().optional(),
  }),
]);
export const ExpoPushResponse = z.object({ data: z.array(ExpoPushTicket) });

export const EXPO_CHUNK_SIZE = 100;

/**
 * Expo push sender. Returns one result per message; `error: 'DeviceNotRegistered'` tells the caller
 * (NotificationsService) to delete the DeviceToken. Push receipts (async errors) are a TODO.
 */
export class ExpoPushProvider implements PushProvider {
  readonly provider = 'expo';
  static readonly URL = 'https://exp.host/--/api/v2/push/send';

  constructor(
    private readonly accessToken = '',
    private readonly fetchFn?: FetchFn,
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += EXPO_CHUNK_SIZE) {
      const chunk = messages.slice(i, i + EXPO_CHUNK_SIZE);
      try {
        const res = await fetchJson('push', ExpoPushProvider.URL, ExpoPushResponse, {
          method: 'POST',
          headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
          body: chunk.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high' })),
          fetchFn: this.fetchFn,
          timeoutMs: 10_000,
        });
        chunk.forEach((m, j) => {
          const t = res.data[j];
          if (!t) results.push({ token: m.to, ok: false, error: 'missing ticket' });
          else if (t.status === 'ok') results.push({ token: m.to, ok: true });
          else results.push({ token: m.to, ok: false, error: t.details?.error ?? (t.message || 'error') });
        });
      } catch (err) {
        chunk.forEach((m) => results.push({ token: m.to, ok: false, error: (err as Error).message }));
      }
    }
    return results;
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, detail: this.accessToken ? 'com access token' : 'sem access token' };
  }
}
