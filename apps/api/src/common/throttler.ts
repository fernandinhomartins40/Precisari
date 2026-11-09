import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorage, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { InjectThrottlerOptions, InjectThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import { ErrorCode } from '@precisari/shared';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AppError } from './app-error';

/** Stricter limit for /auth/otp/* (read lazily so tests/ops can tune via env). */
export const otpRateLimit = (): number => Number(process.env.RATE_LIMIT_OTP_PER_MINUTE ?? 5) || 5;

/**
 * Rate limiting per user (verified access token `sub`) or, for anonymous requests, per IP.
 * Global guards run before route guards, so the token is verified here (cheap HS256) instead of relying on req.user.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly secret: Uint8Array;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    super(options, storage, reflector);
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const header = r.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const { payload } = await jwtVerify(header.slice(7), this.secret, { algorithms: ['HS256'] });
        if (payload.sub) return `user:${payload.sub}`;
      } catch {
        // fall through to IP
      }
    }
    return `ip:${r.ips?.length ? r.ips[0] : r.ip}`;
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Muitas tentativas. Aguarde um minuto e tente de novo.');
  }
}
