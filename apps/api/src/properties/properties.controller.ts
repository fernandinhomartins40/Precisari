import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePropertyBody, UpdatePropertyBody, type PropertyDto } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { PropertiesService, type CreatePropertyInput, type UpdatePropertyInput } from './properties.service';

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os imóveis do anfitrião' })
  list(@CurrentUser() user: AuthUser): Promise<PropertyDto[]> {
    return this.properties.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um imóvel (respeita o limite do plano)' })
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreatePropertyBody)) body: CreatePropertyInput): Promise<PropertyDto> {
    return this.properties.create(user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do imóvel' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PropertyDto> {
    return this.properties.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita parâmetros do imóvel' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdatePropertyBody)) body: UpdatePropertyInput,
  ): Promise<PropertyDto> {
    return this.properties.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o imóvel' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.properties.remove(user.id, id);
  }
}
