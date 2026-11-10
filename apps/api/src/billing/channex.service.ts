import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { CalendarSource, Prisma, Property } from '@prisma/client';
import { ErrorCode, type ChannexConnectDto, type ChannexState, type ChannexStatusDto } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { addDays, isoToDate, todayInTz } from '../common/dates';
import { PlanService } from '../common/plan.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { toAppError } from '../integrations/common/errors';
import { CHANNEX_PROVIDER, type ChannexProvider, type ChannexRate } from '../integrations/ports';
import { JobQueueService } from '../jobs/job-queue.service';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { PRICE_FAMILY } from '../recommendations/action-generator';
import { PriceStateService } from '../recommendations/price-state.service';
import { BillingService } from './billing.service';

/** Channex certification asks for a full sync covering 500 days. Beyond the plan horizon we send the base price. */
export const FULL_SYNC_DAYS = 500;
const CHANNEX_SOURCE = 'channex';
/** Pushes for one property are coalesced in 15 s windows: at most 4 ARI calls/min, under Channex's 20/min. */
const PUSH_WINDOW_MS = 15_000;

/** Debounced push of one property's prices (no-op unless it is linked to Channex). Safe to call from anywhere. */
export function enqueueChannexPush(jobs: JobQueueService, propertyId: string): Promise<void> {
  const bucket = Math.floor(Date.now() / PUSH_WINDOW_MS);
  return jobs.enqueue(QUEUES.channexPush, { propertyId }, { jobId: `channex-push:${propertyId}:${bucket}`, delayMs: PUSH_WINDOW_MS });
}

type ChannexSource = CalendarSource & { channexPropertyId: string; channexRatePlanId: string };
const isProvisioned = (s: CalendarSource | null | undefined): s is ChannexSource => !!s?.channexPropertyId && !!s.channexRatePlanId;

/** RF-23/RF-43 (M7): Airbnb through Channex — provisioning, price push and bookings. */
@Injectable()
export class ChannexService implements OnModuleInit {
  private readonly logger = new Logger(ChannexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly plans: PlanService,
    private readonly priceState: PriceStateService,
    private readonly jobs: JobQueueService,
    private readonly registry: JobsRegistry,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(CHANNEX_PROVIDER) private readonly channex: ChannexProvider,
  ) {}

  onModuleInit(): void {
    // Daily full sync (certification) at 04:00, after the 03:00 recompute; on demand per property.
    this.registry.register(QUEUES.channexPush, (d) => (d.propertyId ? this.push(d.propertyId) : this.pushAll()), { pattern: '0 4 * * *', tz: 'America/Sao_Paulo' });
    // Webhooks trigger this right away; polling every 20 min catches anything a webhook missed.
    this.registry.register(QUEUES.channexBookings, () => this.pullBookings(), { pattern: '*/20 * * * *' });
  }

  // ---------- host-facing ----------

  async status(userId: string, propertyId: string): Promise<ChannexStatusDto> {
    const property = await this.owned(userId, propertyId);
    let source = await this.source(property.id);
    if (isProvisioned(source) && !source.channexLinkedAt) source = await this.refreshLink(source);
    return this.toStatus(property.id, source);
  }

