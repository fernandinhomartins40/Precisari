/**
 * Manually curated events for the first launch cities (input of CuratedEventSource).
 * Dates are APPROXIMATE (recurring events) — they enter the admin curation queue as verified=false and must be
 * confirmed in /admin/events before affecting prices. No scraping: this list is maintained by hand.
 */
import type { BrazilState, EventSize } from '@precisari/shared';

export interface CuratedEventSeed {
  name: string;
  description?: string;
  venue?: string;
  city: string;
  state: BrazilState;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  /** Omit to let the LLM classify size/radius. */
  size?: EventSize;
  radiusKm?: number;
}

export const CURATED_EVENTS: CuratedEventSeed[] = [
  { name: 'Réveillon de Copacabana', city: 'Rio de Janeiro', state: 'RJ', lat: -22.9711, lng: -43.1822, startDate: '2026-12-31', endDate: '2027-01-01', size: 'XG', radiusKm: 15 },
  { name: 'Réveillon de Salvador', venue: 'Boca do Rio', city: 'Salvador', state: 'BA', lat: -12.9776, lng: -38.4316, startDate: '2026-12-28', endDate: '2026-12-31' },
  { name: 'Natal Luz de Gramado', description: 'Programação de Natal com espetáculos', city: 'Gramado', state: 'RS', lat: -29.3787, lng: -50.8744, startDate: '2026-10-22', endDate: '2027-01-17' },
  { name: 'Festa de Iemanjá', venue: 'Rio Vermelho', city: 'Salvador', state: 'BA', lat: -13.0127, lng: -38.4917, startDate: '2027-02-02', endDate: '2027-02-02' },
  { name: 'Lollapalooza Brasil', venue: 'Autódromo de Interlagos', city: 'São Paulo', state: 'SP', lat: -23.7036, lng: -46.6997, startDate: '2027-03-26', endDate: '2027-03-28' },
  { name: 'Festival de Cinema de Gramado', city: 'Gramado', state: 'RS', lat: -29.3787, lng: -50.8744, startDate: '2027-08-13', endDate: '2027-08-21' },
  { name: 'Fenaostra', description: 'Festa Nacional da Ostra e da Cultura Açoriana', city: 'Florianópolis', state: 'SC', lat: -27.5954, lng: -48.548, startDate: '2027-10-07', endDate: '2027-10-17' },
];
