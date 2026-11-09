import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ChannexController } from './channex.controller';

@Module({
  controllers: [BillingController, ChannexController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
