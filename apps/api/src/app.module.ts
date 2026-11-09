import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './common/health.controller';
import { UserThrottlerGuard } from './common/throttler';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env';
import { DevicesModule } from './devices/devices.module';
import { InsightsModule } from './insights/insights.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';
import { NightsModule } from './nights/nights.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { PropertiesModule } from './properties/properties.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { UsersModule } from './users/users.module';
import { PlacesModule } from './places/places.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExplanationsModule } from './explanations/explanations.module';
import { DataModule } from './data/data.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["asaas-access-token"]', 'req.headers["x-precisari-signature"]', 'req.body.refreshToken', 'req.body.code'],
          autoLogging: { ignore: (req) => (req.url ?? '').includes('/health') },
          ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } } } : {}),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ throttlers: [{ name: 'default', ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }] }),
    }),
    PrismaModule,
    CommonModule,
    IntegrationsModule,
    JobsModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    CalendarModule,
    RecommendationsModule,
    PricingModule,
    NightsModule,
    InsightsModule,
    DevicesModule,
    PlacesModule,
    NotificationsModule,
    ExplanationsModule,
    DataModule,
    AdminModule,
    BillingModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
