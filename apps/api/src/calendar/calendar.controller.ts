import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConnectCalendarBody, type CalendarSourceDto, type SyncResultDto } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { CalendarService } from './calendar.service';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties/:id')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Post('calendar-sources')
  @ApiOperation({ summary: 'Conecta o link iCal (valida na hora e importa as reservas)' })
  connect(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ConnectCalendarBody)) body: ConnectCalendarBody,
  ): Promise<CalendarSourceDto> {
    return this.calendar.connect(user.id, id, body.url);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Força a sincronização do calendário' })
  sync(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<SyncResultDto> {
    return this.calendar.syncForUser(user.id, id);
  }
}
