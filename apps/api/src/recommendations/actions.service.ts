import { HttpStatus, Injectable } from '@nestjs/common';
import type { Action, ActionStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ErrorCode, FactorDto, type ActionDto, type ActionsQuery, type ActionsResponse } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { AuditService } from '../common/audit.service';
import { dateToIso, isoToDate, todayInTz } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { fallbackExplanation } from './fallback-explanation';

type ActionsQueryInput = z.output<typeof ActionsQuery>;

const actionInclude = {
  property: { select: { id: true, userId: true, name: true, listingUrl: true, minPrice: true, maxPrice: true, timezone: true, deletedAt: true } },
} satisfies Prisma.ActionInclude;
type ActionRow = Prisma.ActionGetPayload<{ include: typeof actionInclude }>;

const Cursor = z.object({ g: z.number().int(), d: z.string(), i: z.string() });
type Cursor = z.infer<typeof Cursor>;

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}
function decodeCursor(raw: string): Cursor {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Cursor inválido');
  }
}

function parseFactors(raw: unknown): FactorDto[] {
  const r = z.array(FactorDto).safeParse(raw);
  return r.success ? r.data : [];
}

type Decision = 'approve' | 'dismiss' | 'revert';

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, q: ActionsQueryInput): Promise<ActionsResponse> {
    const base: Prisma.ActionWhereInput = {
      property: { userId, deletedAt: null },
      ...(q.propertyId ? { propertyId: q.propertyId } : {}),
    };
    const where: Prisma.ActionWhereInput = { ...base, ...(q.status ? { status: q.status } : {}) };
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      const d = isoToDate(c.d);
      where.AND = [
        {
          OR: [
            { estimatedGain: { lt: c.g } },
            { estimatedGain: c.g, date: { gt: d } },
            { estimatedGain: c.g, date: d, id: { gt: c.i } },
          ],
        },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.action.findMany({
        where,
        include: actionInclude,
        orderBy: [{ estimatedGain: 'desc' }, { date: 'asc' }, { id: 'asc' }],
        take: q.limit + 1,
      }),
      this.prisma.action.aggregate({ where: { ...base, status: 'PENDING' }, _sum: { estimatedGain: true } }),
    ]);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: await this.toDtos(page),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ g: last.estimatedGain, d: dateToIso(last.date), i: last.id }) : null,
      totalEstimatedGain: total._sum.estimatedGain ?? 0,
    };
  }

  async decide(userId: string, id: string, decision: Decision): Promise<ActionDto> {
    const action = await this.prisma.action.findFirst({ where: { id, property: { userId, deletedAt: null } }, include: actionInclude });
    if (!action) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Recomendação não encontrada');
    const now = new Date();
    let next: { status: ActionStatus; decidedAt?: Date | null; appliedAt?: Date | null };
    switch (decision) {
      case 'approve':
        this.assertStatus(action, ['PENDING'], 'Essa recomendação já foi decidida.');
        if (dateToIso(action.date) < todayInTz(action.property.timezone)) {
          throw new AppError(HttpStatus.CONFLICT, ErrorCode.CONFLICT, 'Essa noite já passou.');
        }
        next = { status: 'APPROVED', decidedAt: now };
        break;
      case 'dismiss':
        this.assertStatus(action, ['PENDING'], 'Essa recomendação já foi decidida.');
        next = { status: 'DISMISSED', decidedAt: now };
        break;
      case 'revert':
        // Undo (the apps' "Desfazer" toast): an approval or dismissal brings the card back to PENDING, so the
        // previous known price applies again and the host can decide later. Only an action already APPLIED
        // to the channel (phase 2, Channex) becomes REVERTED. The audit log keeps the full history.
        this.assertStatus(action, ['APPROVED', 'APPLIED', 'DISMISSED'], 'Não há decisão para desfazer.');
        next = action.status === 'APPLIED' ? { status: 'REVERTED', decidedAt: now } : { status: 'PENDING', decidedAt: null };
        break;
    }
    // Optimistic concurrency: only transition from the status we read.
    const res = await this.prisma.action.updateMany({ where: { id, status: action.status }, data: next });
    if (res.count !== 1) throw new AppError(HttpStatus.CONFLICT, ErrorCode.CONFLICT, 'Essa recomendação mudou. Atualize a tela.');
    if (decision === 'approve') {
      // Other pending price cards for the same night are superseded by this decision.
      if (action.type !== 'MIN_STAY') {
        await this.prisma.action.deleteMany({
          where: { propertyId: action.propertyId, date: action.date, status: 'PENDING', type: { in: ['PRICE', 'ORPHAN', 'ADJACENT'] }, id: { not: id } },
        });
      }
    }
    await this.audit.log(userId, `action.${decision}`, {
      actionId: id,
      propertyId: action.propertyId,
      date: dateToIso(action.date),
      type: action.type,
      fromStatus: action.status,
      toStatus: next.status,
      fromValue: action.fromValue,
      toValue: action.toValue,
    });
    const updated = await this.prisma.action.findUniqueOrThrow({ where: { id }, include: actionInclude });
    const [dto] = await this.toDtos([updated]);
    return dto as ActionDto;
  }

  private assertStatus(action: Action, allowed: ActionStatus[], message: string): void {
    if (!allowed.includes(action.status)) {
      throw new AppError(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message, { status: action.status });
    }
  }

  private async toDtos(rows: ActionRow[]): Promise<ActionDto[]> {
    if (rows.length === 0) return [];
    const nights = await this.prisma.nightPrice.findMany({
      where: { propertyId: { in: [...new Set(rows.map((r) => r.propertyId))] }, date: { in: rows.map((r) => r.date) } },
      select: { propertyId: true, date: true, headline: true, explanation: true },
    });
    const nightKey = (p: string, d: Date): string => `${p}|${dateToIso(d)}`;
    const nightMap = new Map(nights.map((n) => [nightKey(n.propertyId, n.date), n]));
    return rows.map((a) => {
      const factors = parseFactors(a.factors);
      const night = nightMap.get(nightKey(a.propertyId, a.date));
      const fallback = fallbackExplanation({ type: a.type, date: dateToIso(a.date), fromValue: a.fromValue, toValue: a.toValue, factors });
      const isPrice = a.type !== 'MIN_STAY';
      return {
        id: a.id,
        propertyId: a.propertyId,
        propertyName: a.property.name,
        date: dateToIso(a.date),
        type: a.type,
        fromValue: a.fromValue,
        toValue: a.toValue,
        estimatedGain: a.estimatedGain,
        status: a.status,
        headline: a.headline ?? (isPrice ? night?.headline : null) ?? fallback.headline,
        explanation: a.explanation ?? (isPrice ? night?.explanation : null) ?? fallback.explanation,
        factors,
        withinLimits: !isPrice || (a.toValue >= a.property.minPrice && a.toValue <= a.property.maxPrice),
        listingUrl: a.property.listingUrl,
        decidedAt: a.decidedAt?.toISOString() ?? null,
        appliedAt: a.appliedAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      };
    });
  }
}
