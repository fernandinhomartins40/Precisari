import { describe, expect, it } from 'vitest';
import { DataCipher, hmacSha256, randomOtpCode, randomToken, safeEqual, sha256 } from './crypto';

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('DataCipher (AES-256-GCM)', () => {
  it('round-trips and uses a random IV', () => {
    const c = new DataCipher(KEY);
    const url = 'https://www.airbnb.com/calendar/ical/123.ics?s=secret';
    const a = c.encrypt(url);
    const b = c.encrypt(url);
    expect(a).not.toBe(b);
    expect(a.split(':')).toHaveLength(3);
    expect(a).not.toContain('secret');
    expect(c.decrypt(a)).toBe(url);
  });

  it('detects tampering and wrong keys', () => {
    const c = new DataCipher(KEY);
    const enc = c.encrypt('hello');
    const [iv, tag, data] = enc.split(':') as [string, string, string];
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() => c.decrypt([iv, tag, flipped.toString('base64')].join(':'))).toThrow();
    const other = new DataCipher(Buffer.alloc(32, 7).toString('base64'));
    expect(() => other.decrypt(enc)).toThrow();
    expect(() => c.decrypt('garbage')).toThrow();
  });

  it('requires a 32-byte key', () => {
    expect(() => new DataCipher(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('hash helpers', () => {
  it('sha256/hmac are deterministic hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hmacSha256('k', 'v')).toHaveLength(64);
    expect(hmacSha256('k', 'v')).not.toBe(hmacSha256('k2', 'v'));
  });
  it('safeEqual compares in constant time and handles length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
  it('random tokens and codes have the expected shape', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (let i = 0; i < 50; i++) expect(randomOtpCode()).toMatch(/^\d{6}$/);
  });
});
