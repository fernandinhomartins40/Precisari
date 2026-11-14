import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { hmacSha256, randomOtpCode, safeEqual } from '../common/crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { otpEmail } from '../integrations/email/templates';
import { EMAIL_SENDER, type EmailSender } from '../integrations/ports';
import { PrismaService } from '../prisma/prisma.service';

const REQUEST_WINDOW_MS = 15 * 60_000;

export function hashOtp(secret: string, email: string, code: string): string {
  return hmacSha256(secret, `otp:${email}:${code}`);
}

export type OtpCheck = 'ok' | 'invalid' | 'expired' | 'too_many_attempts';

/** Pure decision for an OTP attempt against the latest active code. */
export function checkOtp(
  record: { codeHash: string; attempts: number; expiresAt: Date } | null,
  candidateHash: string,
  now: Date,
  maxAttempts: number,
): OtpCheck {
  if (!record) return 'invalid';
  if (record.attempts >= maxAttempts) return 'too_many_attempts';
  if (record.expiresAt.getTime() <= now.getTime()) return 'expired';
  return safeEqual(record.codeHash, candidateHash) ? 'ok' : 'invalid';
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  private get secret(): string {
    return this.env.OTP_HASH_SECRET || this.env.JWT_ACCESS_SECRET;
  }

  /** Always resolves (the controller answers 204 regardless) to avoid user enumeration. */
  async request(email: string): Promise<void> {
    const since = new Date(Date.now() - REQUEST_WINDOW_MS);
    const recent = await this.prisma.otpCode.count({ where: { email, createdAt: { gte: since } } });
    if (recent >= this.env.OTP_MAX_REQUESTS_PER_WINDOW) {
      this.logger.warn({ email: maskEmail(email) }, 'otp request limit reached; ignoring');
      return;
    }
    const review = !!this.env.REVIEW_LOGIN_CODE && this.env.REVIEW_LOGIN_EMAIL.includes(email);
    const code = review ? this.env.REVIEW_LOGIN_CODE : randomOtpCode();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: now } }),
      this.prisma.otpCode.create({
        data: { email, codeHash: hashOtp(this.secret, email, code), expiresAt: new Date(now.getTime() + this.env.OTP_TTL_SECONDS * 1000) },
      }),
    ]);
    // Store reviewers cannot read our inbox; the attempt and request limits above still apply.
    if (review) return;
    try {
      await this.email.send(otpEmail(email, code, Math.round(this.env.OTP_TTL_SECONDS / 60)));
    } catch (err) {
      this.logger.error({ err, email: maskEmail(email) }, 'otp email failed');
    }
  }

  /** Consumes the code or throws OTP_* errors. */
  async verify(email: string, code: string): Promise<void> {
    const record = await this.prisma.otpCode.findFirst({ where: { email, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    const result = checkOtp(record, hashOtp(this.secret, email, code), new Date(), this.env.OTP_MAX_ATTEMPTS);
    switch (result) {
      case 'ok':
        await this.prisma.otpCode.update({ where: { id: record!.id }, data: { consumedAt: new Date() } });
        return;
      case 'expired':
        throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.OTP_EXPIRED, 'Esse código expirou. Peça um novo.');
      case 'too_many_attempts':
        throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.OTP_TOO_MANY_ATTEMPTS, 'Tentativas demais. Peça um novo código.');
      case 'invalid':
        if (record) await this.prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
        throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.OTP_INVALID, 'Código incorreto. Confira e tente de novo.');
    }
  }
}

export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}
