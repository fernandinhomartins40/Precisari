import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { ActionsQuery, type ActionDto, type ActionsResponse } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { ZodPipe } from '../common/zod.pipe';
import { ActionsService } from './actions.service';

const IDEMPOTENCY_DOC = { name: 'Idempotency-Key', required: false, description: 'Repete a mesma resposta para a mesma chave' };

@ApiTags('actions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  @ApiOperation({ summary: 'Cartões de ação (ordenados por ganho estimado)' })
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(ActionsQuery)) q: z.output<typeof ActionsQuery>): Promise<ActionsResponse> {
    return this.actions.list(user.id, q);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_DOC)
  @ApiOperation({ summary: 'Aprova a recomendação' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ActionDto> {
    return this.actions.decide(user.id, id, 'approve');
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_DOC)
  @ApiOperation({ summary: 'Ignora a recomendação' })
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ActionDto> {
    return this.actions.decide(user.id, id, 'dismiss');
  }

  @Post(':id/revert')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader(IDEMPOTENCY_DOC)
  @ApiOperation({ summary: 'Desfaz a última decisão' })
  revert(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ActionDto> {
    return this.actions.decide(user.id, id, 'revert');
  }
}
