import { Module } from '@nestjs/common';
import { DataModule } from '../data/data.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminHealthService } from './admin-health.service';

@Module({
  imports: [DataModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminHealthService],
})
export class AdminModule {}
