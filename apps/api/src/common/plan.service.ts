import { Injectable } from '@nestjs/common';
import type { Plan } from '@precisari/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, effectivePlan } from './plans';

@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  async planFor(userId: string): Promise<Plan> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } });
    return effectivePlan(sub);
  }

  async limitsFor(userId: string): Promise<{ plan: Plan; maxProperties: number | null; horizonDays: number }> {
    const plan = await this.planFor(userId);
    return { plan, ...PLAN_LIMITS[plan] };
  }
}
