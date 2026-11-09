import type { BrazilState, EventSize } from '@precisari/shared';
import { CURATED_EVENTS } from '../curated-events';

/** A raw event from a source; size/radius may be missing (then classified by the LLM). */
export interface RawEvent {
  name: string;
  description?: string;
  venue?: string;
  city: string;
  state: BrazilState;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  size?: EventSize;
  radiusKm?: number;
}

/**
 * Event collector port. Only manual curation and public APIs whose terms allow it — NO scraping (PRD §9).
 * Add a source by implementing this interface and listing it in EVENT_SOURCES (data.module.ts).
 */
export interface EventSource {
  readonly name: string;
  fetch(window: { from: string; to: string }): Promise<RawEvent[]>;
}

export const EVENT_SOURCES = Symbol('EVENT_SOURCES');

/** Hand-maintained list for the launch cities (src/data/curated-events.ts). */
export class CuratedEventSource implements EventSource {
  readonly name = 'curated';

  constructor(private readonly events: RawEvent[] = CURATED_EVENTS) {}

  async fetch(window: { from: string; to: string }): Promise<RawEvent[]> {
    return this.events.filter((e) => e.endDate >= window.from && e.startDate <= window.to);
  }
}
