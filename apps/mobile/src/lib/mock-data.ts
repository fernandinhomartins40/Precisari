/**
 * Demo data for mock mode ("Studio do Campeche", Florianópolis). Deterministic for a given "today".
 * Content strings here simulate SERVER data (headlines/explanations are produced by the API), not UI copy.
 */
import type {
  ActionDto,
  FactorDto,
  InsightsDto,
  MonthMetrics,
  NearbyEventDto,
  NightDetailDto,
  NightDto,
  PlaceDetailsDto,
  PlanDto,
  PropertyDto,
  UserDto,
  WeatherDto,
} from '@precisari/shared';
import { addDays, daysBetween, monthKey, parseIso, weekdayOf } from './dates';

export const DEMO_PROPERTY_ID = 'prop_campeche';
/** Resolved by the UI to the bundled demo photo (see lib/property-photo.ts). */
export const DEMO_PHOTO_URL = 'https://demo.precisari.com.br/photos/studio-campeche.jpg';

const WEEKDAY_MULT = [0.92, 0.85, 0.85, 0.9, 1.0, 1.15, 1.3] as const; // Sun..Sat
const BEACH_SOUTH_SEASON = [1.45, 1.35, 1.1, 0.95, 0.85, 0.8, 0.75, 0.8, 0.85, 0.95, 1.0, 1.2] as const;

const HOLIDAYS: Record<string, { name: string; key: 'holiday' | 'longWeekend' | 'newYear' | 'carnival'; mult: number }> = {
  '2026-11-15': { name: 'Proclamação da República', key: 'holiday', mult: 1.25 },
  '2026-11-20': { name: 'Dia da Consciência Negra', key: 'longWeekend', mult: 1.35 },
  '2026-12-24': { name: 'Véspera de Natal', key: 'holiday', mult: 1.25 },
  '2026-12-25': { name: 'Natal', key: 'holiday', mult: 1.25 },
  '2026-12-31': { name: 'Réveillon', key: 'newYear', mult: 2.0 },
  '2027-01-01': { name: 'Confraternização Universal', key: 'holiday', mult: 1.25 },
  '2027-02-08': { name: 'Carnaval', key: 'carnival', mult: 1.6 },
  '2027-02-09': { name: 'Carnaval', key: 'carnival', mult: 1.6 },
};

