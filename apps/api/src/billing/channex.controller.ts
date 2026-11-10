import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ChannexConnectBody, ErrorCode, type ChannexConnectDto, type ChannexStatusDto } from '@precisari/shared';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { JobQueueService } from '../jobs/job-queue.service';
import { QUEUES } from '../jobs/queues';
import { ChannexService } from './channex.service';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Phase 2 (RF-23/RF-43): link a property's Airbnb listing through Channex and receive its booking webhooks. */
@Controller('integrations/channex')
export class ChannexController {
  constructor(
    private readonly channex: ChannexService,
    private readonly jobs: JobQueueService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  connect(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ChannexConnectBody)) body: ChannexConnectBody): Promise<ChannexConnectDto> {
    return this.channex.connect(user.id, body.propertyId);
  }

  /**
   * Channex calls this on booking events with our secret header. The payload only signals "something changed":
   * bookings are read from the revisions feed (validated there), so a forged call can at most trigger a pull.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.ACCEPTED)
  async webhook(@Headers('x-precisari-secret') secret: string | undefined): Promise<{ received: true }> {
    if (!this.env.CHANNEX_WEBHOOK_SECRET || !secret || !sameSecret(secret, this.env.CHANNEX_WEBHOOK_SECRET)) {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Webhook não autorizado');
    }
    await this.jobs.enqueue(QUEUES.channexBookings, {}, { jobId: `channex-bookings:${Math.floor(Date.now() / 10_000)}` });
    return { received: true };
  }

  @Get(':propertyId')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser, @Param('propertyId') propertyId: string): Promise<ChannexStatusDto> {
    return this.channex.status(user.id, propertyId);
  }

  @Delete(':propertyId')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthUser, @Param('propertyId') propertyId: string): Promise<ChannexStatusDto> {
    return this.channex.disconnect(user.id, propertyId);
  }
}
