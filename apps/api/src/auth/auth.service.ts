import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthProvider } from '@prisma/client';
import { ErrorCode, type AuthSession } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, type UserWithSubscription } from '../users/user.mapper';
import { OAUTH_VERIFIER, type OAuthProviderName, type OAuthVerifier } from './oauth.verifier';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(OAUTH_VERIFIER) private readonly oauth: OAuthVerifier,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private isAdminEmail(email: string): boolean {
    return this.env.ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email);
  }

  async verifyOtp(email: string, code: string, userAgent?: string): Promise<AuthSession> {
    await this.otp.verify(email, code);
    const user = await this.findOrCreate({ email, provider: 'EMAIL' });
    return this.session(user, 'EMAIL', userAgent);
  }

  async oauthLogin(provider: OAuthProviderName, idToken: string, name: string | undefined, userAgent?: string): Promise<AuthSession> {
    const identity = await this.oauth.verify(provider, idToken);
    const authProvider: AuthProvider = provider === 'apple' ? 'APPLE' : 'GOOGLE';
    const bySubject = await this.prisma.user.findFirst({
      where: { authProvider, providerSubject: identity.subject, deletedAt: null },
      include: { subscription: true },
    });
    if (bySubject) return this.session(bySubject, authProvider, userAgent);
    if (!identity.emailVerified) {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Seu e-mail precisa estar verificado no provedor.');
    }
    const user = await this.findOrCreate({ email: identity.email, provider: authProvider, subject: identity.subject, name });
    return this.session(user, authProvider, userAgent);
  }

  /** Creates user + FREE subscription + LGPD consents on first login; promotes ADMIN_EMAILS. */
  private async findOrCreate(input: { email: string; provider: AuthProvider; subject?: string; name?: string }): Promise<UserWithSubscription> {
    const admin = this.isAdminEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email }, include: { subscription: true } });
    if (existing) {
      const data: { role?: 'ADMIN'; providerSubject?: string } = {};
      if (admin && existing.role !== 'ADMIN') data.role = 'ADMIN';
      if (input.subject && !existing.providerSubject && existing.authProvider === input.provider) data.providerSubject = input.subject;
      if (Object.keys(data).length === 0) return existing;
      return this.prisma.user.update({ where: { id: existing.id }, data, include: { subscription: true } });
    }
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        authProvider: input.provider,
        providerSubject: input.subject ?? null,
        role: admin ? 'ADMIN' : 'USER',
        subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        consents: {
          create: [
            { kind: 'terms', version: this.env.TERMS_VERSION },
            { kind: 'privacy', version: this.env.TERMS_VERSION },
          ],
        },
      },
      include: { subscription: true },
    });
    await this.audit.log(user.id, 'user.created', { provider: input.provider });
    return user;
  }

  private async session(user: UserWithSubscription, provider: AuthProvider, userAgent?: string): Promise<AuthSession> {
    const tokens = await this.tokens.issue({ id: user.id, email: user.email, role: user.role }, userAgent);
    await this.audit.log(user.id, 'auth.login', { provider });
    return { ...tokens, user: toUserDto(user) };
  }
}
