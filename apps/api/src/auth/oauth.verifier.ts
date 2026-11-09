import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ErrorCode } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export type OAuthProviderName = 'apple' | 'google';

export interface OAuthIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
}

export const OAUTH_VERIFIER = Symbol('OAUTH_VERIFIER');

/** Verifies a social-login idToken. Throws NOT_IMPLEMENTED (501) when the provider is not configured. */
export interface OAuthVerifier {
  verify(provider: OAuthProviderName, idToken: string): Promise<OAuthIdentity>;
}

const PROVIDERS: Record<OAuthProviderName, { jwks: string; issuer: string[] }> = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuer: ['https://accounts.google.com', 'accounts.google.com'] },
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuer: ['https://appleid.apple.com'] },
};

/**
 * JWKS-based idToken verification (signature, issuer, audience = client id).
 * TODO(M0): move behind an adapter in src/integrations/ (owned by the integrations workstream), add
 * Apple nonce checks and multiple audiences (iOS bundle id + web service id) once credentials exist.
 */
@Injectable()
export class JwksOAuthVerifier implements OAuthVerifier {
  private readonly keySets = new Map<OAuthProviderName, JWTVerifyGetKey>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  async verify(provider: OAuthProviderName, idToken: string): Promise<OAuthIdentity> {
    const audience = provider === 'apple' ? this.env.APPLE_CLIENT_ID : this.env.GOOGLE_CLIENT_ID;
    if (!audience) {
      throw new AppError(HttpStatus.NOT_IMPLEMENTED, ErrorCode.NOT_IMPLEMENTED, 'Login social ainda não está disponível. Use seu e-mail.');
    }
    let keys = this.keySets.get(provider);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(PROVIDERS[provider].jwks));
      this.keySets.set(provider, keys);
    }
    try {
      const { payload } = await jwtVerify(idToken, keys, { issuer: PROVIDERS[provider].issuer, audience });
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
      if (!payload.sub || !email) throw new Error('missing claims');
      const verified = payload.email_verified === true || payload.email_verified === 'true';
      return { subject: payload.sub, email, emailVerified: verified };
    } catch {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Não foi possível confirmar seu login. Tente de novo.');
    }
  }
}
