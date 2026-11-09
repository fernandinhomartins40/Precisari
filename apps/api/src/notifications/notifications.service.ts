import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatBRL } from '@precisari/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { EMAIL_SENDER, PUSH_PROVIDER, type EmailSender, type PushMessage, type PushProvider } from '../integrations/ports';
import { icalBrokenEmail, weeklySummaryEmail, type WeeklySummaryProperty } from '../integrations/email/templates';
import { addDays, fromIsoDate, localDateHour, toIsoDate, weekdayLabel } from '../integrations/common/text';

/** Immediate alerts (RF-51). NO WhatsApp — push (Expo) and e-mail only. */
export type AlertData =
  | { kind: 'event_detected'; eventId: string; eventName: string; city: string; startDate: string }
  | { kind: 'weather_weekend'; propertyId: string; propertyName: string; date: string; direction: 'rain' | 'sun' }
  | { kind: 'ical_broken'; propertyId: string; propertyName: string; calendarSourceId: string };
export type AlertKind = AlertData['kind'];

export const AUDIT = {
  daily: 'notification.daily',
  weekly: 'notification.weekly',
  alert: 'notification.alert',
  icalRecovered: 'notification.ical_recovered',
} as const;

function brDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** "3 ajustes para hoje · +R$ 280 estimado" */
export function dailySummaryText(count: number, gainCents: number): string {
  const head = `${count} ${count === 1 ? 'ajuste' : 'ajustes'} para hoje`;
  return gainCents > 0 ? `${head} · ${formatBRL(gainCents, { whole: true, signed: true })} estimado` : head;
}

