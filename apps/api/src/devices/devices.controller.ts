import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegisterDeviceBody } from '@precisari/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert by token: a device that changes account moves to the current user. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registra o token de push (Expo)' })
  async register(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RegisterDeviceBody)) body: RegisterDeviceBody): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { expoPushToken: body.expoPushToken },
      create: { userId: user.id, expoPushToken: body.expoPushToken, platform: body.platform },
      update: { userId: user.id, platform: body.platform, lastSeenAt: new Date() },
    });
  }
}
