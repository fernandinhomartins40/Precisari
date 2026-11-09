import { describe, expect, it } from 'vitest';
import { IcalFetchError, fetchIcal, isPrivateAddress, maskIcalUrl, normalizeIcalUrl } from './ical-fetcher';

const opts = { timeoutMs: 1000, maxBytes: 1000, allowPrivateHosts: false };

function fakeFetch(responses: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const key = input.toString();
    const make = responses[key];
    if (!make) throw new Error(`unexpected fetch ${key}`);
    return make();
  }) as typeof fetch;
}

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true], ['10.1.2.3', true], ['172.16.0.1', true], ['172.32.0.1', false], ['192.168.1.1', true],
    ['169.254.169.254', true], ['100.64.0.1', true], ['0.0.0.0', true], ['8.8.8.8', false], ['54.230.1.1', false],
    ['::1', true], ['fd00::1', true], ['fe80::1', true], ['::ffff:127.0.0.1', true], ['2606:4700::1111', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe('normalizeIcalUrl', () => {
  it('accepts http(s) and converts webcal', () => {
    expect(normalizeIcalUrl('webcal://www.airbnb.com/calendar/ical/1.ics?s=abc').protocol).toBe('https:');
    expect(normalizeIcalUrl('https://www.airbnb.com.br/calendar/ical/1.ics').hostname).toBe('www.airbnb.com.br');
  });
  it('rejects other schemes and credentials', () => {
    expect(() => normalizeIcalUrl('file:///etc/passwd')).toThrow(IcalFetchError);
    expect(() => normalizeIcalUrl('ftp://example.com/a.ics')).toThrow(IcalFetchError);
    expect(() => normalizeIcalUrl('https://user:pass@example.com/a.ics')).toThrow(IcalFetchError);
    expect(() => normalizeIcalUrl('not a url')).toThrow(IcalFetchError);
  });
});

describe('fetchIcal (SSRF + limits)', () => {
  it('blocks loopback and private IP literals when private hosts are not allowed', async () => {
    await expect(fetchIcal('http://127.0.0.1/a.ics', opts)).rejects.toThrow('private address');
    await expect(fetchIcal('http://169.254.169.254/latest/meta-data', opts)).rejects.toThrow('private address');
    await expect(fetchIcal('http://localhost/a.ics', opts)).rejects.toThrow('private host');
  });

  it('re-validates redirect targets', async () => {
    const f = fakeFetch({
      'https://8.8.8.8/a.ics': () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/secret' } }),
    });
    await expect(fetchIcal('https://8.8.8.8/a.ics', { ...opts, fetchImpl: f })).rejects.toThrow('private address');
  });

  it('enforces the size limit and maps HTTP errors', async () => {
    const f = fakeFetch({
      'https://8.8.8.8/big.ics': () => new Response('x'.repeat(5000)),
      'https://8.8.8.8/gone.ics': () => new Response('gone', { status: 404 }),
      'https://8.8.8.8/ok.ics': () => new Response('BEGIN:VCALENDAR\nEND:VCALENDAR\n'),
    });
    await expect(fetchIcal('https://8.8.8.8/big.ics', { ...opts, fetchImpl: f })).rejects.toThrow('too large');
    const gone = await fetchIcal('https://8.8.8.8/gone.ics', { ...opts, fetchImpl: f }).catch((e: IcalFetchError) => e);
    expect(gone).toBeInstanceOf(IcalFetchError);
    expect((gone as IcalFetchError).userMessage).toContain('não existe mais');
    await expect(fetchIcal('https://8.8.8.8/ok.ics', { ...opts, fetchImpl: f })).resolves.toContain('BEGIN:VCALENDAR');
  });

  it('times out slow feeds', async () => {
    const slow = (async (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })));
      })) as typeof fetch;
    await expect(fetchIcal('https://8.8.8.8/slow.ics', { ...opts, timeoutMs: 50, fetchImpl: slow })).rejects.toThrow('timeout');
  });
});

describe('maskIcalUrl', () => {
  it('never exposes the secret query string', () => {
    const masked = maskIcalUrl('https://www.airbnb.com.br/calendar/ical/12345678.ics?s=supersecrettoken');
    expect(masked).toBe('www.airbnb.com.br/…••••5678.ics');
    expect(masked).not.toContain('supersecret');
  });
});
