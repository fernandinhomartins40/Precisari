import { Module } from '@nestjs/common';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ChannexController } from './channex.controller';
import { ChannexService } from './channex.service';

@Module({
  imports: [RecommendationsModule],
  controllers: [BillingController, ChannexController],
  providers: [BillingService, ChannexService],
  exports: [BillingService],
})
export class BillingModule {}
