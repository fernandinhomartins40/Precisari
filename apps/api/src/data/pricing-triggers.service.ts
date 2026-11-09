import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { QUEUES } from '../jobs/queues';

/** Enqueues `pricing.recompute` for the properties affected by a data change (RF-31). */
@Injectable()
export class PricingTriggersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobQueueService,
  ) {}

  async forProperties(propertyIds: string[], reason: string): Promise<number> {
    const unique = [...new Set(propertyIds)];
    const bucket = Math.floor(Date.now() / 60_000); // dedup bursts within a minute
    for (const propertyId of unique) {
      await this.jobs.enqueue(QUEUES.pricingRecompute, { propertyId, reason }, { jobId: `pricing:${propertyId}:${reason}:${bucket}` });
    }
    return unique.length;
  }

  async forCity(city: string, state: string, reason: string): Promise<number> {
    const props = await this.prisma.property.findMany({
      where: { deletedAt: null, state, city: { equals: city, mode: 'insensitive' } },
      select: { id: true },
    });
    return this.forProperties(props.map((p) => p.id), reason);
  }

  /** Properties in the state, plus those whose main guest-origin state (school vacations) is it. */
  async forState(state: string, reason: string, opts: { includeGuestOrigin?: boolean } = {}): Promise<number> {
    const props = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        OR: [
          { state },
          ...(opts.includeGuestOrigin ? [{ rulesConfig: { path: ['schoolVacationState'], equals: state } }] : []),
        ],
      },
      select: { id: true },
    });
    return this.forProperties(props.map((p) => p.id), reason);
  }

  async forMunicipality(ibgeCode: string | null, state: string, reason: string): Promise<number> {
    if (!ibgeCode) return this.forState(state, reason);
    const props = await this.prisma.property.findMany({ where: { deletedAt: null, ibgeCode }, select: { id: true } });
    return this.forProperties(props.map((p) => p.id), reason);
  }

  async forAll(reason: string): Promise<number> {
    const props = await this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true } });
    return this.forProperties(props.map((p) => p.id), reason);
  }
}
