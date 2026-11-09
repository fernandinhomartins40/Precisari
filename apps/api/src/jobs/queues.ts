/** BullMQ queue names (docs/prd.md §8.5). */
export const QUEUES = {
  icalSync: 'ical.sync',
  weatherRefresh: 'weather.refresh',
  holidaysSync: 'holidays.sync',
  pricingRecompute: 'pricing.recompute',
  explanationsGenerate: 'explanations.generate',
  eventsIngest: 'events.ingest',
  notificationsDaily: 'notifications.daily',
  notificationsWeekly: 'notifications.weekly',
  insightsMonthly: 'insights.monthly',
  channexPush: 'channex.push',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Payloads per queue. */
export interface JobPayloads {
  'ical.sync': { propertyId?: string };
  'weather.refresh': { lat?: number; lng?: number };
  'holidays.sync': { year?: number };
  'pricing.recompute': { propertyId?: string; reason?: string };
  'explanations.generate': { propertyId: string };
  'events.ingest': Record<string, never>;
  'notifications.daily': { userId?: string };
  'notifications.weekly': { userId?: string };
  'insights.monthly': { month?: string };
  'channex.push': { actionId?: string; propertyId?: string };
}
