import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { PriceStateService } from './price-state.service';
import { RecommendationsService } from './recommendations.service';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService, RecommendationsService, PriceStateService],
  exports: [RecommendationsService, PriceStateService],
})
export class RecommendationsModule {}
