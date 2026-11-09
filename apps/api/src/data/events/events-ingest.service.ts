import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsRegistry } from '../../jobs/jobs.registry';
import { QUEUES } from '../../jobs/queues';
import { LLM_PROVIDER, type LlmProvider } from '../../integrations/ports';
import { addDays, fromIsoDate, toIsoDate } from '../../integrations/common/text';
import { EVENT_SOURCES, type EventSource } from './event-source';

/**
 * `events.ingest` (daily): collects events from the configured sources into the admin curation queue
 * (verified=false). Unknown size/radius are classified by the LLM (with deterministic fallback).
 * Unverified events must not affect prices until an admin verifies them (RF-80).
 */
@Injectable()
export class EventsIngestService implements OnModuleInit {
  private readonly log = new Logger('EventsIngestService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobsRegistry,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(EVENT_SOURCES) private readonly sources: EventSource[],
  ) {}

  onModuleInit(): void {
    this.registry.register(QUEUES.eventsIngest, () => this.ingest().then(() => undefined), { pattern: '30 7 * * *' });
  }

  async ingest(now = new Date()): Promise<{ created: number; skipped: number }> {
    const from = toIsoDate(now);
    const window = { from, to: addDays(from, 365) };
    let created = 0;
    let skipped = 0;
    for (const source of this.sources) {
      let events;
      try {
        events = await source.fetch(window);
      } catch (err) {
        this.log.warn(`event source ${source.name} failed: ${(err as Error).message}`);
        continue;
      }
      for (const e of events) {
        if (e.endDate < e.startDate) {
          skipped++;
          continue;
        }
        const exists = await this.prisma.event.findFirst({
          where: { name: { equals: e.name, mode: 'insensitive' }, city: { equals: e.city, mode: 'insensitive' }, startDate: fromIsoDate(e.startDate) },
          select: { id: true },
        });
        if (exists) {
          skipped++;
          continue;
        }
        let size = e.size;
        let radiusKm = e.radiusKm;
        if (!size || radiusKm === undefined) {
          const c = await this.llm.classifyEvent({ name: e.name, description: e.description, city: e.city, venue: e.venue });
          size = size ?? c.size;
          radiusKm = radiusKm ?? c.radiusKm;
        }
        await this.prisma.event.create({
          data: {
            name: e.name, city: e.city, state: e.state, lat: e.lat, lng: e.lng,
            startDate: fromIsoDate(e.startDate), endDate: fromIsoDate(e.endDate),
            size, radiusKm, source: source.name, verified: false,
          },
        });
        created++;
      }
    }
    if (created > 0) this.log.log(`events.ingest: ${created} new events awaiting curation`);
    return { created, skipped };
  }
}
