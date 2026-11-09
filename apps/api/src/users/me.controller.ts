import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateMeBody, type UserDto } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Perfil e assinatura' })
  get(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.get(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualiza nome, fuso e preferências de notificação' })
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(UpdateMeBody)) body: UpdateMeBody): Promise<UserDto> {
    return this.users.update(user.id, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui a conta e os dados (LGPD)' })
  async delete(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.delete(user.id);
  }

  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="precisari-dados.json"')
  @ApiOperation({ summary: 'Exporta todos os dados da conta em JSON (LGPD)' })
  export(@CurrentUser() user: AuthUser): Promise<Record<string, unknown>> {
    return this.users.export(user.id);
  }
}
