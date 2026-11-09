import './env-setup';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { PlanDto } from '@precisari/shared';
import { BillingModule } from '../../src/billing/billing.module';
import { IntegrationError } from '../../src/integrations/common/http';
import { UsersModule } from '../../src/users/users.module';
import { signFakeWebhook } from '../../src/integrations/billing/fake-billing.adapter';
import { createProperty, createTestApp, createUser, resetDb, tokenFor, type TestApp } from './helpers';

const SECRET = 'test-webhook-secret';

describe('Billing API (RF-70/71/72)', () => {
  let t: TestApp;
  let user: User;
  let token: string;
  const http = () => request(t.app.getHttpServer());
  const checkoutBody = { plan: 'PRO', cycle: 'MONTHLY', paymentMethod: 'PIX', propertyCount: 2 };

  function sendWebhook(payload: unknown, secret = SECRET) {
    const raw = JSON.stringify(payload);
    return http().post('/v1/billing/webhook').set('content-type', 'application/json').set('x-precisari-signature', signFakeWebhook(raw, secret)).send(raw);
  }

  beforeAll(async () => {
    t = await createTestApp([BillingModule, UsersModule]);
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.fakes.billing.checkouts.length = 0;
    user = await createUser(t.prisma);
    token = await tokenFor(user);
  });

  it('lists public plans with yearly = 10× monthly and a 14-day trial', async () => {
    const r = await http().get('/v1/billing/plans');
    expect(r.status).toBe(200);
    const plans = PlanDto.array().parse(r.body);
    expect(plans.map((p) => [p.plan, p.monthlyPricePerProperty, p.yearlyPricePerProperty, p.horizonDays, p.trialDays])).toEqual([
      ['FREE', 0, 0, 30, 0],
      ['PRO', 2990, 29900, 180, 14],
      ['AUTO', 4490, 44900, 180, 14],
    ]);
    expect(plans[0]?.maxProperties).toBe(1);
  });

  it('charges at the end of the trial, then today, and cancels the subscription it replaces', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const first = await http().post('/v1/billing/checkout').set(auth).send(checkoutBody);
    expect(first.status).toBe(201);
    const inTrial = t.fakes.billing.checkouts[0]!.firstDueDate;
    expect(new Date(inTrial).getTime() - Date.now()).toBeGreaterThan(12.9 * 86_400_000);
    const { providerRef } = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });

    t.fakes.billing.canceled.length = 0;
    await http().post('/v1/billing/checkout').set(auth).send({ ...checkoutBody, plan: 'AUTO' });
    expect(new Date(t.fakes.billing.checkouts[1]!.firstDueDate).getTime() - Date.now()).toBeLessThan(1.1 * 86_400_000);
    expect(t.fakes.billing.canceled).toEqual([providerRef]);
    const replaced = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(replaced.providerRef).not.toBe(providerRef);
  });

  it('account deletion cancels the gateway subscription, and aborts if it cannot', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await http().post('/v1/billing/checkout').set(auth).send(checkoutBody);
    const { providerRef } = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    t.fakes.billing.canceled.length = 0;

    const realCancel = t.fakes.billing.cancel;
    t.fakes.billing.cancel = async () => {
      throw new IntegrationError('billing', 'down', 503);
    };
    expect((await http().delete('/v1/me').set(auth)).status).toBe(502);
    t.fakes.billing.cancel = realCancel;
    const kept = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(kept.deletedAt).toBeNull();

    expect((await http().delete('/v1/me').set(auth)).status).toBe(204);
    expect(t.fakes.billing.canceled).toEqual([providerRef]);
    const sub = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.status).toBe('CANCELED');
  });

  it('checkout requires auth and validates the body', async () => {
    expect((await http().post('/v1/billing/checkout').send(checkoutBody)).status).toBe(401);
    const bad = await http().post('/v1/billing/checkout').set('Authorization', `Bearer ${token}`).send({ plan: 'FREE', paymentMethod: 'PIX' });
    expect(bad.status).toBe(400);
  });

  it('starts a trial on first checkout and honors Idempotency-Key', async () => {
    const key = 'idem-key-0001';
    const r1 = await http().post('/v1/billing/checkout').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(checkoutBody);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ status: 'PENDING', redirectUrl: null, boletoUrl: null });
    expect(r1.body.pixCopyPaste).toContain('59.80');
    expect(t.fakes.billing.checkouts[0]).toMatchObject({ amountCents: 5980, plan: 'PRO', propertyCount: 2 });

    const r2 = await http().post('/v1/billing/checkout').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(checkoutBody);
    expect(r2.body).toEqual(r1.body);
    expect(t.fakes.billing.checkouts).toHaveLength(1);

    const sub = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub).toMatchObject({ plan: 'PRO', status: 'TRIALING', provider: 'fake', propertyCount: 2 });
    expect(sub.trialEndsAt!.getTime() - Date.now()).toBeGreaterThan(13.9 * 86_400_000);

    // A new checkout (different key) after the trial was used does not restart it.
    await t.prisma.subscription.update({ where: { userId: user.id }, data: { status: 'EXPIRED', plan: 'FREE' } });
    const r3 = await http().post('/v1/billing/checkout').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'idem-key-0002').send({ ...checkoutBody, cycle: 'YEARLY', paymentMethod: 'CARD', plan: 'AUTO', propertyCount: 1 });
    expect(r3.body.redirectUrl).toContain('/checkout/fake/');
    expect(t.fakes.billing.checkouts[1]?.amountCents).toBe(44900);
    const after = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(after).toMatchObject({ plan: 'FREE', status: 'EXPIRED' });
    expect(after.providerRef).not.toBe(sub.providerRef);
  });

  it('webhook: rejects bad signatures, applies events once and updates the subscription', async () => {
    await http().post('/v1/billing/checkout').set('Authorization', `Bearer ${token}`).send(checkoutBody);
    const sub = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    const event = {
      id: 'evt_001', type: 'subscription.activated', providerRef: sub.providerRef, plan: 'PRO', currentPeriodEnd: '2026-12-09T12:00:00.000Z',
    };

    const bad = await sendWebhook(event, 'wrong-secret');
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');

    const ok = await sendWebhook(event);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ received: true, duplicate: false, applied: true });
    const updated = await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(updated).toMatchObject({ status: 'ACTIVE', plan: 'PRO' });
    expect(updated.currentPeriodEnd?.toISOString()).toBe('2026-12-09T12:00:00.000Z');

    const dup = await sendWebhook(event);
    expect(dup.body).toEqual({ received: true, duplicate: true, applied: false });
    expect(await t.prisma.webhookEvent.count()).toBe(1);

    await sendWebhook({ id: 'evt_002', type: 'subscription.past_due', providerRef: sub.providerRef });
    expect((await t.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })).status).toBe('PAST_DUE');

    const invalid = await sendWebhook({ id: 'evt_003', type: 'subscription.exploded', providerRef: 'x' });
    expect(invalid.status).toBe(400);

    // Unknown providerRef but known userId: creates the subscription.
    const other = await createUser(t.prisma);
    const created = await sendWebhook({ id: 'evt_004', type: 'subscription.activated', providerRef: 'sub_other', userId: other.id, plan: 'AUTO' });
    expect(created.body.applied).toBe(true);
    expect(await t.prisma.subscription.findUniqueOrThrow({ where: { userId: other.id } })).toMatchObject({ plan: 'AUTO', status: 'ACTIVE' });
  });

  it('channex connect: PRO/AUTO only, creates a CHANNEX calendar source', async () => {
    const prop = await createProperty(t.prisma, user.id);
    const auth = { Authorization: `Bearer ${token}` };
    const free = await http().post('/v1/integrations/channex/connect').set(auth).send({ propertyId: prop.id });
    expect(free.status).toBe(403);
    expect(free.body.code).toBe('PLAN_LIMIT');

    await t.prisma.subscription.create({ data: { userId: user.id, plan: 'PRO', status: 'ACTIVE' } });
    const ok = await http().post('/v1/integrations/channex/connect').set(auth).send({ propertyId: prop.id });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ propertyId: prop.id, channexPropertyId: `fake-channex-${prop.id}`, status: 'CONNECTED' });
    const sources = await t.prisma.calendarSource.findMany({ where: { propertyId: prop.id } });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ type: 'CHANNEX', status: 'OK', channexPropertyId: `fake-channex-${prop.id}` });

    const otherUser = await createUser(t.prisma);
    await t.prisma.subscription.create({ data: { userId: otherUser.id, plan: 'AUTO', status: 'TRIALING' } });
    const notMine = await http().post('/v1/integrations/channex/connect').set('Authorization', `Bearer ${await tokenFor(otherUser)}`).send({ propertyId: prop.id });
    expect(notMine.status).toBe(404);
  });

  it('channex webhook stub stores the event and returns 202', async () => {
    const r = await http().post('/v1/integrations/channex/webhook').send({ id: 'cx_evt_1', event: 'booking_new' });
    expect(r.status).toBe(202);
    await http().post('/v1/integrations/channex/webhook').send({ id: 'cx_evt_1', event: 'booking_new' });
    expect(await t.prisma.webhookEvent.count({ where: { provider: 'channex' } })).toBe(1);
  });
});
