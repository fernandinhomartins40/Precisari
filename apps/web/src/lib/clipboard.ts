/** Airbnb host calendar, used when the property has no listing URL. */
export const AIRBNB_HOST_CALENDAR_URL = 'https://www.airbnb.com.br/hosting/calendar';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Value pasted into Airbnb's price field: whole reais, no symbol ("349"). */
export function priceForClipboard(cents: number): string {
  return String(Math.round(cents / 100));
}

/** Opens the listing (or Airbnb calendar) in a new tab. Must run inside a user gesture. */
export function openListing(url: string | null | undefined): void {
  window.open(url || AIRBNB_HOST_CALENDAR_URL, '_blank', 'noopener,noreferrer');
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
