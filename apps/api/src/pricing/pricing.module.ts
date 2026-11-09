import { Module } from '@nestjs/common';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { PricingContextBuilder } from './pricing-context.builder';
import { PricingService } from './pricing.service';

@Module({ imports: [RecommendationsModule], providers: [PricingService, PricingContextBuilder], exports: [PricingService, PricingContextBuilder] })
export class PricingModule {}
