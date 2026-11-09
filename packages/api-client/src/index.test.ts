import { describe, expect, it, vi } from 'vitest';
import { PrecisariApiError, createClient, memoryTokenStore } from './index';

const user = {
  id: 'u1', email: 'carla@example.com', name: null, authProvider: 'EMAIL', role: 'USER',
  dailyNotificationHour: 9, timezone: 'America/Sao_Paulo', emailWeeklySummary: true,
  subscription: { plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, trialEndsAt: null },
  createdAt: '2026-11-09T12:00:00.000Z',
};

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PrecisariClient', () => {
  it('verifies otp and stores tokens', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user }));
    const tokens = memoryTokenStore();
    const c = createClient({ baseUrl: 'http://api', tokens, fetch: f });
    const s = await c.auth.verifyOtp({ email: 'carla@example.com', code: '123456' });
    expect(s.user.email).toBe('carla@example.com');
    expect(tokens.getAccessToken()).toBe('a');
    expect(f.mock.calls[0]?.[0]).toBe('http://api/v1/auth/otp/verify');
  });

  it('refreshes on 401 and retries once', async () => {
    const tokens = memoryTokenStore();
    tokens.setTokens({ accessToken: 'old', refreshToken: 'r1', expiresIn: 900 });
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED', message: 'x' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new', refreshToken: 'r2', expiresIn: 900 }))
      .mockResolvedValueOnce(json(200, user));
    const c = createClient({ baseUrl: 'http://api', tokens, fetch: f });
    const me = await c.me.get();
    expect(me.id).toBe('u1');
    expect(tokens.getRefreshToken()).toBe('r2');
  });

  it('maps API errors', async () => {
    const f = vi.fn().mockResolvedValue(json(400, { code: 'OTP_INVALID', message: 'Código inválido' }));
    const c = createClient({ baseUrl: 'http://api', fetch: f });
    await expect(c.auth.verifyOtp({ email: 'a@b.com', code: '000000' })).rejects.toBeInstanceOf(PrecisariApiError);
  });
});
