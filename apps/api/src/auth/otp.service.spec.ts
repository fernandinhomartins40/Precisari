import { describe, expect, it } from 'vitest';
import { checkOtp, hashOtp, maskEmail, otpEmail } from './otp.service';

const now = new Date('2026-11-09T12:00:00Z');
const secret = 'test-secret';

describe('OTP', () => {
  const hash = hashOtp(secret, 'carla@precisari.dev', '123456');
  const record = (over: Partial<{ attempts: number; expiresAt: Date }> = {}) => ({
    codeHash: hash,
    attempts: 0,
    expiresAt: new Date(now.getTime() + 60_000),
    ...over,
  });

  it('hash depends on secret, email and code', () => {
    expect(hash).not.toBe(hashOtp('other', 'carla@precisari.dev', '123456'));
    expect(hash).not.toBe(hashOtp(secret, 'rafael@precisari.dev', '123456'));
    expect(hash).not.toBe(hashOtp(secret, 'carla@precisari.dev', '123457'));
    expect(hash).not.toContain('123456');
  });

  it('accepts the right code', () => {
    expect(checkOtp(record(), hash, now, 5)).toBe('ok');
  });

  it('rejects wrong, missing, expired and over-attempted codes', () => {
    expect(checkOtp(record(), hashOtp(secret, 'carla@precisari.dev', '000000'), now, 5)).toBe('invalid');
    expect(checkOtp(null, hash, now, 5)).toBe('invalid');
    expect(checkOtp(record({ expiresAt: new Date(now.getTime() - 1) }), hash, now, 5)).toBe('expired');
    expect(checkOtp(record({ attempts: 5 }), hash, now, 5)).toBe('too_many_attempts');
  });

  it('builds a pt-BR email with the code and TTL', () => {
    const msg = otpEmail('042137', 10);
    expect(msg.subject).toContain('042137');
    expect(msg.text).toContain('042137');
    expect(msg.text).toContain('10 minutos');
  });

  it('masks emails for logs', () => {
    expect(maskEmail('carla@precisari.dev')).toBe('ca***@precisari.dev');
  });
});
