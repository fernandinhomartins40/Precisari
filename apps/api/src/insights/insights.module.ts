import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({ imports: [PropertiesModule], controllers: [InsightsController], providers: [InsightsService] })
export class InsightsModule {}
