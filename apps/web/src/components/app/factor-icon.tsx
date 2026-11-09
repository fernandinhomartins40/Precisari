import {
  BedDouble,
  CalendarDays,
  CalendarRange,
  CloudSun,
  Clock,
  Flame,
  GraduationCap,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Sun,
  Unlink,
} from 'lucide-react';
import type { FactorKey } from '@precisari/shared';

export function FactorIcon({ k, size = 18 }: { k: FactorKey; size?: number }) {
  const p = { size, 'aria-hidden': true } as const;
  switch (k) {
    case 'weekday':
      return <CalendarDays {...p} />;
    case 'seasonality':
      return <Sun {...p} />;
    case 'holiday':
    case 'longWeekend':
      return <CalendarRange {...p} />;
    case 'carnival':
    case 'newYear':
      return <PartyPopper {...p} />;
    case 'event':
      return <Flame {...p} />;
    case 'schoolVacation':
      return <GraduationCap {...p} />;
    case 'weather':
      return <CloudSun {...p} />;
    case 'leadTime':
      return <Clock {...p} />;
    case 'orphan':
      return <Unlink {...p} />;
    case 'adjacent':
    case 'minStay':
      return <BedDouble {...p} />;
    case 'profitProtection':
    case 'limit':
      return <ShieldCheck {...p} />;
    default:
      return <Sparkles {...p} />;
  }
}

/** Multiplier → "+20%" / "−15%" / "=" for display next to a factor. */
export function formatWeight(multiplier: number): string {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct === 0) return '=';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}
