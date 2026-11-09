import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { PropertiesModule } from '../properties/properties.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { NightsController } from './nights.controller';
import { NightsService } from './nights.service';

@Module({ imports: [PropertiesModule, PricingModule, RecommendationsModule], controllers: [NightsController], providers: [NightsService] })
export class NightsModule {}
