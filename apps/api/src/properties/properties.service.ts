import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { ErrorCode, type CreatePropertyBody, type PropertyDto, type UpdatePropertyBody } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { PlanService } from '../common/plan.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { toPropertyDto, type PropertyWithSources } from './property.mapper';

export type CreatePropertyInput = z.output<typeof CreatePropertyBody>;
export type UpdatePropertyInput = z.output<typeof UpdatePropertyBody>;

export const DEFAULT_MAX_MULTIPLIER = 3;

function assertTimezone(tz: string | undefined): void {
  if (tz === undefined) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Fuso horário inválido', { field: 'timezone' });
  }
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly jobs: JobQueueService,
    private readonly audit: AuditService,
  ) {}

  /** Ownership check used by every property-scoped route. Soft-deleted ⇒ 404. */
  async getOwned(userId: string, id: string): Promise<PropertyWithSources> {
    const p = await this.prisma.property.findFirst({
      where: { id, userId, deletedAt: null },
      include: { calendarSources: { orderBy: { createdAt: 'asc' } } },
    });
    if (!p) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Imóvel não encontrado');
    return p;
  }

  async list(userId: string): Promise<PropertyDto[]> {
    const rows = await this.prisma.property.findMany({
      where: { userId, deletedAt: null },
      include: { calendarSources: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toPropertyDto);
  }

  async get(userId: string, id: string): Promise<PropertyDto> {
    return toPropertyDto(await this.getOwned(userId, id));
  }

  async create(userId: string, body: CreatePropertyInput): Promise<PropertyDto> {
    assertTimezone(body.timezone);
    const limits = await this.plans.limitsFor(userId);
    if (limits.maxProperties !== null) {
      const count = await this.prisma.property.count({ where: { userId, deletedAt: null } });
      if (count >= limits.maxProperties) {
        throw new AppError(
          HttpStatus.FORBIDDEN,
          ErrorCode.PLAN_LIMIT,
          `O plano ${limits.plan === 'FREE' ? 'Grátis' : limits.plan} permite ${limits.maxProperties} imóvel. Assine o Pro para adicionar mais.`,
          { plan: limits.plan, maxProperties: limits.maxProperties },
        );
      }
    }
    const created = await this.prisma.property.create({
      data: {
        ...body,
        maxPrice: body.maxPrice ?? body.basePrice * DEFAULT_MAX_MULTIPLIER,
        rulesConfig: body.rulesConfig as Prisma.InputJsonObject,
        userId,
      },
      include: { calendarSources: true },
    });
    await this.audit.log(userId, 'property.created', { propertyId: created.id });
    await this.jobs.enqueue(QUEUES.pricingRecompute, { propertyId: created.id, reason: 'property.created' });
    return toPropertyDto(created);
  }

  async update(userId: string, id: string, body: UpdatePropertyInput): Promise<PropertyDto> {
    const current = await this.getOwned(userId, id);
    assertTimezone(body.timezone);
    const basePrice = body.basePrice ?? current.basePrice;
    let maxPrice = body.maxPrice ?? current.maxPrice;
    // Keep the default "base × 3" ceiling in sync when the host never customized it.
    if (body.maxPrice === undefined && body.basePrice !== undefined && current.maxPrice === current.basePrice * DEFAULT_MAX_MULTIPLIER) {
      maxPrice = basePrice * DEFAULT_MAX_MULTIPLIER;
    }
    const minPrice = body.minPrice ?? current.minPrice;
    if (minPrice > basePrice) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'O preço mínimo precisa ser menor ou igual ao preço base', { field: 'minPrice' });
    }
    if (maxPrice < basePrice) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'O preço máximo precisa ser maior ou igual ao preço base', { field: 'maxPrice' });
    }
    const { rulesConfig, ...rest } = body;
    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        ...rest,
        maxPrice,
        ...(rulesConfig !== undefined ? { rulesConfig: rulesConfig as Prisma.InputJsonObject } : {}),
      },
      include: { calendarSources: { orderBy: { createdAt: 'asc' } } },
    });
    await this.jobs.enqueue(QUEUES.pricingRecompute, { propertyId: id, reason: 'property.updated' });
    return toPropertyDto(updated);
  }

  /** Soft delete; pending recommendations are dropped. */
  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.$transaction([
      this.prisma.property.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.action.deleteMany({ where: { propertyId: id, status: 'PENDING' } }),
    ]);
    await this.audit.log(userId, 'property.deleted', { propertyId: id });
  }
}
