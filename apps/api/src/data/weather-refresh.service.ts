import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsRegistry } from '../jobs/jobs.registry';
import { QUEUES } from '../jobs/queues';
import { WEATHER_PROVIDER, type DailyForecast, type WeatherProvider } from '../integrations/ports';
import { addDays, fromIsoDate, localDateHour, toIsoDate } from '../integrations/common/text';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingTriggersService } from './pricing-triggers.service';

/** Round to the 0.1° grid used to share forecasts by region (~11 km). */
export const gridRound = (v: number): number => Math.round(v * 10) / 10;

/** Material change thresholds (D-0..D-7 only affect prices — PRD §7.2). */
export function isMaterialChange(prev: { precipProb: number; tempMin: number; tempMax: number } | undefined, next: DailyForecast): boolean {
  if (!prev) return true;
  return Math.abs(prev.precipProb - next.precipProb) >= 20 || Math.abs(prev.tempMax - next.tempMax) >= 4 || Math.abs(prev.tempMin - next.tempMin) >= 4;
}

/** Strong weekend change worth an alert: dry→rainy (≥70%) or rainy→dry (<40%). */
export function weekendShift(prevProb: number | undefined, nextProb: number): 'rain' | 'sun' | null {
  if (prevProb === undefined) return null;
  if (prevProb < 50 && nextProb >= 70) return 'rain';
  if (prevProb >= 70 && nextProb < 40) return 'sun';
  return null;
}

/** `weather.refresh` every 6 h per grid cell: Open-Meteo 16 days + 7 past days → WeatherForecast. */
@Injectable()
export class WeatherRefreshService implements OnModuleInit {
  private readonly log = new Logger('WeatherRefreshService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobsRegistry,
    private readonly triggers: PricingTriggersService,
    private readonly notifications: NotificationsService,
    @Inject(WEATHER_PROVIDER) private readonly weather: WeatherProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(QUEUES.weatherRefresh, (d) => this.refresh(d).then(() => undefined), { pattern: '0 */6 * * *' });
  }

  async refresh(payload: { lat?: number; lng?: number } = {}, now = new Date()): Promise<{ cells: number; rows: number; recomputed: number }> {
    const properties = await this.prisma.property.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, userId: true, lat: true, lng: true, timezone: true, destinationType: true },
    });
    const cells = new Map<string, { lat: number; lng: number; props: typeof properties }>();
    for (const p of properties) {
      const lat = gridRound(p.lat);
      const lng = gridRound(p.lng);
      if (payload.lat !== undefined && payload.lng !== undefined && (lat !== gridRound(payload.lat) || lng !== gridRound(payload.lng))) continue;
      const key = `${lat}|${lng}`;
      const cell = cells.get(key) ?? { lat, lng, props: [] };
      cell.props.push(p);
      cells.set(key, cell);
    }

    let rows = 0;
    let recomputed = 0;
    for (const cell of cells.values()) {
      try {
        const tz = cell.props[0]?.timezone ?? 'America/Sao_Paulo';
        const today = localDateHour(now, tz).date;
        const nearEnd = addDays(today, 7);
        const forecast = await this.weather.forecast(cell.lat, cell.lng, { days: 16, pastDays: 7, timezone: tz });
        const previous = await this.prisma.weatherForecast.findMany({
          where: { lat: cell.lat, lng: cell.lng, date: { gte: fromIsoDate(today), lte: fromIsoDate(nearEnd) } },
        });
        const prevByDate = new Map(previous.map((p) => [toIsoDate(p.date), p]));

        await this.prisma.$transaction(
          forecast.map((f) =>
            this.prisma.weatherForecast.upsert({
              where: { lat_lng_date: { lat: cell.lat, lng: cell.lng, date: fromIsoDate(f.date) } },
              create: { lat: cell.lat, lng: cell.lng, date: fromIsoDate(f.date), precipProb: f.precipProb, precipMm: f.precipMm, tempMin: f.tempMin, tempMax: f.tempMax, fetchedAt: now },
              update: { precipProb: f.precipProb, precipMm: f.precipMm, tempMin: f.tempMin, tempMax: f.tempMax, fetchedAt: now },
            }),
          ),
        );
        rows += forecast.length;

        const near = forecast.filter((f) => f.date >= today && f.date <= nearEnd);
        if (near.some((f) => isMaterialChange(prevByDate.get(f.date), f))) {
          recomputed += await this.triggers.forProperties(cell.props.map((p) => p.id), 'weather');
        }
        await this.weekendAlerts(cell.props, near, prevByDate);
      } catch (err) {
        this.log.warn(`weather.refresh failed for cell ${cell.lat},${cell.lng}: ${(err as Error).message}`);
      }
    }
    return { cells: cells.size, rows, recomputed };
  }

  private async weekendAlerts(
    props: { id: string; name: string; userId: string; destinationType: string }[],
    near: DailyForecast[],
    prevByDate: Map<string, { precipProb: number }>,
  ): Promise<void> {
    const beach = props.filter((p) => p.destinationType === 'BEACH');
    if (beach.length === 0) return;
    for (const f of near) {
      const dow = new Date(`${f.date}T12:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6) continue;
      const shift = weekendShift(prevByDate.get(f.date)?.precipProb, f.precipProb);
      if (!shift) continue;
      for (const p of beach) {
        await this.notifications.alert(
          p.userId,
          { kind: 'weather_weekend', propertyId: p.id, propertyName: p.name, date: f.date, direction: shift },
          `weather:${p.id}:${f.date}:${shift}`,
        );
      }
    }
  }
}
