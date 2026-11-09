import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { ErrorCode, type AuthTokens, type UserRole } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { randomToken, sha256 } from '../common/crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenSubject {
  id: string;
  email: string;
  role: UserRole;
}

const invalid = (): AppError => new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.REFRESH_INVALID, 'Sessão expirada. Entre de novo.');

/**
 * Access tokens: HS256 JWT (sub/email/role), short-lived.
 * Refresh tokens: opaque 32 random bytes, stored as sha256, rotated on every use. Each login starts a
 * family; presenting an already-rotated token (reuse ⇒ likely theft) revokes the whole family.
 */
@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async signAccess(user: TokenSubject): Promise<string> {
    return new SignJWT({ email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + this.env.JWT_ACCESS_TTL_SECONDS)
      .sign(this.secret);
  }

  /** New session (new refresh family). */
  async issue(user: TokenSubject, userAgent?: string): Promise<AuthTokens> {
    const refreshToken = await this.createRefresh(user.id, randomToken(16), userAgent);
    return { accessToken: await this.signAccess(user), refreshToken: refreshToken.token, expiresIn: this.env.JWT_ACCESS_TTL_SECONDS };
  }

  private async createRefresh(userId: string, familyId: string, userAgent?: string): Promise<{ id: string; token: string }> {
    const token = randomToken(32);
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        userAgent: userAgent?.slice(0, 200),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    return { id: row.id, token };
  }

  async rotate(refreshToken: string, userAgent?: string): Promise<AuthTokens> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, email: true, role: true, deletedAt: true } } },
    });
    if (!row) throw invalid();
    if (row.revokedAt) {
      if (row.replacedBy) await this.revokeFamily(row.familyId, row.userId, 'reuse');
      throw invalid();
    }
    if (row.expiresAt.getTime() <= Date.now() || row.user.deletedAt) throw invalid();

    // Claim the token atomically: only one concurrent rotation can win.
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count !== 1) {
      await this.revokeFamily(row.familyId, row.userId, 'reuse');
      throw invalid();
    }
    const next = await this.createRefresh(row.userId, row.familyId, userAgent);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { replacedBy: next.id } });
    const user = row.user;
    return {
      accessToken: await this.signAccess({ id: user.id, email: user.email, role: user.role }),
      refreshToken: next.token,
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
    };
  }

  /** Logout: revokes the token's whole family. Unknown tokens are ignored (idempotent). */
  async revoke(refreshToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (row) await this.revokeFamily(row.familyId, row.userId, 'logout');
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async revokeFamily(familyId: string, userId: string, reason: 'reuse' | 'logout'): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (reason === 'reuse') await this.audit.log(userId, 'auth.refresh_reuse_detected', { familyId });
  }
}
