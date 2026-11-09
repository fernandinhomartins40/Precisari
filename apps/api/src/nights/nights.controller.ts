import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { IsoDate, NightsQuery, type NightDetailDto, type NightsResponse } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { NightsService } from './nights.service';

@ApiTags('nights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties/:id/nights')
export class NightsController {
  constructor(private readonly nights: NightsService) {}

  @Get()
  @ApiOperation({ summary: 'Recomendações por noite (mapa de calor)' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodPipe(NightsQuery)) q: z.output<typeof NightsQuery>,
  ): Promise<NightsResponse> {
    return this.nights.list(user.id, id, q);
  }

  @Get(':date')
  @ApiOperation({ summary: 'Detalhe de uma noite: fatores, clima, eventos e feriados' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('date', new ZodPipe(IsoDate)) date: string): Promise<NightDetailDto> {
    return this.nights.detail(user.id, id, date);
  }
}
