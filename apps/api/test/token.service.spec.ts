import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { jwtVerify } from 'jose';
import { AuditService } from '../src/common/audit.service';
import { sha256 } from '../src/common/crypto';
import { loadEnv } from '../src/config/env';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers';

describe('TokenService (refresh rotation + reuse detection)', () => {
  const prisma = new PrismaService();
  const env = loadEnv();
  const tokens = new TokenService(prisma, new AuditService(prisma), env);
  let user: { id: string; email: string; role: 'USER' };

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => {
    await resetDb(prisma);
    const u = await prisma.user.create({ data: { email: 'carla@precisari.dev' } });
    user = { id: u.id, email: u.email, role: 'USER' };
  });
  afterAll(async () => prisma.$disconnect());

  it('signs HS256 access tokens with sub/email/role and TTL', async () => {
    const t = await tokens.issue(user);
    const { payload, protectedHeader } = await jwtVerify(t.accessToken, new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload).toMatchObject({ sub: user.id, email: user.email, role: 'USER' });
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(env.JWT_ACCESS_TTL_SECONDS);
  });

  it('stores only the hash and keeps the family across rotations', async () => {
    const t0 = await tokens.issue(user);
    const row0 = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(t0.refreshToken) } });
    expect(row0.tokenHash).not.toBe(t0.refreshToken);
    const t1 = await tokens.rotate(t0.refreshToken);
    const t2 = await tokens.rotate(t1.refreshToken);
    const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    expect(rows[0]?.replacedBy).toBe(rows[1]?.id);
    expect(t2.refreshToken).not.toBe(t1.refreshToken);
  });

  it('reuse of a rotated token revokes the whole family, other sessions survive', async () => {
    const a0 = await tokens.issue(user);
    const other = await tokens.issue(user);
    const a1 = await tokens.rotate(a0.refreshToken);
    await expect(tokens.rotate(a0.refreshToken)).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
    await expect(tokens.rotate(a1.refreshToken)).rejects.toMatchObject({ response: { code: 'REFRESH_INVALID' } });
    await expect(tokens.rotate(other.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('concurrent rotation of the same token: only one wins', async () => {
    const t0 = await tokens.issue(user);
    const results = await Promise.allSettled([tokens.rotate(t0.refreshToken), tokens.rotate(t0.refreshToken)]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
    expect(results.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1);
  });

  it('rejects expired, unknown and deleted-user tokens', async () => {
    const t0 = await tokens.issue(user);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(tokens.rotate(t0.refreshToken)).rejects.toThrow();
    await expect(tokens.rotate('unknown')).rejects.toThrow();
    const t1 = await tokens.issue(user);
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    await expect(tokens.rotate(t1.refreshToken)).rejects.toThrow();
  });
});
