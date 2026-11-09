import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './common/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [ConfigModule, PrismaModule, IntegrationsModule, JobsModule],
  controllers: [HealthController],
})
export class AppModule {}
