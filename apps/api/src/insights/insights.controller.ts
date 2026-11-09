import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { InsightsDto } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { InsightsService } from './insights.service';

const InsightsQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected yyyy-mm').optional() });

@ApiTags('insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties/:id/insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @ApiOperation({ summary: 'Resultados do mês: ocupação, ADR, receita, lucro e comparativos' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query(new ZodPipe(InsightsQuery)) q: z.infer<typeof InsightsQuery>): Promise<InsightsDto> {
    return this.insights.get(user.id, id, q.month);
  }
}
