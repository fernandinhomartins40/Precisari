import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  EventBody, HolidayBody, SchoolVacationBody, type AdminHealthDto, type EventDto, type HolidayDto, type SchoolVacationDto,
} from '@precisari/shared';
import type { z } from 'zod';
import { AdminGuard, CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { DataSeedService, type SeedResult } from '../data/data-seed.service';
import { HolidaysSyncService } from '../data/holidays-sync.service';
import { AdminService } from './admin.service';
import { AdminHealthService } from './admin-health.service';
import { EventsQuery, HolidaysQuery, IdParam, VacationsQuery } from './admin.schemas';

const EventPatch = EventBody.partial();
const HolidayPatch = HolidayBody.partial();
const VacationPatch = SchoolVacationBody.partial();

/** Internal admin panel API (RF-80/81/82). RBAC: ADMIN only. */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly healthService: AdminHealthService,
    private readonly seed: DataSeedService,
    private readonly holidaysSync: HolidaysSyncService,
  ) {}

  // ---------- events ----------
  @Get('events')
  listEvents(@Query(new ZodPipe(EventsQuery)) q: EventsQuery): Promise<EventDto[]> {
    return this.admin.listEvents(q);
  }

  @Post('events')
  createEvent(@CurrentUser() u: AuthUser, @Body(new ZodPipe(EventBody)) body: z.output<typeof EventBody>): Promise<EventDto> {
    return this.admin.createEvent(u.id, body);
  }

  @Patch('events/:id')
  updateEvent(
    @CurrentUser() u: AuthUser,
    @Param('id', new ZodPipe(IdParam)) id: string,
    @Body(new ZodPipe(EventPatch)) body: z.output<typeof EventPatch>,
  ): Promise<EventDto> {
    return this.admin.updateEvent(u.id, id, body);
  }

  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(IdParam)) id: string): Promise<void> {
    return this.admin.deleteEvent(u.id, id);
  }

  // ---------- holidays ----------
  @Get('holidays')
  listHolidays(@Query(new ZodPipe(HolidaysQuery)) q: HolidaysQuery): Promise<HolidayDto[]> {
    return this.admin.listHolidays(q);
  }

  @Post('holidays')
  createHoliday(@CurrentUser() u: AuthUser, @Body(new ZodPipe(HolidayBody)) body: z.output<typeof HolidayBody>): Promise<HolidayDto> {
    return this.admin.createHoliday(u.id, body);
  }

  @Patch('holidays/:id')
  updateHoliday(
    @CurrentUser() u: AuthUser,
    @Param('id', new ZodPipe(IdParam)) id: string,
    @Body(new ZodPipe(HolidayPatch)) body: z.output<typeof HolidayPatch>,
  ): Promise<HolidayDto> {
    return this.admin.updateHoliday(u.id, id, body);
  }

  @Delete('holidays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHoliday(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(IdParam)) id: string): Promise<void> {
    return this.admin.deleteHoliday(u.id, id);
  }

  // ---------- school vacations ----------
  @Get('school-vacations')
  listVacations(@Query(new ZodPipe(VacationsQuery)) q: VacationsQuery): Promise<SchoolVacationDto[]> {
    return this.admin.listVacations(q);
  }

  @Post('school-vacations')
  createVacation(@CurrentUser() u: AuthUser, @Body(new ZodPipe(SchoolVacationBody)) body: z.output<typeof SchoolVacationBody>): Promise<SchoolVacationDto> {
    return this.admin.createVacation(u.id, body);
  }

  @Patch('school-vacations/:id')
  updateVacation(
    @CurrentUser() u: AuthUser,
    @Param('id', new ZodPipe(IdParam)) id: string,
    @Body(new ZodPipe(VacationPatch)) body: z.output<typeof VacationPatch>,
  ): Promise<SchoolVacationDto> {
    return this.admin.updateVacation(u.id, id, body);
  }

  @Delete('school-vacations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVacation(@CurrentUser() u: AuthUser, @Param('id', new ZodPipe(IdParam)) id: string): Promise<void> {
    return this.admin.deleteVacation(u.id, id);
  }

  // ---------- data + health ----------
  /** Idempotent curated data seed (+ national holidays sync for missing years). */
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  async seedData(): Promise<SeedResult & { nationalHolidays: number }> {
    const r = await this.seed.seedCuratedData();
    let nationalHolidays = 0;
    for (const y of await this.holidaysSync.missingYears()) {
      try {
        nationalHolidays += (await this.holidaysSync.sync(y)).created;
      } catch {
        // BrasilAPI down: curated data is still seeded; holidays.sync job retries later.
      }
    }
    return { ...r, nationalHolidays };
  }

  @Get('health')
  health(): Promise<AdminHealthDto> {
    return this.healthService.health();
  }
}
