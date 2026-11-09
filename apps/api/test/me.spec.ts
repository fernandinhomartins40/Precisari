import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserDto } from '@precisari/shared';
import { bearer, createTestApp, login, propertyBody, resetDb, type TestContext } from './helpers';

describe('/me (integration)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => resetDb(ctx.prisma));
  afterAll(async () => ctx.close());

  it('PATCH updates preferences and validates the timezone', async () => {
    const s = await login(ctx, 'carla@precisari.dev');
    const res = await request(ctx.http).patch('/v1/me').set(...bearer(s)).send({ name: 'Carla', dailyNotificationHour: 8, emailWeeklySummary: false }).expect(200);
    expect(UserDto.parse(res.body)).toMatchObject({ name: 'Carla', dailyNotificationHour: 8, emailWeeklySummary: false });
    await request(ctx.http).patch('/v1/me').set(...bearer(s)).send({ timezone: 'Marte/Olympus' }).expect(400);
    await request(ctx.http).patch('/v1/me').set(...bearer(s)).send({ dailyNotificationHour: 25 }).expect(400);
  });

  it('GET /me/export returns all user data without secrets', async () => {
    const s = await login(ctx, 'carla@precisari.dev');
    await request(ctx.http).post('/v1/properties').set(...bearer(s)).send(propertyBody()).expect(201);
    const res = await request(ctx.http).get('/v1/me/export').set(...bearer(s)).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.user.email).toBe('carla@precisari.dev');
    expect(res.body.properties).toHaveLength(1);
    expect(res.body.consents).toHaveLength(2);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('codeHash');
    expect(json).not.toContain('tokenHash');
    expect(json).not.toContain('urlEncrypted');
  });

  it('DELETE /me anonymizes the user, deletes data and revokes sessions (LGPD)', async () => {
    const s = await login(ctx, 'carla@precisari.dev');
    await request(ctx.http).post('/v1/properties').set(...bearer(s)).send(propertyBody()).expect(201);
    await request(ctx.http).post('/v1/devices').set(...bearer(s)).send({ expoPushToken: 'ExpoPushToken[x]', platform: 'ios' }).expect(204);

    await request(ctx.http).delete('/v1/me').set(...bearer(s)).expect(204);

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: s.user.id } });
    expect(user.deletedAt).not.toBeNull();
    expect(user.email).not.toContain('carla');
    expect(await ctx.prisma.property.count()).toBe(0);
    expect(await ctx.prisma.nightPrice.count()).toBe(0);
    expect(await ctx.prisma.deviceToken.count()).toBe(0);
    expect(await ctx.prisma.refreshToken.count({ where: { userId: s.user.id } })).toBe(0);
    expect(await ctx.prisma.auditLog.count({ where: { userId: s.user.id, action: 'user.deleted' } })).toBe(1);

    await request(ctx.http).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    await request(ctx.http).get('/v1/me').set(...bearer(s)).expect(401);

    // The same email can sign up again as a brand-new account.
    const again = await login(ctx, 'carla@precisari.dev');
    expect(again.user.id).not.toBe(s.user.id);
  });
});