  async connect(userId: string, propertyId: string): Promise<ChannexConnectDto> {
    if (!(await this.billing.hasPaidPlan(userId))) {
      throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.PLAN_LIMIT, 'Conectar o Airbnb é um recurso dos planos Pro e Automático');
    }
    const property = await this.owned(userId, propertyId);
    let source = await this.source(property.id);
    try {
      if (!isProvisioned(source)) {
        const ids = await this.channex.connectProperty({
          propertyId: property.id,
          title: property.name,
          currency: 'BRL',
          timezone: property.timezone,
          capacity: property.capacity,
          basePriceCents: property.basePrice,
          webhook: { url: `${this.env.API_PUBLIC_URL}/v1/integrations/channex/webhook`, secret: this.env.CHANNEX_WEBHOOK_SECRET },
        });
        const data = { channexPropertyId: ids.channexPropertyId, channexRoomTypeId: ids.roomTypeId, channexRatePlanId: ids.ratePlanId, status: 'PENDING' as const, lastError: null };
        source = source
          ? await this.prisma.calendarSource.update({ where: { id: source.id }, data })
          : await this.prisma.calendarSource.create({ data: { ...data, propertyId: property.id, type: 'CHANNEX' } });
        await this.audit.log(userId, 'channex.connect', { propertyId: property.id, channexPropertyId: ids.channexPropertyId });
      }
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      const connectUrl = await this.channex.connectUrl(source.channexPropertyId as string, user.email);
      return { ...this.toStatus(property.id, source), connectUrl };
    } catch (err) {
      throw toAppError(err);
    }
  }

  async disconnect(userId: string, propertyId: string): Promise<ChannexStatusDto> {
    const property = await this.owned(userId, propertyId);
    const source = await this.source(property.id);
    if (source) {
      await this.prisma.calendarSource.delete({ where: { id: source.id } });
      // The Channex property bills per unit: remove it, but never fail the host's disconnect over it.
      if (source.channexPropertyId) {
        await this.channex.deleteProperty(source.channexPropertyId).catch((err: unknown) => this.logger.warn({ err, propertyId }, 'channex delete failed'));
      }
      await this.audit.log(userId, 'channex.disconnect', { propertyId, channexPropertyId: source.channexPropertyId });
    }
    return this.toStatus(property.id, null);
  }

  // ---------- jobs ----------

  async pushAll(): Promise<void> {
    const sources = await this.prisma.calendarSource.findMany({
      where: { type: 'CHANNEX', channexLinkedAt: { not: null }, property: { deletedAt: null } },
      select: { propertyId: true },
    });
    for (const s of sources) {
      await this.push(s.propertyId, { full: true }).catch((err: unknown) => this.logger.error({ err, propertyId: s.propertyId }, 'channex full sync failed'));
    }
  }

  /**
   * Sends the known price (RF-42: last approved, else base) and minimum stay for 500 days — only the nights that
   * changed since the last push unless `full`. AUTO plan (RF-43): pending suggestions are applied first, no approval.
   */
  async push(propertyId: string, opts: { full?: boolean } = {}): Promise<void> {
    const found = await this.source(propertyId);
    if (!isProvisioned(found)) return;
    const source = found.channexLinkedAt ? found : await this.refreshLink(found, false);
    if (!source.channexLinkedAt) return; // nothing reaches Airbnb before the host links the listing
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, deletedAt: null } });
    if (!property) return;

    const today = todayInTz(property.timezone);
    const end = addDays(today, FULL_SYNC_DAYS - 1);
    const now = new Date();
    if ((await this.plans.planFor(property.userId)) === 'AUTO') {
      await this.prisma.action.updateMany({
        where: { propertyId, status: 'PENDING', date: { gte: isoToDate(today) }, type: { in: [...PRICE_FAMILY, 'MIN_STAY'] } },
        data: { status: 'APPLIED', decidedAt: now, appliedAt: now },
      });
    }
    const state = await this.priceState.load(property, today, end);
    const previous = opts.full ? {} : toSnapshot(source.channexPushed);
    const snapshot: Record<string, string> = {};
    const rates: ChannexRate[] = [];
    for (let d = today; d <= end; d = addDays(d, 1)) {
      const rate = { date: d, priceCents: state.price(d), minStay: state.minStay(d) };
      snapshot[d] = `${rate.priceCents}/${rate.minStay}`;
      if (previous[d] !== snapshot[d]) rates.push(rate);
    }
    try {
      await this.channex.pushRates({ channexPropertyId: source.channexPropertyId, ratePlanId: source.channexRatePlanId }, rates);
    } catch (err) {
      await this.prisma.calendarSource.update({ where: { id: source.id }, data: { status: 'ERROR', lastError: 'Não conseguimos enviar os preços ao Airbnb. Vamos tentar de novo.' } });
      throw err; // BullMQ retries with backoff
    }
    await this.prisma.$transaction([
      this.prisma.calendarSource.update({ where: { id: source.id }, data: { channexPushed: snapshot, lastSyncAt: now, status: 'OK', lastError: null } }),
      this.prisma.action.updateMany({ where: { propertyId, status: 'APPROVED', date: { gte: isoToDate(today) } }, data: { status: 'APPLIED', appliedAt: now } }),
    ]);
    this.logger.debug({ propertyId, sent: rates.length, full: !!opts.full }, 'channex push');
  }

  /** Imports booking revisions (with real revenue), acknowledges them and recomputes the affected properties. */
  async pullBookings(): Promise<void> {
    const touched = new Set<string>();
    // Acked revisions leave the feed, so each page is new; the cap guards against a feed that never drains.
    for (let page = 0; page < 20; page++) {
      const revisions = await this.channex.bookingRevisions();
      if (revisions.length === 0) break;
      for (const r of revisions) {
        const source = await this.prisma.calendarSource.findFirst({ where: { type: 'CHANNEX', channexPropertyId: r.channexPropertyId }, select: { propertyId: true } });
        if (source) {
          const data = { checkIn: isoToDate(r.arrivalDate), checkOut: isoToDate(r.departureDate), status: r.status === 'cancelled' ? ('CANCELLED' as const) : ('BOOKED' as const), revenue: r.amountCents };
          await this.prisma.booking.upsert({
            where: { propertyId_source_externalUid: { propertyId: source.propertyId, source: CHANNEX_SOURCE, externalUid: r.bookingId } },
            create: { propertyId: source.propertyId, source: CHANNEX_SOURCE, externalUid: r.bookingId, ...data },
            update: data,
          });
          // shortcut: revenue is stored but insights still estimate (RF-62 phase 2); switch once Airbnb bookings flow in production.
          touched.add(source.propertyId);
        }
        // Unknown properties (deleted, or another app on the same Channex account) are acked too, or they block the feed.
        await this.channex.ackRevision(r.id);
      }
    }
    for (const propertyId of touched) {
      await this.jobs.enqueue(QUEUES.pricingRecompute, { propertyId, reason: 'channex.booking' }, { jobId: `recompute:${propertyId}` });
    }
  }

  // ---------- helpers ----------

  private async owned(userId: string, propertyId: string): Promise<Property> {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, userId, deletedAt: null } });
    if (!property) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Imóvel não encontrado');
    return property;
  }

  private source(propertyId: string): Promise<CalendarSource | null> {
    return this.prisma.calendarSource.findFirst({ where: { propertyId, type: 'CHANNEX' } });
  }

  /** Asks Channex whether Airbnb is linked yet; on the first link, sends the full calendar. */
  private async refreshLink<S extends ChannexSource>(source: S, pushOnLink = true): Promise<S> {
    const linked = await this.channex.hasActiveChannel(source.channexPropertyId).catch(() => false);
    if (!linked) return source;
    const updated = await this.prisma.calendarSource.update({ where: { id: source.id }, data: { channexLinkedAt: new Date(), status: 'OK', lastError: null } });
    if (pushOnLink) await enqueueChannexPush(this.jobs, source.propertyId);
    return updated as S;
  }

  private toStatus(propertyId: string, source: CalendarSource | null): ChannexStatusDto {
    const state: ChannexState = !isProvisioned(source) ? 'DISCONNECTED' : source.channexLinkedAt ? 'LINKED' : 'PENDING_LINK';
    return { propertyId, state, lastSyncAt: source?.lastSyncAt?.toISOString() ?? null, lastError: source?.lastError ?? null };
  }
}

function toSnapshot(raw: Prisma.JsonValue | null): Record<string, string> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
}
