import { ConnectCalendarBody } from '@precisari/shared';

/** Client-side check for an Airbnb iCal export link (the API validates it again on connect). */
export function isIcalUrl(url: string): boolean {
  const trimmed = url.trim();
  return ConnectCalendarBody.safeParse({ url: trimmed }).success && /^https?:\/\//i.test(trimmed) && /ical|\.ics(\?|$)/i.test(trimmed);
}
