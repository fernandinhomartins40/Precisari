import { vi } from 'vitest';
import type { FetchFn } from '../../src/integrations/common/http';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (call: RecordedCall) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

/** A fetch mock that records calls and answers from a queue (last responder repeats). No network. */
export function mockFetch(...responders: Responder[]): { fetchFn: FetchFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => {
      headers[k] = v;
    });
    let rawBody: unknown = init?.body;
    if (rawBody === undefined && input instanceof Request) rawBody = await input.text();
    let body: unknown = rawBody;
    if (typeof rawBody === 'string' && rawBody.length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    const call: RecordedCall = { url, method: init?.method ?? (input instanceof Request ? input.method : 'GET'), headers, body };
    calls.push(call);
    const responder = responders[Math.min(i++, responders.length - 1)];
    if (!responder) throw new Error('no responder');
    const r = await responder(call);
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fetchFn: fn as unknown as FetchFn, calls };
}

export const json = (body: unknown, status = 200) => () => ({ status, body });
