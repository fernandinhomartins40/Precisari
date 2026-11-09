import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class IcalFetchError extends Error {
  constructor(
    message: string,
    /** pt-BR message safe to show to the host. */
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface FetchIcalOptions {
  timeoutMs: number;
  maxBytes: number;
  allowPrivateHosts: boolean;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses (SSRF guard). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  return true;
}

/** Normalizes and validates the URL (http/https only; webcal:// → https://). */
export function normalizeIcalUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new IcalFetchError('invalid url', 'Esse link não parece válido. Copie o link do calendário de novo.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new IcalFetchError('unsupported protocol', 'Use um link que comece com https://');
  }
  if (url.username || url.password) throw new IcalFetchError('credentials in url', 'Esse link não parece válido.');
  return url;
}

async function assertPublicHost(url: URL, allowPrivate: boolean): Promise<void> {
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new IcalFetchError('private host', 'Esse endereço não é permitido.');
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new IcalFetchError('dns failure', 'Não encontramos esse endereço. Confira o link.');
  });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new IcalFetchError('private address', 'Esse endereço não é permitido.');
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new IcalFetchError('too large', 'O calendário é grande demais.');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new IcalFetchError('too large', 'O calendário é grande demais.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Downloads an iCal feed with SSRF protection (scheme allowlist, private-IP rejection on every redirect hop),
 * timeout and size limit. Note: DNS is resolved before connecting; full DNS-rebinding protection would need a
 * pinned-IP agent (acceptable for the MVP).
 */
export async function fetchIcal(raw: string, opts: FetchIcalOptions): Promise<string> {
  const doFetch = opts.fetchImpl ?? fetch;
  let url = normalizeIcalUrl(raw);
  const maxRedirects = opts.maxRedirects ?? 3;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(url, opts.allowPrivateHosts);
    let res: Response;
    try {
      res = await doFetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1', 'User-Agent': 'Precisari-Calendar/1.0' },
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new IcalFetchError(
        timeout ? 'timeout' : `network: ${err instanceof Error ? err.message : String(err)}`,
        timeout ? 'O calendário demorou demais para responder.' : 'Não conseguimos acessar o link do calendário.',
      );
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new IcalFetchError('redirect without location', 'Não conseguimos acessar o link do calendário.');
      url = normalizeIcalUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) {
      throw new IcalFetchError(
        `http ${res.status}`,
        res.status === 404 || res.status === 410
          ? 'Esse link de calendário não existe mais. Gere um novo link no Airbnb.'
          : `O calendário respondeu com erro (${res.status}).`,
      );
    }
    return readLimited(res, opts.maxBytes);
  }
  throw new IcalFetchError('too many redirects', 'Não conseguimos acessar o link do calendário.');
}

/** "airbnb.com.br/…/••••1a2b.ics" — never expose the secret token part of the URL. */
export function maskIcalUrl(raw: string): string {
  try {
    const u = normalizeIcalUrl(raw);
    const tail = u.pathname.length > 8 ? u.pathname.slice(-8) : '';
    return `${u.hostname}/…${tail ? `••••${tail}` : ''}`;
  } catch {
    return '••••';
  }
}
