import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Event, Holiday, Prisma, SchoolVacation } from '@prisma/client';
import {
  ErrorCode, EventBody, HolidayBody, SchoolVacationBody, type EventDto, type HolidayDto, type SchoolVacationDto,
} from '@precisari/shared';
import type { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { fromIsoDate, toIsoDate } from '../integrations/common/text';
import { PricingTriggersService } from '../data/pricing-triggers.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { EventsQuery, HolidaysQuery, VacationsQuery } from './admin.schemas';

type EventIn = z.output<typeof EventBody>;
type HolidayIn = z.output<typeof HolidayBody>;
type VacationIn = z.output<typeof SchoolVacationBody>;

const LIST_LIMIT = 500;
/** Verified events of these sizes starting within this window trigger an immediate alert (RF-51). */
const ALERT_SIZES = new Set(['M', 'G', 'XG']);
const ALERT_WINDOW_DAYS = 90;

export function toEventDto(e: Event): EventDto {
  return {
    id: e.id, name: e.name, city: e.city, state: e.state as EventDto['state'], lat: e.lat, lng: e.lng,
    startDate: toIsoDate(e.startDate), endDate: toIsoDate(e.endDate), size: e.size, radiusKm: e.radiusKm,
    source: e.source, verified: e.verified,
  };
}
export function toHolidayDto(h: Holiday): HolidayDto {
  return {
    id: h.id, date: toIsoDate(h.date), scope: h.scope, state: (h.state as HolidayDto['state']) ?? null,
    ibgeCode: h.ibgeCode, name: h.name, isBridge: h.isBridge, kind: h.kind,
  };
}
export function toVacationDto(v: SchoolVacation): SchoolVacationDto {
  return { id: v.id, state: v.state as SchoolVacationDto['state'], startDate: toIsoDate(v.startDate), endDate: toIsoDate(v.endDate), year: v.year };
}

function notFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} não encontrado`);
}
function invalid(message: string, details?: unknown): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, message, details);
}

/** RF-80/81: curation of events, holidays and school vacations. Every change is audited and triggers recompute. */
@Injectable()
export class AdminService {
  private readonly log = new Logger('AdminService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggers: PricingTriggersService,
    private readonly notifications: NotificationsService,
  ) {}

  private async audit(adminId: string, action: string, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.auditLog.create({ data: { userId: adminId, action, payload: payload as Prisma.InputJsonObject } });
  }

  // ---------- events ----------
  async listEvents(q: EventsQuery): Promise<EventDto[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
        ...(q.state ? { state: q.state } : {}),
        ...(q.from ? { endDate: { gte: fromIsoDate(q.from) } } : {}),
        ...(q.to ? { startDate: { lte: fromIsoDate(q.to) } } : {}),
        ...(q.verified !== undefined ? { verified: q.verified } : {}),
      },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(toEventDto);
  }

  async createEvent(adminId: string, body: EventIn): Promise<EventDto> {
    if (body.endDate < body.startDate) throw invalid('endDate deve ser ≥ startDate');
    const e = await this.prisma.event.create({
      data: { ...body, startDate: fromIsoDate(body.startDate), endDate: fromIsoDate(body.endDate) },
    });
    const dto = toEventDto(e);
    await this.audit(adminId, 'admin.event.create', { id: e.id, after: dto });
    await this.afterEventChange(null, e);
    return dto;
  }

  async updateEvent(adminId: string, id: string, body: Partial<EventIn>): Promise<EventDto> {
    const before = await this.prisma.event.findUnique({ where: { id } });
    if (!before) throw notFound('Evento');
    const start = body.startDate ?? toIsoDate(before.startDate);
    const end = body.endDate ?? toIsoDate(before.endDate);
    if (end < start) throw invalid('endDate deve ser ≥ startDate');
    const e = await this.prisma.event.update({
      where: { id },
      data: {
        ...body,
        ...(body.startDate ? { startDate: fromIsoDate(body.startDate) } : {}),
        ...(body.endDate ? { endDate: fromIsoDate(body.endDate) } : {}),
      },
    });
    const dto = toEventDto(e);
    await this.audit(adminId, 'admin.event.update', { id, before: toEventDto(before), after: dto });
    await this.afterEventChange(before, e);
    return dto;
  }

  async deleteEvent(adminId: string, id: string): Promise<void> {
    const before = await this.prisma.event.findUnique({ where: { id } });
    if (!before) throw notFound('Evento');
    await this.prisma.event.delete({ where: { id } });
    await this.audit(adminId, 'admin.event.delete', { id, before: toEventDto(before) });
    if (before.verified) await this.triggers.forCity(before.city, before.state, 'event');
  }

  private async afterEventChange(before: Event | null, after: Event): Promise<void> {
    const affectsPrices = after.verified || before?.verified === true;
    if (affectsPrices) {
      await this.triggers.forCity(after.city, after.state, 'event');
      if (before && (before.city !== after.city || before.state !== after.state)) await this.triggers.forCity(before.city, before.state, 'event');
    }
    const becameVerified = after.verified && !before?.verified;
    const startsSoon = after.startDate.getTime() - Date.now() < ALERT_WINDOW_DAYS * 86_400_000 && after.endDate.getTime() >= Date.now() - 86_400_000;
    if (becameVerified && ALERT_SIZES.has(after.size) && startsSoon) {
      const owners = await this.prisma.property.findMany({
        where: { deletedAt: null, state: after.state, city: { equals: after.city, mode: 'insensitive' } },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const o of owners) {
        try {
          await this.notifications.alert(
            o.userId,
            { kind: 'event_detected', eventId: after.id, eventName: after.name, city: after.city, startDate: toIsoDate(after.startDate) },
            `event:${after.id}`,
          );
        } catch (err) {
          this.log.warn(`event alert failed: ${(err as Error).message}`);
        }
      }
    }
  }

  // ---------- holidays ----------
  async listHolidays(q: HolidaysQuery): Promise<HolidayDto[]> {
    const rows = await this.prisma.holiday.findMany({
      where: {
        ...(q.state ? { OR: [{ state: q.state }, { scope: 'NATIONAL' as const }] } : {}),
        ...(q.scope ? { scope: q.scope } : {}),
        ...(q.year ? { date: { gte: fromIsoDate(`${q.year}-01-01`), lte: fromIsoDate(`${q.year}-12-31`) } } : {}),
      },
      orderBy: [{ date: 'asc' }, { scope: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(toHolidayDto);
  }

  private validateHolidayScope(h: { scope: string; state?: string | null }): void {
    if (h.scope !== 'NATIONAL' && !h.state) throw invalid('Feriados estaduais e municipais precisam de UF');
  }

  async createHoliday(adminId: string, body: HolidayIn): Promise<HolidayDto> {
    this.validateHolidayScope(body);
    const state = body.scope === 'NATIONAL' ? null : (body.state ?? null);
    const ibgeCode = body.scope === 'MUNICIPAL' ? (body.ibgeCode ?? null) : null;
    const dup = await this.prisma.holiday.findFirst({ where: { date: fromIsoDate(body.date), scope: body.scope, state, ibgeCode, name: body.name } });
    if (dup) throw new AppError(HttpStatus.CONFLICT, ErrorCode.CONFLICT, 'Feriado já cadastrado', { id: dup.id });
    const h = await this.prisma.holiday.create({
      data: { date: fromIsoDate(body.date), scope: body.scope, state, ibgeCode, name: body.name, isBridge: body.isBridge, kind: body.kind },
    });
    const dto = toHolidayDto(h);
    await this.audit(adminId, 'admin.holiday.create', { id: h.id, after: dto });
    await this.afterHolidayChange(h);
    return dto;
  }

  async updateHoliday(adminId: string, id: string, body: Partial<HolidayIn>): Promise<HolidayDto> {
    const before = await this.prisma.holiday.findUnique({ where: { id } });
    if (!before) throw notFound('Feriado');
    const scope = body.scope ?? before.scope;
    const state = scope === 'NATIONAL' ? null : body.state !== undefined ? body.state : before.state;
    this.validateHolidayScope({ scope, state });
    const h = await this.prisma.holiday.update({
      where: { id },
      data: {
        ...(body.date ? { date: fromIsoDate(body.date) } : {}),
        scope,
        state,
        ibgeCode: scope === 'MUNICIPAL' ? (body.ibgeCode !== undefined ? body.ibgeCode : before.ibgeCode) : null,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isBridge !== undefined ? { isBridge: body.isBridge } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
      },
    });
    const dto = toHolidayDto(h);
    await this.audit(adminId, 'admin.holiday.update', { id, before: toHolidayDto(before), after: dto });
    await this.afterHolidayChange(h, before);
    return dto;
  }

  async deleteHoliday(adminId: string, id: string): Promise<void> {
    const before = await this.prisma.holiday.findUnique({ where: { id } });
    if (!before) throw notFound('Feriado');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit(adminId, 'admin.holiday.delete', { id, before: toHolidayDto(before) });
    await this.afterHolidayChange(before);
  }

  private async afterHolidayChange(h: Holiday, before?: Holiday): Promise<void> {
    for (const x of before && (before.scope !== h.scope || before.state !== h.state || before.ibgeCode !== h.ibgeCode) ? [h, before] : [h]) {
      if (x.scope === 'NATIONAL') await this.triggers.forAll('holiday');
      else if (x.scope === 'STATE' && x.state) await this.triggers.forState(x.state, 'holiday');
      else if (x.state) await this.triggers.forMunicipality(x.ibgeCode, x.state, 'holiday');
    }
  }

  // ---------- school vacations ----------
  async listVacations(q: VacationsQuery): Promise<SchoolVacationDto[]> {
    const rows = await this.prisma.schoolVacation.findMany({
      where: { ...(q.state ? { state: q.state } : {}), ...(q.year ? { year: q.year } : {}) },
      orderBy: [{ state: 'asc' }, { startDate: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(toVacationDto);
  }

  async createVacation(adminId: string, body: VacationIn): Promise<SchoolVacationDto> {
    if (body.endDate < body.startDate) throw invalid('endDate deve ser ≥ startDate');
    const v = await this.prisma.schoolVacation.create({
      data: { state: body.state, year: body.year, startDate: fromIsoDate(body.startDate), endDate: fromIsoDate(body.endDate) },
    });
    const dto = toVacationDto(v);
    await this.audit(adminId, 'admin.school_vacation.create', { id: v.id, after: dto });
    await this.triggers.forState(v.state, 'school-vacation', { includeGuestOrigin: true });
    return dto;
  }

  async updateVacation(adminId: string, id: string, body: Partial<VacationIn>): Promise<SchoolVacationDto> {
    const before = await this.prisma.schoolVacation.findUnique({ where: { id } });
    if (!before) throw notFound('Período de férias');
    const start = body.startDate ?? toIsoDate(before.startDate);
    const end = body.endDate ?? toIsoDate(before.endDate);
    if (end < start) throw invalid('endDate deve ser ≥ startDate');
    const v = await this.prisma.schoolVacation.update({
      where: { id },
      data: {
        ...(body.state ? { state: body.state } : {}),
        ...(body.year ? { year: body.year } : {}),
        ...(body.startDate ? { startDate: fromIsoDate(body.startDate) } : {}),
        ...(body.endDate ? { endDate: fromIsoDate(body.endDate) } : {}),
      },
    });
    const dto = toVacationDto(v);
    await this.audit(adminId, 'admin.school_vacation.update', { id, before: toVacationDto(before), after: dto });
    await this.triggers.forState(v.state, 'school-vacation', { includeGuestOrigin: true });
    if (before.state !== v.state) await this.triggers.forState(before.state, 'school-vacation', { includeGuestOrigin: true });
    return dto;
  }

  async deleteVacation(adminId: string, id: string): Promise<void> {
    const before = await this.prisma.schoolVacation.findUnique({ where: { id } });
    if (!before) throw notFound('Período de férias');
    await this.prisma.schoolVacation.delete({ where: { id } });
    await this.audit(adminId, 'admin.school_vacation.delete', { id, before: toVacationDto(before) });
    await this.triggers.forState(before.state, 'school-vacation', { includeGuestOrigin: true });
  }
}
