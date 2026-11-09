import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthController } from '../src/common/health.controller';

describe('GET /v1/health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });
  afterAll(async () => app.close());
  it('returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
