import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Append-only audit trail for sensitive actions (LGPD, auth, decisions). Never throws. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(userId: string | null, action: string, payload: Prisma.InputJsonObject = {}): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { userId, action, payload } });
    } catch (err) {
      this.logger.error({ err, action }, 'audit log write failed');
    }
  }
}
