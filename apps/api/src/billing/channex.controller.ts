import { createHash } from 'node:crypto';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ErrorCode } from '@precisari/shared';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { CHANNEX_PROVIDER, type ChannexProvider } from '../integrations/ports';
import { toAppError } from '../integrations/common/errors';
import { BillingService } from './billing.service';
import { rawBodyOf, type RawBodyRequest } from './billing.controller';

export const ChannexConnectBody = z.object({ propertyId: z.string().min(1) });
export const ChannexConnectDto = z.object({
  propertyId: z.string(),
  channexPropertyId: z.string(),
  status: z.literal('CONNECTED'),
});
export type ChannexConnectDto = z.infer<typeof ChannexConnectDto>;

const ChannexWebhookPayload = z.object({ id: z.string().optional(), event: z.string().optional() }).passthrough();

/** Phase 2 (RF-23/RF-43): connect a property to Channex and receive its webhooks. */
@Controller('integrations/channex')
export class ChannexController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(CHANNEX_PROVIDER) private readonly channex: ChannexProvider,
  ) {}

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async connect(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ChannexConnectBody)) body: z.infer<typeof ChannexConnectBody>): Promise<ChannexConnectDto> {
    if (!(await this.billing.hasPaidPlan(user.id))) {
      throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.PLAN_LIMIT, 'Conectar o Airbnb é um recurso dos planos Pro e Automático');
    }
    const property = await this.prisma.property.findFirst({
      where: { id: body.propertyId, userId: user.id, deletedAt: null },
      select: { id: true, name: true, timezone: true },
    });
    if (!property) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Imóvel não encontrado');
    let channexPropertyId: string;
    try {
      ({ channexPropertyId } = await this.channex.connectProperty({ propertyId: property.id, title: property.name, currency: 'BRL', timezone: property.timezone }));
    } catch (err) {
      throw toAppError(err);
    }
    const existing = await this.prisma.calendarSource.findFirst({ where: { propertyId: property.id, type: 'CHANNEX' }, select: { id: true } });
    if (existing) {
      await this.prisma.calendarSource.update({ where: { id: existing.id }, data: { channexPropertyId, status: 'OK', lastError: null } });
    } else {
      await this.prisma.calendarSource.create({ data: { propertyId: property.id, type: 'CHANNEX', channexPropertyId, status: 'OK' } });
    }
    await this.prisma.auditLog.create({ data: { userId: user.id, action: 'channex.connect', payload: { propertyId: property.id, channexPropertyId } } });
    return { propertyId: property.id, channexPropertyId, status: 'CONNECTED' };
  }

  /**
   * STUB: stores the payload (dedup by id) and acknowledges with 202.
   * TODO(channex): verify webhook authenticity and process booking/availability events (PRD §9 confirmations).
   */
  @Post('webhook')
  @HttpCode(HttpStatus.ACCEPTED)
  async webhook(@Req() req: RawBodyRequest): Promise<{ received: true }> {
    const raw = rawBodyOf(req);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Webhook inválido');
    }
    const payload = ChannexWebhookPayload.safeParse(json);
    if (!payload.success) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Webhook inválido', payload.error.flatten());
    const externalId = payload.data.id ?? createHash('sha256').update(raw).digest('hex');
    try {
      await this.prisma.webhookEvent.create({ data: { provider: 'channex', externalId, payload: payload.data as Prisma.InputJsonObject } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return { received: true };
  }
}
