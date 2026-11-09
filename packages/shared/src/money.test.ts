import { describe, expect, it } from 'vitest';
import { formatBRL, parseBRLToCents } from './money';
import { CreatePropertyBody, OtpVerifyBody } from './index';

describe('money', () => {
  it('formats cents as BRL', () => {
    expect(formatBRL(34900, { whole: true })).toBe('R$ 349');
    expect(formatBRL(2990)).toBe('R$ 29,90');
    expect(formatBRL(28000, { whole: true, signed: true })).toBe('+R$ 280');
    expect(formatBRL(-500, { whole: true })).toBe('−R$ 5');
  });
  it('parses BRL input', () => {
    expect(parseBRLToCents('249')).toBe(24900);
    expect(parseBRLToCents('R$ 1.249,90')).toBe(124990);
    expect(parseBRLToCents('abc')).toBeNull();
  });
});

describe('schemas', () => {
  it('validates otp code', () => {
    expect(OtpVerifyBody.safeParse({ email: 'A@B.com ', code: '123456' }).success).toBe(true);
    expect(OtpVerifyBody.safeParse({ email: 'a@b.com', code: '12ab56' }).success).toBe(false);
  });
  it('enforces min <= base <= max', () => {
    const base = {
      name: 'Studio', address: 'Rua A', lat: -27.6, lng: -48.4, city: 'Florianópolis', state: 'SC',
      destinationType: 'BEACH', capacity: 2, bedrooms: 1, basePrice: 24900, minPrice: 18000,
    };
    expect(CreatePropertyBody.safeParse(base).success).toBe(true);
    expect(CreatePropertyBody.safeParse({ ...base, minPrice: 30000 }).success).toBe(false);
    expect(CreatePropertyBody.safeParse({ ...base, maxPrice: 10000 }).success).toBe(false);
  });
});
