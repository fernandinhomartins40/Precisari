import type { CalendarSource, Property } from '@prisma/client';
import { BrazilState, RulesConfig, type CalendarSourceDto, type PropertyDto } from '@precisari/shared';

export type PropertyWithSources = Property & { calendarSources: CalendarSource[] };

export function parseRulesConfig(raw: unknown): RulesConfig {
  const r = RulesConfig.safeParse(raw ?? {});
  return r.success ? r.data : { enabled: {} };
}

export function toCalendarSourceDto(s: CalendarSource): CalendarSourceDto {
  return {
    id: s.id,
    type: s.type,
    urlMasked: s.urlMasked,
    lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
    status: s.status,
    lastError: s.lastError,
  };
}

export function toPropertyDto(p: PropertyWithSources): PropertyDto {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    city: p.city,
    state: BrazilState.parse(p.state),
    ibgeCode: p.ibgeCode,
    destinationType: p.destinationType,
    capacity: p.capacity,
    bedrooms: p.bedrooms,
    basePrice: p.basePrice,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    cleaningFee: p.cleaningFee,
    monthlyFixedCosts: p.monthlyFixedCosts,
    platformFeePct: p.platformFeePct,
    aggressiveness: p.aggressiveness,
    rulesConfig: parseRulesConfig(p.rulesConfig),
    timezone: p.timezone,
    listingUrl: p.listingUrl,
    photoUrl: p.photoUrl,
    // iCal only: the Airbnb link (Channex) has its own status endpoint, and clients treat these as the iCal feed.
    calendarSources: p.calendarSources.filter((s) => s.type === 'ICAL').map(toCalendarSourceDto),
    createdAt: p.createdAt.toISOString(),
  };
}
