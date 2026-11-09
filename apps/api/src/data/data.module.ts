import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DataSeedService } from './data-seed.service';
import { HolidaysSyncService } from './holidays-sync.service';
import { WeatherRefreshService } from './weather-refresh.service';
import { PricingTriggersService } from './pricing-triggers.service';
import { EventsIngestService } from './events/events-ingest.service';
import { CuratedEventSource, EVENT_SOURCES, type EventSource } from './events/event-source';

/** Curated local data (M3): holidays, school vacations, weather, events + their sync jobs. */
@Module({
  imports: [NotificationsModule],
  providers: [
    PricingTriggersService,
    HolidaysSyncService,
    DataSeedService,
    WeatherRefreshService,
    EventsIngestService,
    { provide: EVENT_SOURCES, useFactory: (): EventSource[] => [new CuratedEventSource()] },
  ],
  exports: [PricingTriggersService, HolidaysSyncService, DataSeedService, WeatherRefreshService, EventsIngestService],
})
export class DataModule {}