function alertPush(data: AlertData): Omit<PushMessage, 'to'> {
  switch (data.kind) {
    case 'event_detected':
      return {
        title: 'Evento detectado',
        body: `${data.eventName} em ${data.city} (${brDay(data.startDate)}). Veja as novas sugestões.`,
        data: { type: data.kind, eventId: data.eventId, url: '/calendar' },
      };
    case 'weather_weekend':
      return {
        title: 'A previsão mudou',
        body:
          data.direction === 'rain'
            ? `Chuva prevista para ${weekdayLabel(data.date).toLowerCase()} (${brDay(data.date)}) em ${data.propertyName}. Ajustamos as sugestões.`
            : `O sol voltou para ${weekdayLabel(data.date).toLowerCase()} (${brDay(data.date)}) em ${data.propertyName}. Vale revisar o preço.`,
        data: { type: data.kind, propertyId: data.propertyId, date: data.date, url: `/properties/${data.propertyId}/nights/${data.date}` },
      };
    case 'ical_broken':
      return {
        title: 'Calendário fora do ar',
        body: `Não conseguimos ler o calendário de ${data.propertyName}. Toque para reconectar.`,
        data: { type: data.kind, propertyId: data.propertyId, url: `/properties/${data.propertyId}` },
      };
  }
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger('NotificationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobsRegistry,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    // Hourly: each user gets the daily push at their own local hour (User.timezone + dailyNotificationHour).
    this.registry.register(QUEUES.notificationsDaily, (d) => this.runHourly(d).then(() => undefined), { pattern: '0 * * * *' });
    // Mondays 12:00 UTC = 9h in Brasília (Brazil has no DST since 2019).
    this.registry.register(QUEUES.notificationsWeekly, (d) => this.sendWeeklySummaries(new Date(), d.userId).then(() => undefined), {
      pattern: '0 12 * * 1',
    });
  }

  /** Send a push to every device of a user; deletes tokens Expo reports as DeviceNotRegistered. */
  async pushToUser(userId: string, msg: Omit<PushMessage, 'to'>): Promise<{ sent: number; removed: number }> {
    const devices = await this.prisma.deviceToken.findMany({ where: { userId }, select: { expoPushToken: true } });
    if (devices.length === 0) return { sent: 0, removed: 0 };
    const results = await this.push.send(devices.map((d) => ({ ...msg, to: d.expoPushToken })));
    const dead = results.filter((r) => r.error === 'DeviceNotRegistered').map((r) => r.token);
    if (dead.length > 0) await this.prisma.deviceToken.deleteMany({ where: { expoPushToken: { in: dead } } });
    const failed = results.filter((r) => !r.ok && r.error !== 'DeviceNotRegistered');
    if (failed.length > 0) this.log.warn(`push failures for user ${userId}: ${failed.map((f) => f.error).join(', ')}`);
    return { sent: results.filter((r) => r.ok).length, removed: dead.length };
  }

  async runHourly(payload: { userId?: string } = {}, now = new Date()): Promise<{ daily: number; icalAlerts: number }> {
    const daily = await this.sendDailySummaries(now, payload.userId);
    const icalAlerts = await this.scanBrokenCalendars();
    return { daily, icalAlerts };
  }

  /** RF-50: one push per user per local day, at the user's chosen hour, only with PENDING actions. */
  async sendDailySummaries(now = new Date(), userId?: string): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(userId ? { id: userId } : {}),
        devices: { some: {} },
        properties: { some: { deletedAt: null, actions: { some: { status: 'PENDING' } } } },
      },
      select: { id: true, timezone: true, dailyNotificationHour: true },
    });
    let sent = 0;
    for (const u of users) {
      const local = localDateHour(now, u.timezone);
      if (local.hour !== u.dailyNotificationHour) continue;
      const already = await this.prisma.auditLog.findFirst({
        where: { userId: u.id, action: AUDIT.daily, payload: { path: ['localDate'], equals: local.date } },
        select: { id: true },
      });
      if (already) continue;
      const agg = await this.prisma.action.aggregate({
        where: { status: 'PENDING', date: { gte: fromIsoDate(local.date) }, property: { userId: u.id, deletedAt: null } },
        _count: { _all: true },
        _sum: { estimatedGain: true },
      });
      const count = agg._count._all;
      if (count === 0) continue;
      const gain = Math.max(0, agg._sum.estimatedGain ?? 0);
      const res = await this.pushToUser(u.id, { title: 'Precisari', body: dailySummaryText(count, gain), data: { type: 'daily', url: '/today' } });
      if (res.sent === 0) continue;
      await this.prisma.auditLog.create({ data: { userId: u.id, action: AUDIT.daily, payload: { localDate: local.date, count, gain } } });
      sent++;
    }
    return sent;
  }

  /**
   * RF-51 immediate alert. `dedupeKey` guarantees at most one alert per key per user.
   * iCal broken also sends an e-mail.
   */
  async alert(userId: string, data: AlertData, dedupeKey?: string): Promise<boolean> {
    if (dedupeKey) {
      const dup = await this.prisma.auditLog.findFirst({
        where: { userId, action: AUDIT.alert, payload: { path: ['dedupeKey'], equals: dedupeKey } },
        select: { id: true },
      });
      if (dup) return false;
    }
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { email: true } });
    if (!user) return false;
    const push = await this.pushToUser(userId, alertPush(data));
    let emailed = false;
    if (data.kind === 'ical_broken') {
      try {
        await this.email.send(icalBrokenEmail(user.email, { propertyName: data.propertyName, appUrl: `${this.env.WEB_PUBLIC_URL}/app/properties/${data.propertyId}` }));
        emailed = true;
      } catch (err) {
        this.log.warn(`ical alert e-mail failed: ${(err as Error).message}`);
      }
    }
    if (push.sent === 0 && !emailed) return false;
    await this.prisma.auditLog.create({
      data: { userId, action: AUDIT.alert, payload: { ...data, dedupeKey: dedupeKey ?? null } as Prisma.InputJsonObject },
    });
    return true;
  }

  /** RF-22/RF-51: alert once per break for CalendarSources in ERROR; a recovery re-arms the alert. */
  async scanBrokenCalendars(): Promise<number> {
    // 1) Mark recoveries: sources alerted as broken that are no longer in ERROR.
    const since = new Date(Date.now() - 180 * 86_400_000);
    const brokenAlerts = await this.prisma.auditLog.findMany({
      where: { action: AUDIT.alert, createdAt: { gte: since }, payload: { path: ['kind'], equals: 'ical_broken' } },
      select: { payload: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'desc' },
    });
    const lastAlertBySource = new Map<string, { at: Date; userId: string | null }>();
    for (const a of brokenAlerts) {
      const id = (a.payload as { calendarSourceId?: string }).calendarSourceId;
      if (id && !lastAlertBySource.has(id)) lastAlertBySource.set(id, { at: a.createdAt, userId: a.userId });
    }
    if (lastAlertBySource.size > 0) {
      const current = await this.prisma.calendarSource.findMany({
        where: { id: { in: [...lastAlertBySource.keys()] } },
        select: { id: true, status: true },
      });
      const statusById = new Map(current.map((c) => [c.id, c.status]));
      for (const [id, last] of lastAlertBySource) {
        if (statusById.get(id) === 'ERROR') continue;
        const recovered = await this.lastRecovery(id);
        if (!recovered || recovered < last.at) {
          await this.prisma.auditLog.create({ data: { userId: last.userId, action: AUDIT.icalRecovered, payload: { calendarSourceId: id } } });
        }
      }
    }
    // 2) Alert current breaks.
    const errored = await this.prisma.calendarSource.findMany({
      where: { status: 'ERROR', property: { deletedAt: null } },
      select: { id: true, property: { select: { id: true, name: true, userId: true } } },
    });
    let alerts = 0;
    for (const src of errored) {
      const recovered = await this.lastRecovery(src.id);
      const ok = await this.alert(
        src.property.userId,
        { kind: 'ical_broken', propertyId: src.property.id, propertyName: src.property.name, calendarSourceId: src.id },
        `ical:${src.id}:${recovered?.getTime() ?? 0}`,
      );
      if (ok) alerts++;
    }
    return alerts;
  }

  private async lastRecovery(calendarSourceId: string): Promise<Date | null> {
    const r = await this.prisma.auditLog.findFirst({
      where: { action: AUDIT.icalRecovered, payload: { path: ['calendarSourceId'], equals: calendarSourceId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return r?.createdAt ?? null;
  }

  /** RF-52: weekly summary e-mail (Mondays) for users with emailWeeklySummary. Once per week per user. */
  async sendWeeklySummaries(now = new Date(), userId?: string): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, emailWeeklySummary: true, ...(userId ? { id: userId } : {}), properties: { some: { deletedAt: null } } },
      select: { id: true, email: true, name: true, timezone: true },
    });
    let sent = 0;
    for (const u of users) {
      const today = localDateHour(now, u.timezone).date;
      const already = await this.prisma.auditLog.findFirst({
        where: { userId: u.id, action: AUDIT.weekly, payload: { path: ['week'], equals: today } },
        select: { id: true },
      });
      if (already) continue;
      const weekStart = addDays(today, -7);
      const properties = await this.prisma.property.findMany({
        where: { userId: u.id, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });
      const summary: WeeklySummaryProperty[] = [];
      for (const p of properties) {
        const [approved, pending, top] = await Promise.all([
          this.prisma.action.aggregate({
            where: { propertyId: p.id, status: { in: ['APPROVED', 'APPLIED'] }, decidedAt: { gte: fromIsoDate(weekStart), lt: fromIsoDate(today) } },
            _count: { _all: true },
            _sum: { estimatedGain: true },
          }),
          this.prisma.action.aggregate({
            where: { propertyId: p.id, status: 'PENDING', date: { gte: fromIsoDate(today) } },
            _count: { _all: true },
            _sum: { estimatedGain: true },
          }),
          this.prisma.action.findMany({
            where: { propertyId: p.id, status: 'PENDING', date: { gte: fromIsoDate(today) } },
            orderBy: { estimatedGain: 'desc' },
            take: 3,
            select: { date: true, headline: true, toValue: true, type: true },
          }),
        ]);
        summary.push({
          name: p.name,
          approvedCount: approved._count._all,
          approvedGain: approved._sum.estimatedGain ?? 0,
          pendingCount: pending._count._all,
          pendingGain: pending._sum.estimatedGain ?? 0,
          highlights: top
            .filter((a) => a.type !== 'MIN_STAY')
            .map((a) => ({ date: toIsoDate(a.date), headline: a.headline ?? 'Ajuste sugerido', toValue: a.toValue })),
        });
      }
      try {
        await this.email.send(
          weeklySummaryEmail(u.email, {
            userName: u.name,
            weekLabel: `${brDay(weekStart)} a ${brDay(addDays(today, -1))}`,
            properties: summary,
            appUrl: `${this.env.WEB_PUBLIC_URL}/app`,
          }),
        );
      } catch (err) {
        this.log.warn(`weekly e-mail failed for ${u.id}: ${(err as Error).message}`);
        continue;
      }
      await this.prisma.auditLog.create({ data: { userId: u.id, action: AUDIT.weekly, payload: { week: today } } });
      sent++;
    }
    return sent;
  }
}
