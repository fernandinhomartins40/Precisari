import { z } from 'zod';
import { Cents } from './common';

export const MonthMetrics = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  nightsAvailable: z.number().int(),
  nightsBooked: z.number().int(),
  /** 0..1 */
  occupancy: z.number(),
  /** Average daily rate, cents. */
  adr: Cents,
  revenue: Cents,
  /** Revenue − cleaning − platform fees − monthly fixed costs. */
  estimatedProfit: Cents,
});
export type MonthMetrics = z.infer<typeof MonthMetrics>;

export const InsightsDto = z.object({
  propertyId: z.string(),
  current: MonthMetrics,
  previous: MonthMetrics.nullable(),
  /** Baseline: 90 days before signup, normalized to a month. */
  baseline: MonthMetrics.nullable(),
  /** "Se tivesse aprovado tudo: +R$ X". */
  ifApprovedAllGain: Cents,
  approvalRate: z.number(),
  history: z.array(MonthMetrics),
});
export type InsightsDto = z.infer<typeof InsightsDto>;
