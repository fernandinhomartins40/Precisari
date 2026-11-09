import { Injectable } from '@nestjs/common';
import type { Property } from '@prisma/client';
import type { PricingContext } from '@precisari/pricing-engine';
import { addDays, dateToIso, isoToDate, todayInTz } from '../common/dates';
import { boundingBox, haversineKm, weatherGrid } from '../common/geo';
import { PrismaService } from '../prisma/prisma.service';
import { parseRulesConfig } from '../properties/property.mapper';

/** Events farther than this are never considered (engine applies distance decay inside the radius). */
export const EVENT_SEARCH_KM = 50;
/** Holidays/bookings slightly outside the horizon matter for long weekends and orphan gaps. */
const CONTEXT_PADDING_DAYS = 7;
const BOOKING_LOOKBACK_DAYS = 30;

export interface BuiltContext {
  ctx: PricingContext;
  today: string;
  end: string;
}

/** Builds the engine's PricingContext from the database (pure I/O; no pricing logic here). */
@Injectable()
export class PricingContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(property: Property, horizonDays: number, now: Date = new Date()): Promise<BuiltContext> {
    const today = todayInTz(property.timezone, now);
    const end = addDays(today, horizonDays - 1);
    const padFrom = isoToDate(addDays(today, -CONTEXT_PADDING_DAYS));
    const padTo = isoToDate(addDays(end, CONTEXT_PADDING_DAYS));
    const rules = parseRulesConfig(property.rulesConfig);
    const vacationState = rules.schoolVacationState ?? property.state;
    const box = boundingBox(property.lat, property.lng, EVENT_SEARCH_KM);
    const gLat = weatherGrid(property.lat);
    const gLng = weatherGrid(property.lng);

    const [bookings, holidays, events, vacations, weather] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          propertyId: property.id,
          status: { in: ['BOOKED', 'BLOCKED'] },
          checkOut: { gte: isoToDate(addDays(today, -BOOKING_LOOKBACK_DAYS)) },
          checkIn: { lte: padTo },
        },
        orderBy: { checkIn: 'asc' },
      }),
      this.prisma.holiday.findMany({
        where: {
          date: { gte: padFrom, lte: padTo },
          OR: [
            { scope: 'NATIONAL' },
            { scope: 'STATE', state: property.state },
            ...(property.ibgeCode ? [{ scope: 'MUNICIPAL' as const, ibgeCode: property.ibgeCode }] : []),
          ],
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.event.findMany({
        where: {
          // Only curated (verified) events affect prices.
          verified: true,
          startDate: { lte: padTo },
          endDate: { gte: isoToDate(today) },
          lat: { gte: box.minLat, lte: box.maxLat },
          lng: { gte: box.minLng, lte: box.maxLng },
        },
      }),
      this.prisma.schoolVacation.findMany({
        where: { state: vacationState, startDate: { lte: padTo }, endDate: { gte: padFrom } },
      }),
      this.prisma.weatherForecast.findMany({
        where: {
          lat: { gte: gLat - 0.001, lte: gLat + 0.001 },
          lng: { gte: gLng - 0.001, lte: gLng + 0.001 },
          date: { gte: isoToDate(addDays(today, -7)), lte: isoToDate(addDays(today, 7)) },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    const nearbyEvents = events
      .map((e) => ({ e, distanceKm: haversineKm(property.lat, property.lng, e.lat, e.lng) }))
      .filter(({ e, distanceKm }) => distanceKm <= Math.min(EVENT_SEARCH_KM, Math.max(e.radiusKm * 2, e.radiusKm + 5)));

    const ctx: PricingContext = {
      today,
      horizonDays,
      property: {
        basePrice: property.basePrice,
        minPrice: property.minPrice,
        maxPrice: property.maxPrice,
        cleaningFee: property.cleaningFee,
        platformFeePct: property.platformFeePct,
        destinationType: property.destinationType,
        state: property.state,
        aggressiveness: property.aggressiveness,
        rules: {
          enabled: rules.enabled,
          weekdayMultipliers: rules.weekdayMultipliers,
          seasonality: rules.seasonality,
          minProfitPerNight: rules.minProfitPerNight,
          carnivalMultiplier: rules.carnivalMultiplier,
          newYearMultiplier: rules.newYearMultiplier,
        },
      },
      bookings: bookings.map((b) => ({
        checkIn: dateToIso(b.checkIn),
        checkOut: dateToIso(b.checkOut),
        status: b.status === 'BLOCKED' ? 'blocked' : 'booked',
      })),
      holidays: holidays.map((h) => ({ date: dateToIso(h.date), name: h.name, isBridge: h.isBridge, kind: h.kind })),
      events: nearbyEvents.map(({ e, distanceKm }) => ({
        name: e.name,
        startDate: dateToIso(e.startDate),
        endDate: dateToIso(e.endDate),
        size: e.size,
        distanceKm: Math.round(distanceKm * 10) / 10,
        radiusKm: e.radiusKm,
      })),
      schoolVacations: vacations.map((v) => ({ startDate: dateToIso(v.startDate), endDate: dateToIso(v.endDate) })),
      weather: weather.map((w) => ({
        date: dateToIso(w.date),
        precipProb: w.precipProb,
        precipMm: w.precipMm ?? undefined,
        tempMin: w.tempMin,
        tempMax: w.tempMax,
      })),
    };
    return { ctx, today, end };
  }
}
