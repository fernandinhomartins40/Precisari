import { HttpStatus, Injectable } from '@nestjs/common';
import type { NightPrice } from '@prisma/client';
import { z } from 'zod';
import { ErrorCode, FactorDto, NightStatus, type NightDetailDto, type NightDto, type NightsResponse } from '@precisari/shared';
import { AppError } from '../common/app-error';
import { addDays, dateToIso, diffDays, isoToDate, todayInTz } from '../common/dates';
import { boundingBox, haversineKm, weatherGrid } from '../common/geo';
import { PlanService } from '../common/plan.service';
import { EVENT_SEARCH_KM } from '../pricing/pricing-context.builder';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { PriceStateService, type KnownState } from '../recommendations/price-state.service';
import { weatherCondition } from './weather-condition';

const MAX_RANGE_DAYS = 366;

function toNightDto(n: NightPrice, state: KnownState): NightDto {
  const factors = z.array(FactorDto).safeParse(n.factors);
  const status = NightStatus.safeParse(n.status);
  const date = dateToIso(n.date);
  return {
    date,
    status: status.success ? status.data : 'free',
    suggestedPrice: n.suggestedPrice,
    currentPrice: state.price(date),
    minStay: Math.max(1, n.minStay),
    ...(n.discountPct !== null ? { discountPct: n.discountPct } : {}),
    factors: factors.success ? factors.data : [],
    heat: Math.min(1, Math.max(0, n.heat)),
    explanation: n.explanation,
    headline: n.headline,
    isOrphan: n.isOrphan,
  };
}

@Injectable()
export class NightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly pricing: PricingService,
    private readonly priceState: PriceStateService,
    private readonly plans: PlanService,
  ) {}

  async list(userId: string, propertyId: string, q: { from?: string; to?: string }): Promise<NightsResponse> {
    const property = await this.properties.getOwned(userId, propertyId);
    const today = todayInTz(property.timezone);
    const { horizonDays } = await this.plans.limitsFor(userId);
    const from = q.from ?? today;
    const to = q.to ?? addDays(today, horizonDays - 1);
    if (to < from || diffDays(from, to) > MAX_RANGE_DAYS) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Período inválido', { from, to });
    }
    await this.pricing.ensureFresh(property);
    const [rows, state] = await Promise.all([
      this.prisma.nightPrice.findMany({
        where: { propertyId, date: { gte: isoToDate(from), lte: isoToDate(to) } },
        orderBy: { date: 'asc' },
      }),
      this.priceState.load(property, from, to),
    ]);
    const nights = rows.map((n) => toNightDto(n, state));
    const potentialGain = nights.filter((n) => n.status === 'free').reduce((sum, n) => sum + Math.max(0, n.suggestedPrice - n.currentPrice), 0);
    return { propertyId, from, to, potentialGain, nights };
  }

  async detail(userId: string, propertyId: string, date: string): Promise<NightDetailDto> {
    const property = await this.properties.getOwned(userId, propertyId);
    await this.pricing.ensureFresh(property);
    const day = isoToDate(date);
    const night = await this.prisma.nightPrice.findUnique({ where: { propertyId_date: { propertyId, date: day } } });
    if (!night) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Ainda não calculamos essa noite');

    const gLat = weatherGrid(property.lat);
    const gLng = weatherGrid(property.lng);
    const box = boundingBox(property.lat, property.lng, EVENT_SEARCH_KM);
    const [state, weather, events, holidays, pending] = await Promise.all([
      this.priceState.load(property, date, date),
      this.prisma.weatherForecast.findFirst({
        where: { lat: { gte: gLat - 0.001, lte: gLat + 0.001 }, lng: { gte: gLng - 0.001, lte: gLng + 0.001 }, date: day },
        orderBy: { fetchedAt: 'desc' },
      }),
      this.prisma.event.findMany({
        where: { startDate: { lte: day }, endDate: { gte: day }, lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
      }),
      this.prisma.holiday.findMany({
        where: {
          date: day,
          OR: [
            { scope: 'NATIONAL' },
            { scope: 'STATE', state: property.state },
            ...(property.ibgeCode ? [{ scope: 'MUNICIPAL' as const, ibgeCode: property.ibgeCode }] : []),
          ],
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.action.findFirst({
        where: { propertyId, date: day, status: 'PENDING' },
        orderBy: [{ estimatedGain: 'desc' }, { createdAt: 'asc' }],
        select: { id: true },
      }),
    ]);

    const nearby = events
      .map((e) => ({ e, distanceKm: haversineKm(property.lat, property.lng, e.lat, e.lng) }))
      .filter(({ e, distanceKm }) => distanceKm <= Math.min(EVENT_SEARCH_KM, Math.max(e.radiusKm * 2, e.radiusKm + 5)))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      ...toNightDto(night, state),
      minPrice: property.minPrice,
      maxPrice: property.maxPrice,
      weather: weather
        ? {
            date,
            precipProb: weather.precipProb,
            precipMm: weather.precipMm,
            tempMin: weather.tempMin,
            tempMax: weather.tempMax,
            condition: weatherCondition(weather),
          }
        : null,
      events: nearby.map(({ e, distanceKm }) => ({
        id: e.id,
        name: e.name,
        startDate: dateToIso(e.startDate),
        endDate: dateToIso(e.endDate),
        size: e.size,
        distanceKm: Math.round(distanceKm * 10) / 10,
      })),
      holidays: holidays.map((h) => ({ date: dateToIso(h.date), name: h.name })),
      pendingActionId: pending?.id ?? null,
    };
  }
}
