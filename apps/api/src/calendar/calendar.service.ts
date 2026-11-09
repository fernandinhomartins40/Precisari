import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { CalendarSource } from '@prisma/client';
import { ErrorCode, type CalendarSourceDto, type SyncResultDto } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { DATA_CIPHER } from '../common/cipher.provider';
import { sha256, type DataCipher } from '../common/crypto';
import { addDays, isoToDate, todayInTz } from '../common/dates';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { JobQueueService } from '../jobs/job-queue.service';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { toCalendarSourceDto } from '../properties/property.mapper';
import { IcalFetchError, fetchIcal, maskIcalUrl, normalizeIcalUrl } from './ical-fetcher';
import { IcalParseError, parseIcalBookings, type ParsedBooking } from './ical-parser';

const ICAL_SOURCE = 'ical';
const INVALID_FEED_MSG = 'Esse link não é um calendário iCal. No Airbnb, copie o link em "Exportar calendário".';

@Injectable()
export class CalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly jobs: JobQueueService,
    private readonly registry: JobsRegistry,
    private readonly audit: AuditService,
    @Inject(DATA_CIPHER) private readonly cipher: DataCipher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    // RF-20: every 30 minutes for all iCal sources (or one property on demand).
    this.registry.register(QUEUES.icalSync, (d) => this.syncJob(d.propertyId), { pattern: '*/30 * * * *' });
  }

  private get allowPrivate(): boolean {
    if (this.env.ICAL_ALLOW_PRIVATE_HOSTS !== undefined) return this.env.ICAL_ALLOW_PRIVATE_HOSTS === 'true';
    return this.env.NODE_ENV !== 'production';
  }

  private download(url: string): Promise<string> {
    return fetchIcal(url, { timeoutMs: this.env.ICAL_FETCH_TIMEOUT_MS, maxBytes: this.env.ICAL_MAX_BYTES, allowPrivateHosts: this.allowPrivate });
  }

  /** RF-20/21: validates the link right away (fetch + parse), stores it encrypted and imports bookings. */
  async connect(userId: string, propertyId: string, rawUrl: string): Promise<CalendarSourceDto> {
    const property = await this.properties.getOwned(userId, propertyId);
    let url: string;
    let content: string;
    let bookings: ParsedBooking[];
    try {
      url = normalizeIcalUrl(rawUrl).toString();
      content = await this.download(url);
      bookings = parseIcalBookings(content);
    } catch (err) {
      if (err instanceof IcalFetchError) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.ICAL_INVALID, err.userMessage);
      if (err instanceof IcalParseError) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.ICAL_INVALID, INVALID_FEED_MSG);
      throw err;
    }
    const existing = property.calendarSources.find((s) => s.type === 'ICAL');
    const data = { urlEncrypted: this.cipher.encrypt(url), urlMasked: maskIcalUrl(url), contentHash: null, status: 'PENDING' as const, lastError: null, consecutiveErrors: 0 };
    const source = existing
      ? await this.prisma.calendarSource.update({ where: { id: existing.id }, data })
      : await this.prisma.calendarSource.create({ data: { ...data, propertyId, type: 'ICAL' } });
    await this.audit.log(userId, 'ical.connected', { propertyId, sourceId: source.id });
    await this.applyFeed(source, property.timezone, content, bookings);
    const fresh = await this.prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
    return toCalendarSourceDto(fresh);
  }

  /** POST /properties/:id/sync (pull-to-refresh). */
  async syncForUser(userId: string, propertyId: string): Promise<SyncResultDto> {
    const property = await this.properties.getOwned(userId, propertyId);
    const source = property.calendarSources.find((s) => s.type === 'ICAL' && s.urlEncrypted);
    if (!source) {
      await this.jobs.enqueue(QUEUES.pricingRecompute, { propertyId, reason: 'manual' });
      return { status: 'PENDING', bookingsImported: 0, changed: false, lastSyncAt: null, error: null };
    }
    return this.syncSource(source, property.timezone);
  }

  async syncJob(propertyId?: string): Promise<void> {
    const sources = await this.prisma.calendarSource.findMany({
      where: { type: 'ICAL', urlEncrypted: { not: null }, property: { deletedAt: null, ...(propertyId ? { id: propertyId } : {}) } },
      include: { property: { select: { timezone: true } } },
    });
    for (const s of sources) {
      await this.syncSource(s, s.property.timezone).catch((err: unknown) => this.logger.error({ err, sourceId: s.id }, 'ical sync crashed'));
    }
  }

  /** Fetch → hash → parse → upsert. Never throws for feed problems; tracks consecutive errors (RF-22). */
  async syncSource(source: CalendarSource, timezone: string): Promise<SyncResultDto> {
    let content: string;
    let bookings: ParsedBooking[];
    try {
      if (!source.urlEncrypted) throw new IcalFetchError('no url', 'Calendário sem link.');
      content = await this.download(this.cipher.decrypt(source.urlEncrypted));
      bookings = parseIcalBookings(content);
    } catch (err) {
      const message =
        err instanceof IcalFetchError ? err.userMessage : err instanceof IcalParseError ? INVALID_FEED_MSG : 'Erro inesperado ao ler o calendário.';
      return this.recordFailure(source, message, err);
    }
    return this.applyFeed(source, timezone, content, bookings);
  }

  private async recordFailure(source: CalendarSource, message: string, err: unknown): Promise<SyncResultDto> {
    const consecutiveErrors = source.consecutiveErrors + 1;
    const broken = consecutiveErrors >= this.env.ICAL_ERROR_THRESHOLD;
    const updated = await this.prisma.calendarSource.update({
      where: { id: source.id },
      data: { consecutiveErrors, lastError: message, ...(broken ? { status: 'ERROR' } : {}) },
      include: { property: { select: { userId: true } } },
    });
    this.logger.warn({ sourceId: source.id, consecutiveErrors, err: err instanceof Error ? err.message : String(err) }, 'ical sync failed');
    if (broken && source.status !== 'ERROR') {
      // RF-22: the notifications workstream reads broken calendars (status ERROR) and alerts the host.
      await this.audit.log(updated.property.userId, 'ical.broken', { propertyId: source.propertyId, sourceId: source.id, lastError: message });
    }
    return { status: updated.status, bookingsImported: 0, changed: false, lastSyncAt: updated.lastSyncAt?.toISOString() ?? null, error: message };
  }

  private async applyFeed(source: CalendarSource, timezone: string, content: string, bookings: ParsedBooking[]): Promise<SyncResultDto> {
    const hash = sha256(content);
    const changed = hash !== source.contentHash;
    const now = new Date();
    if (changed) await this.upsertBookings(source.propertyId, timezone, bookings);
    const recovered = source.status === 'ERROR';
    const updated = await this.prisma.calendarSource.update({
      where: { id: source.id },
      data: { contentHash: hash, lastSyncAt: now, status: 'OK', lastError: null, consecutiveErrors: 0 },
    });
    if (recovered) this.logger.log({ sourceId: source.id }, 'ical recovered');
    if (changed) await this.jobs.enqueue(QUEUES.pricingRecompute, { propertyId: source.propertyId, reason: 'ical.changed' }, { jobId: `recompute:${source.propertyId}` });
    return {
      status: updated.status,
      bookingsImported: bookings.length,
      changed,
      lastSyncAt: now.toISOString(),
      error: null,
    };
  }

  /**
   * Upserts feed bookings; bookings missing from the feed are marked CANCELLED only when they are not in the
   * past (Airbnb drops old reservations from the feed — history must be kept for insights/baseline).
   */
  private async upsertBookings(propertyId: string, timezone: string, bookings: ParsedBooking[]): Promise<void> {
    const today = todayInTz(timezone);
    const uids = bookings.map((b) => b.externalUid);
    await this.prisma.$transaction([
      ...bookings.map((b) =>
        this.prisma.booking.upsert({
          where: { propertyId_source_externalUid: { propertyId, source: ICAL_SOURCE, externalUid: b.externalUid } },
          create: { propertyId, source: ICAL_SOURCE, externalUid: b.externalUid, checkIn: isoToDate(b.checkIn), checkOut: isoToDate(b.checkOut), status: b.status },
          update: { checkIn: isoToDate(b.checkIn), checkOut: isoToDate(b.checkOut), status: b.status },
        }),
      ),
      this.prisma.booking.updateMany({
        where: {
          propertyId,
          source: ICAL_SOURCE,
          status: { not: 'CANCELLED' },
          externalUid: { notIn: uids },
          checkOut: { gt: isoToDate(addDays(today, 0)) },
        },
        data: { status: 'CANCELLED' },
      }),
    ]);
  }
}
