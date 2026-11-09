import './env-setup';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExplanationsModule } from '../../src/explanations/explanations.module';
import { ExplanationsService, explanationCacheKey } from '../../src/explanations/explanations.service';
import { JobsRegistry } from '../../src/jobs/jobs.registry';
import { createProperty, createTestApp, createUser, day, resetDb, type TestApp } from './helpers';

describe('Explanations (RF-32)', () => {
  let t: TestApp;
  let svc: ExplanationsService;

  beforeAll(async () => {
    t = await createTestApp([ExplanationsModule]);
    svc = t.get(ExplanationsService);
  });
  afterAll(async () => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.fakes.llm.explainCalls = 0;
  });

  async function seed() {
    const user = await createUser(t.prisma);
    const prop = await createProperty(t.prisma, user.id);
    const factors = [
      { key: 'weekday', multiplier: 1.2, label: 'Sábado costuma lotar' },
      { key: 'event', multiplier: 1.3, label: 'Show a 2 km' },
    ];
    const night = await t.prisma.nightPrice.create({
      data: { propertyId: prop.id, date: day('2026-11-14'), suggestedPrice: 28900, minStay: 2, factors, heat: 0.8, factorsHash: 'hash-v1', engineVersion: 'test' },
    });
    const action = await t.prisma.action.create({
      data: { propertyId: prop.id, date: day('2026-11-14'), type: 'PRICE', fromValue: 25900, toValue: 28900, estimatedGain: 3000, headline: 'Ajuste sugerido', explanation: 'placeholder', factors },
    });
    // An action without NightPrice (hash computed from the action's own factors)
    const lone = await t.prisma.action.create({
      data: { propertyId: prop.id, date: day('2026-11-20'), type: 'MIN_STAY', fromValue: 1, toValue: 3, estimatedGain: 0, factors: [{ key: 'longWeekend', multiplier: 1.35, label: 'Feriadão' }] },
    });
    // Non-pending actions are ignored
    await t.prisma.action.create({ data: { propertyId: prop.id, date: day('2026-11-21'), type: 'PRICE', fromValue: 1, toValue: 2, status: 'APPROVED' } });
    return { prop, night, action, lone };
  }

  it('registers the explanations.generate handler', () => {
    expect(t.get(JobsRegistry).get('explanations.generate')).toBeDefined();
  });

  it('generates, caches and reuses explanations by (property, date, factorsHash)', async () => {
    const { prop, night, action, lone } = await seed();
    const r1 = await svc.generateForProperty(prop.id);
    expect(r1).toEqual({ generated: 2, fromCache: 0, skipped: 0 });
    expect(t.fakes.llm.explainCalls).toBe(2);

    const a = await t.prisma.action.findUniqueOrThrow({ where: { id: action.id } });
    expect(a.headline).toBe('Sábado tem evento por perto');
    expect(a.explanation).toContain('R$ 289');
    const n = await t.prisma.nightPrice.findUniqueOrThrow({ where: { id: night.id } });
    expect([n.headline, n.explanation]).toEqual([a.headline, a.explanation]);
    const cache = await t.prisma.explanationCache.findUnique({ where: { cacheKey: explanationCacheKey(prop.id, '2026-11-14', 'hash-v1') } });
    expect(cache).toMatchObject({ headline: a.headline, model: 'fake' });
    expect((await t.prisma.action.findUniqueOrThrow({ where: { id: lone.id } })).headline).toBe('Feriadão à vista');

    // Second run: everything up to date, no LLM calls.
    expect(await svc.generateForProperty(prop.id)).toEqual({ generated: 0, fromCache: 0, skipped: 2 });
    expect(t.fakes.llm.explainCalls).toBe(2);

    // Engine recomputed the night with new factors → new hash → one new LLM call.
    await t.prisma.nightPrice.update({
      where: { id: night.id },
      data: { factorsHash: 'hash-v2', factors: [{ key: 'weather', multiplier: 0.85, label: 'Chuva forte prevista' }], suggestedPrice: 22900 },
    });
    await t.prisma.action.update({ where: { id: action.id }, data: { toValue: 22900 } });
    const r3 = await svc.generateForProperty(prop.id);
    expect(r3).toEqual({ generated: 1, fromCache: 0, skipped: 1 });
    expect((await t.prisma.action.findUniqueOrThrow({ where: { id: action.id } })).headline).toBe('Chuva pode esfriar a procura');

    // Back to v1 factors → served from cache, not the LLM.
    await t.prisma.nightPrice.update({ where: { id: night.id }, data: { factorsHash: 'hash-v1' } });
    const r4 = await svc.generateForProperty(prop.id);
    expect(r4.fromCache).toBe(1);
    expect(t.fakes.llm.explainCalls).toBe(3);
  });

  it('explain() is usable synchronously and caches', async () => {
    const { prop } = await seed();
    const input = {
      date: '2026-12-31', weekdayLabel: 'Quinta', status: 'free' as const, fromPrice: 25900, toPrice: 59900, minStay: 3,
      destinationType: 'BEACH' as const, propertyName: prop.name, factors: [{ key: 'newYear', multiplier: 2.2, label: 'Réveillon' }],
    };
    const a = await svc.explain(prop.id, 'h', input);
    const b = await svc.explain(prop.id, 'h', input);
    expect(a).toMatchObject({ headline: 'Réveillon disputado', cached: false });
    expect(b).toMatchObject({ headline: 'Réveillon disputado', cached: true });
    expect(t.fakes.llm.explainCalls).toBe(1);
  });

  it('ignores unknown properties', async () => {
    expect(await svc.generateForProperty('nope')).toEqual({ generated: 0, fromCache: 0, skipped: 0 });
  });
});
