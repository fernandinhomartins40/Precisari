/**
 * All user-facing (pt-BR) strings produced by the engine live here, so they can be
 * reviewed or translated in one place.
 */

/** Formats a distance in pt-BR: 0.8 → "800 m", 2 → "2 km", 2.5 → "2,5 km". */
export function formatDistance(km: number): string {
  const safe = Math.max(0, km);
  if (safe < 1) return `${Math.round(safe * 1000)} m`;
  const rounded = Math.round(safe * 10) / 10;
  return `${String(rounded).replace('.', ',')} km`;
}

export const LABELS = {
  weekend: 'Fim de semana',
  sunday: 'Domingo',
  weekday: 'Dia de semana',
  highSeason: 'Alta temporada',
  lowSeason: 'Baixa temporada',
  holiday: (name: string): string => `Feriado: ${name}`,
  holidayEve: (name: string): string => `Véspera de feriado: ${name}`,
  longWeekend: 'Feriadão',
  carnival: 'Carnaval',
  newYear: 'Réveillon',
  event: (name: string, distanceKm: number): string =>
    `Evento a ${formatDistance(distanceKm)}: ${name}`,
  schoolVacation: 'Férias escolares',
  rain: 'Chuva prevista',
  sunAfterRain: 'Sol depois de dias de chuva',
  intenseCold: 'Frio intenso',
  dateApproaching: 'Data se aproximando',
  earlyBooking: 'Reserva antecipada',
  orphan: 'Noite órfã',
  adjacentCheckOut: 'Colada a um check-out',
  adjacentCheckIn: 'Colada a um check-in',
  minStayGap: 'Estadia mínima limitada pela lacuna',
  profitProtection: 'Estadia mínima ajustada',
  maxLimit: 'Limite máximo',
  minLimit: 'Limite mínimo',
} as const;
