import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/properties.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({ imports: [PropertiesModule], controllers: [CalendarController], providers: [CalendarService], exports: [CalendarService] })
export class CalendarModule {}
