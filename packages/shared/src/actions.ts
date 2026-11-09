import { z } from 'zod';
import { ActionStatus, ActionType } from './enums';
import { Cents, IsoDate, Timestamp } from './common';
import { FactorDto } from './nights';

export const ActionDto = z.object({
  id: z.string(),
  propertyId: z.string(),
  propertyName: z.string(),
  date: IsoDate,
  type: ActionType,
  /** Price actions: cents. MIN_STAY actions: nights. */
  fromValue: z.number().int(),
  toValue: z.number().int(),
  estimatedGain: Cents,
  status: ActionStatus,
  headline: z.string(),
  explanation: z.string(),
  factors: z.array(FactorDto),
  withinLimits: z.boolean(),
  listingUrl: z.string().nullable(),
  decidedAt: Timestamp.nullable(),
  appliedAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type ActionDto = z.infer<typeof ActionDto>;

export const ActionsQuery = z.object({
  status: ActionStatus.optional(),
  propertyId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ActionsResponse = z.object({
  items: z.array(ActionDto),
  nextCursor: z.string().nullable(),
  /** Sum of estimatedGain over PENDING actions matching the filter. */
  totalEstimatedGain: Cents,
});
export type ActionsResponse = z.infer<typeof ActionsResponse>;
