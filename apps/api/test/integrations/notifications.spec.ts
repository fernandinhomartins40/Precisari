import './env-setup';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationsModule } from '../../src/notifications/notifications.module';
import { NotificationsService, dailySummaryText } from '../../src/notifications/notifications.service';
import { JobsRegistry } from '../../src/jobs/jobs.registry';
import { createProperty, createTestApp, createUser, day, resetDb, type TestApp } from './helpers';

describe('Notifications (RF-50/51/52)', () => {
  let t: TestApp;
  let svc: NotificationsService;

  beforeAll(async () => {
    t = await createTestApp([NotificationsModule]);
    svc = t.get(NotificationsService);
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.fakes.push.sent.length = 0;
    t.fakes.push.unregistered.clear();
    t.fakes.email.sent.length = 0;
  });

  async function hostWithPending(opts: { timezone?: string; hour?: number; token?: string; gains?: number[] } = {}) {
    const user = await createUser(t.prisma, { timezone: opts.timezone ?? 'America/Sao_Paulo', dailyNotificationHour: opts.hour ?? 9 });
    const prop = await createProperty(t.prisma, user.id);
    await t.prisma.deviceToken.create({ data: { userId: user.id, expoPushToken: opts.token ?? `ExponentPushToken[${user.id}]`, platform: 'ios' } });
    for (const [i, g] of (opts.gains ?? [10000, 12000, 6000]).entries()) {
      await t.prisma.action.create({
        data: { propertyId: prop.id, date: day(`2026-11-${String(14 + i).padStart(2, '0')}`), type: 'PRICE', fromValue: 25900, toValue: 25900 + g, estimatedGain: g },
      });
    }
    return { user, prop };
  }

  it('registers the hourly daily job and the weekly job', () => {
    const registry = t.get(JobsRegistry);
    expect(registry.get('notifications.daily')?.repeat).toEqual({ pattern: '0 * * * *' });
    expect(registry.get('notifications.weekly')?.repeat).toEqual({ pattern: '0 12 * * 1' });
  });

  it('formats the summary like the PRD', () => {
    expect(dailySummaryText(3, 28000)).toBe('3 ajustes para hoje · +R$ 280 estimado');
    expect(dailySummaryText(1, 0)).toBe('1 ajuste para hoje');
  });

  it('sends only at the user local hour, once per day', async () => {
    const { user } = await hostWithPending();
    const manaus = await hostWithPending({ timezone: 'America/Manaus' });
    // 12:10 UTC = 09:10 in São Paulo, 08:10 in Manaus
    expect(await svc.sendDailySummaries(new Date('2026-11-09T12:10:00Z'))).toBe(1);
    expect(t.fakes.push.sent).toHaveLength(1);
    expect(t.fakes.push.sent[0]).toMatchObject({ to: `ExponentPushToken[${user.id}]`, body: '3 ajustes para hoje · +R$ 280 estimado' });

    expect(await svc.sendDailySummaries(new Date('2026-11-09T12:50:00Z'))).toBe(0);
    // 13:05 UTC = 09:05 in Manaus
    expect(await svc.sendDailySummaries(new Date('2026-11-09T13:05:00Z'))).toBe(1);
    expect(t.fakes.push.sent[1]?.to).toBe(`ExponentPushToken[${manaus.user.id}]`);
    // next day again
    expect(await svc.sendDailySummaries(new Date('2026-11-10T12:10:00Z'))).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'notification.daily' } })).toBe(3);
  });

  it('skips users without pending actions and prunes unregistered devices', async () => {
    const idle = await createUser(t.prisma);
    await t.prisma.deviceToken.create({ data: { userId: idle.id, expoPushToken: 'ExponentPushToken[idle]', platform: 'ios' } });
    const { user } = await hostWithPending({ token: 'ExponentPushToken[dead]' });
    await t.prisma.deviceToken.create({ data: { userId: user.id, expoPushToken: 'ExponentPushToken[alive]', platform: 'android' } });
    t.fakes.push.unregistered.add('ExponentPushToken[dead]');
    expect(await svc.sendDailySummaries(new Date('2026-11-09T12:00:00Z'))).toBe(1);
    expect(t.fakes.push.sent.map((m) => m.to).sort()).toEqual(['ExponentPushToken[alive]', 'ExponentPushToken[dead]']);
    expect(await t.prisma.deviceToken.findUnique({ where: { expoPushToken: 'ExponentPushToken[dead]' } })).toBeNull();
    expect(await t.prisma.deviceToken.count()).toBe(2);
  });

  it('alerts a broken iCal once per break (push + e-mail) and re-arms after recovery', async () => {
    const { user, prop } = await hostWithPending();
    const src = await t.prisma.calendarSource.create({ data: { propertyId: prop.id, status: 'ERROR', lastError: 'HTTP 404' } });
    expect(await svc.scanBrokenCalendars()).toBe(1);
    expect(t.fakes.push.sent[0]?.title).toBe('Calendário fora do ar');
    expect(t.fakes.email.sent).toHaveLength(1);
    expect(t.fakes.email.sent[0]?.to).toBe(user.email);
    expect(await svc.scanBrokenCalendars()).toBe(0);

    await t.prisma.calendarSource.update({ where: { id: src.id }, data: { status: 'OK' } });
    expect(await svc.scanBrokenCalendars()).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'notification.ical_recovered' } })).toBe(1);
    await t.prisma.calendarSource.update({ where: { id: src.id }, data: { status: 'ERROR' } });
    expect(await svc.scanBrokenCalendars()).toBe(1);
    expect(t.fakes.email.sent).toHaveLength(2);
  });

  it('dedupes generic alerts by key', async () => {
    const { user, prop } = await hostWithPending();
    const data = { kind: 'weather_weekend' as const, propertyId: prop.id, propertyName: prop.name, date: '2026-11-14', direction: 'rain' as const };
    expect(await svc.alert(user.id, data, 'k1')).toBe(true);
    expect(await svc.alert(user.id, data, 'k1')).toBe(false);
    expect(t.fakes.push.sent[0]?.body).toContain('Chuva prevista para sábado (14/11)');
    expect(t.fakes.email.sent).toHaveLength(0);
  });

  it('sends the weekly summary e-mail once per week to opted-in users', async () => {
    const { user, prop } = await hostWithPending();
    const optedOut = await createUser(t.prisma, { emailWeeklySummary: false });
    await createProperty(t.prisma, optedOut.id);
    await t.prisma.action.create({
      data: { propertyId: prop.id, date: day('2026-11-05'), type: 'PRICE', fromValue: 25900, toValue: 28900, estimatedGain: 3000, status: 'APPROVED', decidedAt: new Date('2026-11-05T12:00:00Z') },
    });
    const now = new Date('2026-11-09T12:00:00Z');
    expect(await svc.sendWeeklySummaries(now)).toBe(1);
    expect(await svc.sendWeeklySummaries(now)).toBe(0);
    const mail = t.fakes.email.sent[0];
    expect(mail?.to).toBe(user.email);
    expect(mail?.subject).toContain('+R$ 280');
    expect(mail?.text).toContain('1 ajuste(s) aprovado(s) · +R$ 30 estimado');
    expect(mail?.text).toContain('3 ajuste(s) pendente(s) · +R$ 280 em jogo');
  });
});
