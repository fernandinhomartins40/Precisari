import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configureApp } from '../src/bootstrap';
import type { Env } from '../src/config/env';

@Controller('whoami')
class WhoAmIController {
  @Get()
  whoami(@Req() req: { ips: string[] }): { ips: string[] } {
    return { ips: req.ips };
  }
}

describe('trust proxy', () => {
  let app: INestApplication;

  async function start(NODE_ENV: Env['NODE_ENV']): Promise<void> {
    const moduleRef = await Test.createTestingModule({ controllers: [WhoAmIController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, { NODE_ENV, CORS_ORIGINS: 'http://localhost:3000' } as Env, { swagger: false });
    await app.init();
  }

  afterEach(() => app.close());

  it('in production, tracks the address nginx appended, ignoring a client-forged prefix', async () => {
    await start('production');
    const res = await request(app.getHttpServer()).get('/v1/whoami').set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(res.body.ips).toEqual(['203.0.113.7']);
  });

  it('outside production, ignores X-Forwarded-For', async () => {
    await start('test');
    const res = await request(app.getHttpServer()).get('/v1/whoami').set('X-Forwarded-For', '203.0.113.7');
    expect(res.body.ips).toEqual([]);
  });
});
