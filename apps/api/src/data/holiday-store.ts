import type { HolidayKind, HolidayScope, PrismaClient } from '@prisma/client';
import { fromIsoDate } from '../integrations/common/text';

export interface HolidayRow {
  date: string;
  scope: HolidayScope;
  state: string | null;
  ibgeCode: string | null;
  name: string;
  kind: HolidayKind;
  isBridge?: boolean;
}

/**
 * Idempotent insert keyed by (date, scope, state, ibgeCode, name). Postgres unique indexes treat NULLs as distinct,
 * so we look up explicitly instead of relying on the compound unique. Returns true when created.
 */
export async function upsertHoliday(prisma: Pick<PrismaClient, 'holiday'>, row: HolidayRow): Promise<boolean> {
  const date = fromIsoDate(row.date);
  const existing = await prisma.holiday.findFirst({
    where: { date, scope: row.scope, state: row.state, ibgeCode: row.ibgeCode, name: row.name },
    select: { id: true, kind: true },
  });
  if (existing) {
    if (existing.kind !== row.kind) await prisma.holiday.update({ where: { id: existing.id }, data: { kind: row.kind } });
    return false;
  }
  await prisma.holiday.create({
    data: { date, scope: row.scope, state: row.state, ibgeCode: row.ibgeCode, name: row.name, kind: row.kind, isBridge: row.isBridge ?? false },
  });
  return true;
}
