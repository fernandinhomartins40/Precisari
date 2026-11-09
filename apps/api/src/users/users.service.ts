import { HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ErrorCode, type UpdateMeBody, type UserDto } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { toAppError } from '../integrations/common/errors';
import { BILLING_PROVIDER, type BillingProvider } from '../integrations/ports';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, type UserWithSubscription } from './user.mapper';

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const DAY_MS = 86_400_000;

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: JobsRegistry,
    @Inject(BILLING_PROVIDER) private readonly billing: BillingProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(QUEUES.retentionPurge, () => this.purgeExpired(), { pattern: '30 3 * * *', tz: 'America/Sao_Paulo' });
  }

  /** Retention promised in the privacy policy: login codes hold e-mails and Pix responses hold payment data. */
  async purgeExpired(now = new Date()): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } } }),
    ]);
  }

  private async active(userId: string): Promise<UserWithSubscription> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { subscription: true } });
    if (!user) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Faça login para continuar');
    return user;
  }

  async get(userId: string): Promise<UserDto> {
    return toUserDto(await this.active(userId));
  }

  async update(userId: string, body: UpdateMeBody): Promise<UserDto> {
    await this.active(userId);
    if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Fuso horário inválido', { field: 'timezone' });
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: body, include: { subscription: true } });
    return toUserDto(user);
  }

  /**
   * LGPD account deletion (RF-03): revokes sessions, deletes properties (cascade: calendars, bookings,
   * nights, actions), devices and pending OTPs, anonymizes the user row (kept soft-deleted for the audit
   * trail and billing reconciliation) and revokes consents. The gateway subscription is canceled first: if
   * that fails nothing is deleted and the user can retry, because a deleted account must never keep being charged.
   */
  async delete(userId: string): Promise<void> {
    const user = await this.active(userId);
    const sub = user.subscription;
    if (sub?.providerRef && sub.provider === this.billing.name) {
      try {
        await this.billing.cancel(sub.providerRef);
      } catch (err) {
        throw toAppError(err);
      }
    }
    const now = new Date();
    await this.prisma.$transaction([
      ...(sub ? [this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' as const } })] : []),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.property.deleteMany({ where: { userId } }),
      this.prisma.otpCode.deleteMany({ where: { email: user.email } }),
      this.prisma.idempotencyKey.deleteMany({ where: { userId } }),
      this.prisma.consent.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { email: `deleted+${userId}@deleted.precisari.invalid`, name: null, providerSubject: null, deletedAt: now, emailWeeklySummary: false },
      }),
    ]);
    await this.audit.log(userId, 'user.deleted', { at: now.toISOString() });
  }

  /** LGPD data export (RF-03): everything we store about the user, secrets excluded. */
  async export(userId: string): Promise<Record<string, unknown>> {
    const user = await this.active(userId);
    const [properties, devices, consents, auditLogs] = await Promise.all([
      this.prisma.property.findMany({
        where: { userId },
        include: {
          calendarSources: { select: { id: true, type: true, urlMasked: true, status: true, lastSyncAt: true, lastError: true, createdAt: true } },
          bookings: { select: { id: true, source: true, checkIn: true, checkOut: true, status: true, revenue: true, createdAt: true } },
          actions: {
            select: { id: true, date: true, type: true, fromValue: true, toValue: true, estimatedGain: true, status: true, decidedAt: true, appliedAt: true, createdAt: true },
          },
        },
      }),
      this.prisma.deviceToken.findMany({ where: { userId }, select: { platform: true, createdAt: true, lastSeenAt: true } }),
      this.prisma.consent.findMany({ where: { userId }, select: { kind: true, version: true, grantedAt: true, revokedAt: true } }),
      this.prisma.auditLog.findMany({ where: { userId }, select: { action: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    ]);
    await this.audit.log(userId, 'user.exported');
    return {
      exportedAt: new Date().toISOString(),
      user: toUserDto(user),
      properties: properties.map((p) => ({ ...p, deletedAt: p.deletedAt?.toISOString() ?? null })),
      devices,
      consents,
      auditLogs,
    };
  }
}
