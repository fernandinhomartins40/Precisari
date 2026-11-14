import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthSession, AuthTokens, UserDto } from '@precisari/shared';
import { bearer, createTestApp, login, resetDb, type TestContext } from './helpers';

describe('auth flow (integration)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.emails.sent.length = 0;
  });
  afterAll(async () => ctx.close());

  it('requests a code (always 204), verifies it and creates user + FREE subscription + consents', async () => {
    const email = 'carla@precisari.dev';
    await request(ctx.http).post('/v1/auth/otp/request').send({ email: ' Carla@Precisari.dev ' }).expect(204);
    expect(ctx.emails.sent).toHaveLength(1);
    expect(ctx.emails.sent[0]?.to).toBe(email);
    expect(ctx.emails.sent[0]?.text).toMatch(/Seu código para entrar no Precisari é \d{6}/);

    const stored = await ctx.prisma.otpCode.findFirstOrThrow({ where: { email } });
    expect(stored.codeHash).not.toContain(ctx.emails.lastCodeFor(email));

    const res = await request(ctx.http).post('/v1/auth/otp/verify').send({ email, code: ctx.emails.lastCodeFor(email) }).expect(200);
    const session = AuthSession.parse(res.body);
    expect(session.user.email).toBe(email);
    expect(session.user.role).toBe('USER');
    expect(session.user.subscription.plan).toBe('FREE');
    expect(session.expiresIn).toBe(900);

    const consents = await ctx.prisma.consent.findMany({ where: { userId: session.user.id } });
    expect(consents.map((c) => c.kind).sort()).toEqual(['privacy', 'terms']);

    const me = await request(ctx.http).get('/v1/me').set(...bearer(session)).expect(200);
    expect(UserDto.parse(me.body).id).toBe(session.user.id);

    // Code is single-use.
    await request(ctx.http).post('/v1/auth/otp/verify').send({ email, code: ctx.emails.lastCodeFor(email) }).expect(400);
  });

  it('rejects wrong codes, then locks after max attempts', async () => {
    const email = 'rafael@precisari.dev';
    await request(ctx.http).post('/v1/auth/otp/request').send({ email }).expect(204);
    const good = ctx.emails.lastCodeFor(email);
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await request(ctx.http).post('/v1/auth/otp/verify').send({ email, code: bad }).expect(400);
      expect(r.body.code).toBe('OTP_INVALID');
      expect(r.body.message).toMatch(/Código incorreto/);
    }
    const locked = await request(ctx.http).post('/v1/auth/otp/verify').send({ email, code: good }).expect(429);
    expect(locked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('rejects expired codes and validates input', async () => {
    const email = 'exp@precisari.dev';
    await request(ctx.http).post('/v1/auth/otp/request').send({ email }).expect(204);
    await ctx.prisma.otpCode.updateMany({ where: { email }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await request(ctx.http).post('/v1/auth/otp/verify').send({ email, code: ctx.emails.lastCodeFor(email) }).expect(400);
    expect(r.body.code).toBe('OTP_EXPIRED');
    const v = await request(ctx.http).post('/v1/auth/otp/request').send({ email: 'nope' }).expect(400);
    expect(v.body.code).toBe('VALIDATION_ERROR');
  });

  it('logs the store review account in with its fixed code, without e-mail', async () => {
    await request(ctx.http).post('/v1/auth/otp/request').send({ email: 'Review@Precisari.dev' }).expect(204);
    expect(ctx.emails.sent).toHaveLength(0);
    await request(ctx.http).post('/v1/auth/otp/verify').send({ email: 'review@precisari.dev', code: '246810' }).expect(200);
    // Every listed address (case-insensitive) shares the code, e.g. a second account for screen recordings.
    await request(ctx.http).post('/v1/auth/otp/request').send({ email: 'recording@precisari.dev' }).expect(204);
    await request(ctx.http).post('/v1/auth/otp/verify').send({ email: 'recording@precisari.dev', code: '246810' }).expect(200);
    expect(ctx.emails.sent).toHaveLength(0);
    // Another address cannot use the review code.
    await request(ctx.http).post('/v1/auth/otp/request').send({ email: 'other@precisari.dev' }).expect(204);
    await request(ctx.http).post('/v1/auth/otp/verify').send({ email: 'other@precisari.dev', code: '246810' }).expect(400);
  });

  it('grants ADMIN to ADMIN_EMAILS', async () => {
    const s = await login(ctx, 'admin@precisari.dev');
    expect(s.user.role).toBe('ADMIN');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const s = await login(ctx, 'carla@precisari.dev');
    const r1 = await request(ctx.http).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    const t1 = AuthTokens.parse(r1.body);
    expect(t1.refreshToken).not.toBe(s.refreshToken);

    // Reusing the rotated token ⇒ 401 and the whole family (including t1) is revoked.
    const reuse = await request(ctx.http).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    expect(reuse.body.code).toBe('REFRESH_INVALID');
    await request(ctx.http).post('/v1/auth/refresh').send({ refreshToken: t1.refreshToken }).expect(401);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { userId: s.user.id, action: 'auth.refresh_reuse_detected' } });
    expect(audit).not.toBeNull();
  });

  it('logout revokes the session', async () => {
    const s = await login(ctx, 'carla@precisari.dev');
    await request(ctx.http).post('/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
    await request(ctx.http).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('social login answers 501 while not configured', async () => {
    const r = await request(ctx.http).post('/v1/auth/oauth/google').send({ idToken: 'x' }).expect(501);
    expect(r.body.code).toBe('NOT_IMPLEMENTED');
    await request(ctx.http).post('/v1/auth/oauth/facebook').send({ idToken: 'x' }).expect(400);
  });

  it('protects routes and serves OpenAPI', async () => {
    const r = await request(ctx.http).get('/v1/me').expect(401);
    expect(r.body).toMatchObject({ code: 'UNAUTHORIZED' });
    const docs = await request(ctx.http).get('/docs-json').expect(200);
    expect(Object.keys(docs.body.paths)).toContain('/v1/auth/otp/request');
  });
});
