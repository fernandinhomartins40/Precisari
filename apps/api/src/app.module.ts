import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './common/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';
import { PlacesModule } from './places/places.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExplanationsModule } from './explanations/explanations.module';
import { DataModule } from './data/data.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [ConfigModule, PrismaModule, IntegrationsModule, JobsModule, PlacesModule, NotificationsModule, ExplanationsModule, DataModule, AdminModule, BillingModule],
  controllers: [HealthController],
})
export class AppModule {}
