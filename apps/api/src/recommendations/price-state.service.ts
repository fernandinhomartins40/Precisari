import { Injectable } from '@nestjs/common';
import { dateToIso, isoToDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_MIN_STAY, PRICE_FAMILY } from './action-generator';

export interface KnownState {
  /** RF-42 "current known price": last APPROVED/APPLIED price-family action for the date, else base price. */
  price(date: string): number;
  /** Last APPROVED/APPLIED minimum stay for the date, else DEFAULT_MIN_STAY. */
  minStay(date: string): number;
  /** Dates that have an explicitly approved price. */
  approvedPrices: Map<string, number>;
}

@Injectable()
export class PriceStateService {
  constructor(private readonly prisma: PrismaService) {}

  async load(property: { id: string; basePrice: number }, from: string, to: string): Promise<KnownState> {
    const decided = await this.prisma.action.findMany({
      where: { propertyId: property.id, status: { in: ['APPROVED', 'APPLIED'] }, date: { gte: isoToDate(from), lte: isoToDate(to) } },
      orderBy: [{ decidedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { date: true, type: true, toValue: true },
    });
    const prices = new Map<string, number>();
    const minStays = new Map<string, number>();
    for (const a of decided) {
      const d = dateToIso(a.date);
      if (a.type === 'MIN_STAY') {
        if (!minStays.has(d)) minStays.set(d, a.toValue);
      } else if (PRICE_FAMILY.includes(a.type) && !prices.has(d)) {
        prices.set(d, a.toValue);
      }
    }
    return {
      price: (d) => prices.get(d) ?? property.basePrice,
      minStay: (d) => minStays.get(d) ?? DEFAULT_MIN_STAY,
      approvedPrices: prices,
    };
  }
}