/** Psychological rounding: whole reais ending in 9 (in cents). */
export function roundPsych(cents: number): number {
  const reais = Math.round(cents / 1000) * 10 - 1;
  return Math.max(9, reais) * 100;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export interface MockPropertyState {
  property: PropertyDto;
  /** Dates with a booking or block. */
  booked: Set<string>;
  blocked: Set<string>;
  /** Approved overrides: date → current price (cents). */
  approved: Map<string, number>;
  /** Demo property: current price equals suggestion except on pending-action nights. */
  demo: boolean;
  /** Date the event in the demo explanation happens. */
  eventDate: string | null;
}

export function firstSaturdayFrom(today: string, minDays = 2): string {
  let d = addDays(today, minDays);
  while (weekdayOf(d) !== 6) d = addDays(d, 1);
  return d;
}

function factorsFor(state: MockPropertyState, date: string, today: string): FactorDto[] {
  const p = state.property;
  const wd = weekdayOf(date);
  const factors: FactorDto[] = [];
  const isWeekend = wd === 5 || wd === 6;
  factors.push({ key: 'weekday', multiplier: WEEKDAY_MULT[wd] ?? 1, label: isWeekend ? 'Fim de semana' : 'Dia da semana' });
  if (p.destinationType === 'BEACH') {
    const m = BEACH_SOUTH_SEASON[parseIso(date).getUTCMonth()] ?? 1;
    if (m !== 1) factors.push({ key: 'seasonality', multiplier: m, label: m > 1 ? 'Alta temporada' : 'Baixa temporada' });
  }
  const h = HOLIDAYS[date];
  if (h) factors.push({ key: h.key, multiplier: h.mult, label: h.name });
  if (state.eventDate === date) factors.push({ key: 'event', multiplier: 1.3, label: 'Evento próximo' });
  const lead = daysBetween(today, date);
  const leadMult = lead > 60 ? 1.05 : lead >= 30 ? 1 : lead >= 14 ? 0.97 : lead >= 7 ? 0.93 : lead >= 3 ? 0.88 : 0.8;
  if (leadMult !== 1 && !state.booked.has(date)) factors.push({ key: 'leadTime', multiplier: leadMult, label: 'Antecedência' });
  return factors;
}

function isOrphan(state: MockPropertyState, date: string): boolean {
  if (state.booked.has(date)) return false;
  const prev = state.booked.has(addDays(date, -1));
  const next = state.booked.has(addDays(date, 1));
  const next2 = state.booked.has(addDays(date, 2));
  const prev2 = state.booked.has(addDays(date, -2));
  return (prev && next) || (prev && next2 && !next) || (prev2 && next && !prev);
}

export function computeNight(state: MockPropertyState, date: string, today: string, pendingAction?: ActionDto): NightDto {
  const p = state.property;
  const status: NightDto['status'] = state.blocked.has(date) ? 'blocked' : state.booked.has(date) ? 'booked' : 'free';
  const factors = factorsFor(state, date, today);
  const orphan = isOrphan(state, date);
  if (orphan) factors.push({ key: 'orphan', multiplier: 0.8, label: 'Noite órfã' });
  const raw = factors.reduce((acc, f) => acc * f.multiplier, p.basePrice);
  const clamped = Math.min(p.maxPrice, Math.max(p.minPrice, raw));
  if (clamped !== raw) factors.push({ key: 'limit', multiplier: clamped / raw, label: 'Seu limite' });
  let suggested = Math.min(p.maxPrice, Math.max(p.minPrice, roundPsych(clamped)));
  if (pendingAction) suggested = pendingAction.toValue;
  // Heat = opportunity relative to the host's base price (0.8× → cold … 1.35× → hot).
  const jitter = (hash(date + p.id) - 0.5) * 0.06;
  const heat = Math.min(1, Math.max(0, (suggested / p.basePrice - 0.8) / 0.55 + jitter));
  let current = state.approved.get(date) ?? (state.demo ? suggested : p.basePrice);
  if (pendingAction) current = pendingAction.fromValue;
  const lead = daysBetween(today, date);
  const minStay = HOLIDAYS[date]?.key === 'newYear' ? 4 : orphan ? 1 : lead > 30 ? 3 : lead >= 14 ? 2 : 1;
  return {
    date,
    status,
    suggestedPrice: suggested,
    currentPrice: current,
    minStay,
    ...(orphan ? { discountPct: 20 } : {}),
    factors,
    heat: Math.round(heat * 100) / 100,
    explanation: pendingAction?.explanation ?? (HOLIDAYS[date] ? `${HOLIDAYS[date]?.name} aumenta a procura na região.` : null),
    headline: pendingAction?.headline ?? null,
    isOrphan: orphan,
  };
}

export function weatherFor(date: string, today: string): WeatherDto | null {
  const lead = daysBetween(today, date);
  if (lead < 0 || lead > 7) return null;
  const r = hash(`w${date}`);
  const condition: WeatherDto['condition'] = r < 0.45 ? 'partly' : r < 0.7 ? 'sun' : r < 0.9 ? 'cloud' : 'rain';
  return {
    date,
    precipProb: condition === 'rain' ? 75 : Math.round(r * 30),
    precipMm: condition === 'rain' ? 8 : 0,
    tempMin: 18 + Math.round(r * 3),
    tempMax: 24 + Math.round(r * 5),
    condition,
  };
}

export function nightDetail(state: MockPropertyState, date: string, today: string, pending?: ActionDto): NightDetailDto {
  const night = computeNight(state, date, today, pending);
  const events: NearbyEventDto[] =
    state.eventDate && Math.abs(daysBetween(state.eventDate, date)) <= 1
      ? [{ id: 'evt_festival', name: 'Festival de Verão do Campeche', startDate: state.eventDate, endDate: addDays(state.eventDate, 1), size: 'M', distanceKm: 2 }]
      : [];
  const h = HOLIDAYS[date];
  return {
    ...night,
    minPrice: state.property.minPrice,
    maxPrice: state.property.maxPrice,
    weather: weatherFor(date, today),
    events,
    holidays: h ? [{ date, name: h.name }] : [],
    pendingActionId: pending?.id ?? null,
  };
}

export function demoUser(today: string): UserDto {
  return {
    id: 'usr_carla',
    email: 'carla@exemplo.com.br',
    name: 'Carla Souza',
    authProvider: 'EMAIL',
    role: 'USER',
    dailyNotificationHour: 9,
    timezone: 'America/Sao_Paulo',
    emailWeeklySummary: true,
    subscription: {
      plan: 'PRO',
      status: 'TRIALING',
      currentPeriodEnd: null,
      trialEndsAt: `${addDays(today, 10)}T12:00:00.000Z`,
    },
    createdAt: `${addDays(today, -4)}T12:00:00.000Z`,
  };
}

export function demoPropertyState(today: string): MockPropertyState {
  const sat = firstSaturdayFrom(today);
  const booked = new Set<string>();
  const book = (start: string, nights: number) => {
    for (let i = 0; i < nights; i += 1) booked.add(addDays(start, i));
  };
  book(addDays(sat, -2), 2); // Thu–Fri before the hot Saturday
  book(addDays(sat, 5), 2);
  book(addDays(sat, 12), 3);
  book(addDays(sat, 19), 2);
  book(addDays(sat, 22), 2); // leaves a 1-night orphan gap at sat+21
  book(addDays(sat, 33), 4);
  book(addDays(sat, 44), 6);
  book(addDays(sat, 61), 3);
  book(addDays(sat, 75), 2);
  book(addDays(sat, 96), 5);
  const property: PropertyDto = {
    id: DEMO_PROPERTY_ID,
    name: 'Studio do Campeche',
    address: 'Av. Pequeno Príncipe, 1200 - Campeche, Florianópolis - SC',
    lat: -27.6766,
    lng: -48.4836,
    city: 'Florianópolis',
    state: 'SC',
    ibgeCode: '4205407',
    destinationType: 'BEACH',
    capacity: 3,
    bedrooms: 1,
    basePrice: 24900,
    minPrice: 19900,
    maxPrice: 34900,
    cleaningFee: 12000,
    monthlyFixedCosts: 45000,
    platformFeePct: 0.03,
    aggressiveness: 'BALANCED',
    rulesConfig: { enabled: {} },
    timezone: 'America/Sao_Paulo',
    listingUrl: 'https://www.airbnb.com.br/',
    photoUrl: DEMO_PHOTO_URL,
    calendarSources: [
      {
        id: 'cal_campeche',
        type: 'ICAL',
        urlMasked: 'https://www.airbnb.com.br/calendar/ical/••••.ics',
        lastSyncAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        status: 'OK',
        lastError: null,
      },
    ],
    createdAt: `${addDays(today, -4)}T12:00:00.000Z`,
  };
  return { property, booked, blocked: new Set([addDays(sat, 52)]), approved: new Map(), demo: true, eventDate: sat };
}

export function demoActions(state: MockPropertyState, today: string): ActionDto[] {
  const sat = state.eventDate ?? firstSaturdayFrom(today);
  const created = `${today}T06:00:00.000Z`;
  const base = {
    propertyId: state.property.id,
    propertyName: state.property.name,
    type: 'PRICE' as const,
    status: 'PENDING' as const,
    withinLimits: true,
    listingUrl: state.property.listingUrl,
    decidedAt: null,
    appliedAt: null,
    createdAt: created,
  };
  return [
    {
      ...base,
      id: 'act_1',
      date: sat,
      fromValue: 24900,
      toValue: 34900,
      estimatedGain: 10000,
      headline: 'Sábado tá disputado.',
      explanation: 'Um evento a 2 km pode aumentar a procura pelo seu studio.',
      factors: [
        { key: 'event', multiplier: 1.3, label: 'Evento próximo' },
        { key: 'weekday', multiplier: 1.3, label: 'Fim de semana' },
      ],
    },
    {
      ...base,
      id: 'act_2',
      date: addDays(sat, 7),
      fromValue: 24900,
      toValue: 34900,
      estimatedGain: 10000,
      headline: 'Temporada esquentando.',
      explanation: 'A procura por praia em Florianópolis sobe na segunda quinzena de novembro.',
      factors: [
        { key: 'seasonality', multiplier: 1.1, label: 'Alta temporada' },
        { key: 'weekday', multiplier: 1.3, label: 'Fim de semana' },
      ],
    },
    {
      ...base,
      id: 'act_3',
      date: addDays(sat, 1),
      fromValue: 24900,
      toValue: 32900,
      estimatedGain: 8000,
      headline: 'Domingo com cara de feriado.',
      explanation: 'Quem chega no sábado para o evento tende a ficar mais uma noite.',
      factors: [
        { key: 'event', multiplier: 1.15, label: 'Evento próximo' },
        { key: 'leadTime', multiplier: 0.93, label: 'Antecedência' },
      ],
    },
  ];
}

export function newPropertyState(property: PropertyDto, today: string): MockPropertyState {
  const booked = new Set<string>();
  // Pretend the iCal import found a few bookings.
  for (const [offset, nights] of [[6, 2], [15, 3], [29, 2], [41, 4], [58, 2]] as const) {
    for (let i = 0; i < nights; i += 1) booked.add(addDays(today, offset + i));
  }
  return { property, booked, blocked: new Set(), approved: new Map(), demo: false, eventDate: null };
}

function metrics(month: string, nightsBooked: number, adr: number, nightsAvailable = 30): MonthMetrics {
  const revenue = nightsBooked * adr;
  const profit = Math.round(revenue * 0.97 - Math.ceil(nightsBooked / 2.5) * 12000 - 45000);
  return {
    month,
    nightsAvailable,
    nightsBooked,
    occupancy: Math.round((nightsBooked / nightsAvailable) * 1000) / 1000,
    adr,
    revenue,
    estimatedProfit: profit,
  };
}

function prevMonth(month: string, back: number): string {
  const d = parseIso(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 7);
}

export function demoInsights(propertyId: string, month: string, approvalRate = 0.62): InsightsDto {
  const series: [number, number][] = [
    [12, 21900],
    [13, 22400],
    [14, 22900],
    [15, 24100],
    [17, 25600],
    [19, 27400],
  ];
  const history = series.map(([n, adr], i) => metrics(prevMonth(month, series.length - 1 - i), n, adr));
  const current = history[history.length - 1] ?? metrics(month, 19, 27400);
  return {
    propertyId,
    current,
    previous: history[history.length - 2] ?? null,
    baseline: metrics('2026-08', 14, 22900),
    ifApprovedAllGain: 41000,
    approvalRate,
    history,
  };
}

export const demoPlans: PlanDto[] = [
  {
    plan: 'FREE',
    name: 'Grátis',
    monthlyPricePerProperty: 0,
    yearlyPricePerProperty: 0,
    horizonDays: 30,
    maxProperties: 1,
    features: ['1 imóvel', 'Recomendações para 30 dias', 'Resumo semanal'],
    trialDays: 0,
  },
  {
    plan: 'PRO',
    name: 'Pro',
    monthlyPricePerProperty: 2990,
    yearlyPricePerProperty: 29900,
    horizonDays: 180,
    maxProperties: null,
    features: ['Recomendações diárias para 180 dias', 'Eventos e clima', 'Noites órfãs', 'Relatório de lucro'],
    trialDays: 14,
  },
  {
    plan: 'AUTO',
    name: 'Automático',
    monthlyPricePerProperty: 4490,
    yearlyPricePerProperty: 44900,
    horizonDays: 180,
    maxProperties: null,
    features: ['Tudo do Pro', 'Aplicação automática no Airbnb'],
    trialDays: 14,
  },
];

export const demoPlaces: PlaceDetailsDto[] = [
  {
    placeId: 'place_campeche',
    address: 'Av. Pequeno Príncipe, 1200 - Campeche, Florianópolis - SC',
    lat: -27.6766,
    lng: -48.4836,
    city: 'Florianópolis',
    state: 'SC',
    ibgeCode: '4205407',
    suggestedDestinationType: 'BEACH',
  },
  {
    placeId: 'place_lagoa',
    address: 'Rua Osni Ortiga, 800 - Lagoa da Conceição, Florianópolis - SC',
    lat: -27.6005,
    lng: -48.4687,
    city: 'Florianópolis',
    state: 'SC',
    ibgeCode: '4205407',
    suggestedDestinationType: 'BEACH',
  },
  {
    placeId: 'place_gramado',
    address: 'Rua Coberta, 120 - Centro, Gramado - RS',
    lat: -29.3787,
    lng: -50.8737,
    city: 'Gramado',
    state: 'RS',
    ibgeCode: '4309100',
    suggestedDestinationType: 'MOUNTAIN',
  },
  {
    placeId: 'place_paulista',
    address: 'Av. Paulista, 1500 - Bela Vista, São Paulo - SP',
    lat: -23.5614,
    lng: -46.6559,
    city: 'São Paulo',
    state: 'SP',
    ibgeCode: '3550308',
    suggestedDestinationType: 'URBAN',
  },
  {
    placeId: 'place_ouropreto',
    address: 'Rua Direita, 50 - Centro, Ouro Preto - MG',
    lat: -20.3856,
    lng: -43.5035,
    city: 'Ouro Preto',
    state: 'MG',
    ibgeCode: '3146107',
    suggestedDestinationType: 'CULTURAL',
  },
];

export function demoMonth(today: string): string {
  return monthKey(today);
}
