import type { ZodTypeAny, z } from 'zod';

/** Error raised by adapters when a third party fails or answers with an unexpected payload. */
export class IntegrationError extends Error {
  constructor(
    readonly integration: string,
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(`[${integration}] ${message}`);
    this.name = 'IntegrationError';
  }
}

export type FetchFn = typeof fetch;

export interface FetchJsonOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  fetchFn?: FetchFn;
}

/** Fetch JSON with a timeout and validate the response with Zod (third-party responses are untrusted). */
export async function fetchJson<T extends ZodTypeAny>(
  integration: string,
  url: string,
  schema: T,
  opts: FetchJsonOptions = {},
): Promise<z.infer<T>> {
  const fetchFn = opts.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: opts.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch (err) {
    throw new IntegrationError(integration, `request failed: ${(err as Error).message}`);
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new IntegrationError(integration, `invalid JSON (HTTP ${res.status})`, res.status, text.slice(0, 300));
    }
  }
  if (!res.ok) {
    throw new IntegrationError(integration, `HTTP ${res.status}`, res.status, json);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new IntegrationError(integration, 'unexpected response shape', res.status, parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

/** Run a promise with a deadline. */
export async function withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
