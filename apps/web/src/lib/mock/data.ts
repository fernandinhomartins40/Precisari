/**
 * Demo data for mock mode ("Studio do Campeche", Florianópolis). Everything is derived from `today`
 * so the demo always looks current. Strings here are demo *content* returned by the fake API
 * (the real API also returns localized labels/explanations), not UI copy.
 */
import type {
  ActionDto,
  EventDto,
  FactorDto,
  HolidayDto,
  InsightsDto,
  MonthMetrics,
  NearbyEventDto,
  NightDetailDto,
  NightDto,
  PlanDto,
  PropertyDto,
  SchoolVacationDto,
  UserDto,
  WeatherDto,
  AdminHealthDto,
  PlaceDetailsDto,
  BrazilState,
  DestinationType,
} from '@precisari/shared';
import { addDays, addMonths, diffDays, parseIso, weekdayOf } from '../dates';

export interface MockBooking {
  checkIn: string;
  checkOut: string;
}

export interface MockCheckout {
  id: string;
  plan: 'PRO' | 'AUTO';
  method: 'PIX' | 'CARD' | 'BOLETO';
  createdAt: number;
}

export interface MockDb {
  version: number;
  today: string;
  seq: number;
  user: UserDto;
  accessTokens: Record<string, number>;
  refreshTokens: string[];
  properties: PropertyDto[];
  bookings: Record<string, MockBooking[]>;
  approvedPrices: Record<string, Record<string, number>>;
  actions: ActionDto[];
  events: EventDto[];
  holidays: HolidayDto[];
  vacations: SchoolVacationDto[];
  checkouts: MockCheckout[];
}

export const MOCK_DB_VERSION = 3;
export const DEMO_PROPERTY_ID = 'prop_campeche';

const CAMPECHE = { lat: -27.6789, lng: -48.4867 };

/** Price ladder (cents) for base R$ 249; other bases scale proportionally. */
const LADDER = [19900, 22900, 24900, 28900, 32900, 34900] as const;
const HEAT = [0.12, 0.3, 0.5, 0.68, 0.84, 0.95] as const;
const WEEKDAY_MULT = [0.9, 0.85, 0.85, 0.88, 0.95, 1.15, 1.2] as const;
const WEEKDAY_SCORE = [2, 0, 0, 0, 0, 2, 3] as const;
const SEASON_MULT = [1.45, 1.3, 1.1, 0.95, 0.85, 0.8, 0.75, 0.8, 0.85, 0.95, 1.0, 1.15] as const;
const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

function ts(ms: number): string {
  return new Date(ms).toISOString();
}

/** Next Saturday at least 3 days after `today`. */
export function anchorSaturday(today: string): string {
  let d = addDays(today, 3);
  while (weekdayOf(d) !== 6) d = addDays(d, 1);
  return d;
}

function psychRound(cents: number): number {
  const reais = Math.round(cents / 100);
  const tens = Math.floor(reais / 10) * 10;
  const candidates = [tens - 1, tens + 5, tens + 9];
  let best = candidates[0] ?? reais;
  for (const c of candidates) if (Math.abs(c - reais) < Math.abs(best - reais)) best = c;
  return best * 100;
}

function scaled(base: number, idx: number): number {
  const v = LADDER[Math.max(0, Math.min(LADDER.length - 1, idx))] ?? 24900;
  return base === 24900 ? v : psychRound((v * base) / 24900);
}

export function seedHolidays(): HolidayDto[] {
  const h = (id: string, date: string, name: string, extra: Partial<HolidayDto> = {}): HolidayDto => ({
    id,
    date,
    name,
    scope: 'NATIONAL',
    state: null,
    ibgeCode: null,
    isBridge: false,
    kind: 'REGULAR',
    ...extra,
  });
  return [
    h('hol_1', '2026-11-15', 'Proclamação da República'),
    h('hol_2', '2026-11-20', 'Dia da Consciência Negra'),
    h('hol_3', '2026-12-25', 'Natal'),
    h('hol_4', '2026-12-31', 'Réveillon', { kind: 'NEW_YEAR' }),
    h('hol_5', '2027-01-01', 'Confraternização Universal'),
    h('hol_6', '2027-02-08', 'Carnaval', { kind: 'CARNIVAL', isBridge: true }),
    h('hol_7', '2027-02-09', 'Carnaval', { kind: 'CARNIVAL' }),
    h('hol_8', '2027-03-23', 'Aniversário de Florianópolis', { scope: 'MUNICIPAL', state: 'SC', ibgeCode: '4205407' }),
    h('hol_9', '2027-03-26', 'Sexta-feira Santa'),
    h('hol_10', '2027-04-21', 'Tiradentes'),
    h('hol_11', '2027-08-11', 'Data Magna de Santa Catarina', { scope: 'STATE', state: 'SC' }),
  ];
}

export function seedVacations(): SchoolVacationDto[] {
  return [
    { id: 'vac_1', state: 'SC', startDate: '2026-12-18', endDate: '2027-02-10', year: 2026 },
    { id: 'vac_2', state: 'SP', startDate: '2026-12-19', endDate: '2027-02-01', year: 2026 },
    { id: 'vac_3', state: 'RS', startDate: '2026-12-22', endDate: '2027-02-17', year: 2026 },
    { id: 'vac_4', state: 'PR', startDate: '2026-12-18', endDate: '2027-02-08', year: 2026 },
  ];
}

export function seedEvents(today: string): EventDto[] {
  const sat = anchorSaturday(today);
  return [
    {
      id: 'evt_1',
      name: 'Festival Gastronômico do Campeche',
      city: 'Florianópolis',
      state: 'SC',
      lat: -27.6609,
      lng: -48.4867,
      startDate: sat,
      endDate: sat,
      size: 'M',
      radiusKm: 5,
      source: 'manual',
      verified: true,
    },
    {
      id: 'evt_2',
      name: 'Réveillon na Beira-Mar',
      city: 'Florianópolis',
      state: 'SC',
      lat: -27.5841,
      lng: -48.5468,
      startDate: '2026-12-31',
      endDate: '2027-01-01',
      size: 'XG',
      radiusKm: 15,
      source: 'manual',
      verified: true,
    },
    {
      id: 'evt_3',
      name: 'Congresso Sul de Tecnologia',
      city: 'Florianópolis',
      state: 'SC',
      lat: -27.5969,
      lng: -48.5495,
      startDate: addDays(sat, 25),
      endDate: addDays(sat, 27),
      size: 'G',
      radiusKm: 10,
      source: 'manual',
      verified: false,
    },
  ];
}

export function seedPlans(): PlanDto[] {
  return [
    {
      plan: 'FREE',
      name: 'Grátis',
      monthlyPricePerProperty: 0,
      yearlyPricePerProperty: 0,
      horizonDays: 30,
      maxProperties: 1,
      features: ['Importe seu calendário via iCal', 'Sugestões para os próximos 30 dias', 'Contexto de cada recomendação', 'Resumo semanal por e-mail', 'Para 1 imóvel'],
      trialDays: 0,
    },
    {
      plan: 'PRO',
      name: 'Pro',
      monthlyPricePerProperty: 2990,
      yearlyPricePerProperty: 29900,
      horizonDays: 180,
      maxProperties: null,
      features: ['Tudo do plano Grátis', 'Sugestões diárias para 180 dias', 'Eventos, clima e noites órfãs', 'Relatório de lucro estimado', 'Para quantos imóveis você precisar'],
      trialDays: 14,
    },
    {
      plan: 'AUTO',
      name: 'Automático',
      monthlyPricePerProperty: 4490,
      yearlyPricePerProperty: 44900,
      horizonDays: 180,
      maxProperties: null,
      features: ['Tudo do plano Pro', 'Preço aplicado automaticamente no Airbnb', 'Sempre dentro dos seus limites'],
      trialDays: 14,
    },
  ];
}

function demoUser(nowMs: number, email = 'carla@exemplo.com.br'): UserDto {
  return {
    id: 'usr_carla',
    email,
    name: email.startsWith('admin') ? 'Equipe Precisari' : 'Carla',
    authProvider: 'EMAIL',
    role: email.startsWith('admin') ? 'ADMIN' : 'USER',
    dailyNotificationHour: 9,
    timezone: 'America/Sao_Paulo',
    emailWeeklySummary: true,
    subscription: { plan: 'PRO', status: 'TRIALING', currentPeriodEnd: null, trialEndsAt: ts(nowMs + 9 * 86_400_000) },
    createdAt: ts(nowMs - 5 * 86_400_000),
  };
}

export function withUserEmail(user: UserDto, email: string): UserDto {
  const isAdmin = email.startsWith('admin');
  return { ...user, email, role: isAdmin ? 'ADMIN' : 'USER', name: user.name ?? (isAdmin ? 'Equipe Precisari' : 'Carla') };
}

export function makeProperty(
  id: string,
  nowMs: number,
  fields: Omit<PropertyDto, 'id' | 'calendarSources' | 'createdAt'>,
  calendarUrl: string | null,
): PropertyDto {
  return {
    id,
    ...fields,
    calendarSources: calendarUrl
      ? [
          {
            id: `cal_${id}`,
            type: 'ICAL',
            urlMasked: maskUrl(calendarUrl),
            lastSyncAt: ts(nowMs - 12 * 60_000),
            status: 'OK',
            lastError: null,
          },
        ]
      : [],
    createdAt: ts(nowMs - 5 * 86_400_000),
  };
}

export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.slice(-8);
    return `${u.host}/…${tail}`;
  } catch {
    return '…';
  }
}

/** Demo bookings relative to the anchor Saturday (gives a 1-night orphan gap). */
export function demoBookings(today: string): MockBooking[] {
  const s = anchorSaturday(today);
  return [
    { checkIn: addDays(today, -3), checkOut: addDays(today, -1) },
    { checkIn: addDays(s, -2), checkOut: s },
    { checkIn: addDays(s, 3), checkOut: addDays(s, 5) },
    { checkIn: addDays(s, 6), checkOut: addDays(s, 7) },
    { checkIn: addDays(s, 16), checkOut: addDays(s, 20) },
    { checkIn: addDays(s, 34), checkOut: addDays(s, 38) },
    { checkIn: addDays(s, 46), checkOut: addDays(s, 50) },
    { checkIn: addDays(s, 75), checkOut: addDays(s, 82) },
  ];
}

export function genericBookings(today: string, seed: number): MockBooking[] {
  const s = anchorSaturday(today);
  const o = seed % 3;
  return [
    { checkIn: addDays(s, 1 + o), checkOut: addDays(s, 3 + o) },
    { checkIn: addDays(s, 12 + o), checkOut: addDays(s, 15 + o) },
    { checkIn: addDays(s, 40 + o), checkOut: addDays(s, 44 + o) },
  ];
}

function factor(key: FactorDto['key'], multiplier: number, label: string): FactorDto {
  return { key, multiplier: Math.round(multiplier * 100) / 100, label };
}

export function demoActions(today: string, nowMs: number, property: PropertyDto): ActionDto[] {
  const s = anchorSaturday(today);
  const base = {
    propertyId: property.id,
    propertyName: property.name,
    status: 'PENDING' as const,
    withinLimits: true,
    listingUrl: property.listingUrl,
    decidedAt: null,
    appliedAt: null,
    createdAt: ts(nowMs - 2 * 3_600_000),
  };
  return [
    {
      ...base,
      id: 'act_1',
      date: s,
      type: 'PRICE',
      fromValue: property.basePrice,
      toValue: scaled(property.basePrice, 5),
      estimatedGain: 10000,
      headline: 'Sábado tá disputado.',
      explanation: 'Um evento a 2 km pode aumentar a procura pelo seu studio.',
      factors: [factor('event', 1.3, 'Evento próximo'), factor('weekday', 1.2, 'Fim de semana')],
    },
    {
      ...base,
      id: 'act_2',
      date: addDays(s, 5),
      type: 'ORPHAN',
      fromValue: property.basePrice,
      toValue: scaled(property.basePrice, 0),
      estimatedGain: 10000,
      headline: 'Noite solta entre reservas.',
      explanation: 'Essa quinta ficou sozinha entre duas reservas. Um preço menor ajuda a não ficar vazia.',
      factors: [factor('orphan', 0.8, 'Noite órfã'), factor('minStay', 1, 'Estadia mínima de 1 noite')],
    },
    {
      ...base,
      id: 'act_3',
      date: addDays(s, 7),
      type: 'PRICE',
      fromValue: property.basePrice,
      toValue: scaled(property.basePrice, 4),
      estimatedGain: 8000,
      headline: 'Fim de semana subindo.',
      explanation: 'O sábado logo depois de uma reserva costuma ter boa procura nessa época.',
      factors: [factor('weekday', 1.2, 'Fim de semana'), factor('seasonality', 1.1, 'Temporada subindo')],
    },
  ];
}

export function genericActions(today: string, nowMs: number, property: PropertyDto, seq: number): ActionDto[] {
  const s = anchorSaturday(today);
  return [
    {
      id: `act_${seq}`,
      propertyId: property.id,
      propertyName: property.name,
      date: addDays(s, 7),
      type: 'PRICE',
      fromValue: property.basePrice,
      toValue: scaled(property.basePrice, 4),
      estimatedGain: Math.round((scaled(property.basePrice, 4) - property.basePrice) * 0.8),
      status: 'PENDING',
      headline: 'Fim de semana com boa procura.',
      explanation: 'Sábados nessa época costumam lotar primeiro. Dá para cobrar um pouco mais.',
      factors: [factor('weekday', 1.2, 'Fim de semana'), factor('seasonality', 1.1, 'Temporada subindo')],
      withinLimits: true,
      listingUrl: property.listingUrl,
      decidedAt: null,
      appliedAt: null,
      createdAt: ts(nowMs),
    },
  ];
}

export function createSeedDb(today: string, nowMs: number): MockDb {
  const property = makeProperty(
    DEMO_PROPERTY_ID,
    nowMs,
    {
      name: 'Studio do Campeche',
      address: 'Rua das Gaivotas, 120 — Campeche',
      lat: CAMPECHE.lat,
      lng: CAMPECHE.lng,
      city: 'Florianópolis',
      state: 'SC',
      ibgeCode: '4205407',
      destinationType: 'BEACH',
      capacity: 2,
      bedrooms: 1,
      basePrice: 24900,
      minPrice: 18000,
      maxPrice: 45000,
      cleaningFee: 9000,
      monthlyFixedCosts: 35000,
      platformFeePct: 0.03,
      aggressiveness: 'BALANCED',
      rulesConfig: { enabled: {} },
      timezone: 'America/Sao_Paulo',
      listingUrl: 'https://www.airbnb.com.br/rooms/0000000',
      photoUrl: '/brand/imovel-studio-campeche.webp',
    },
    'https://www.airbnb.com.br/calendar/ical/0000000.ics?s=demo',
  );
  return {
    version: MOCK_DB_VERSION,
    today,
    seq: 100,
    user: demoUser(nowMs),
    accessTokens: {},
    refreshTokens: [],
    properties: [property],
    bookings: { [property.id]: demoBookings(today) },
    approvedPrices: { [property.id]: {} },
    actions: demoActions(today, nowMs, property),
    events: seedEvents(today),
    holidays: seedHolidays(),
    vacations: seedVacations(),
    checkouts: [],
  };
}

// ---------- nights ----------

function bookedNights(bookings: MockBooking[]): Set<string> {
  const set = new Set<string>();
  for (const b of bookings) for (let d = b.checkIn; d < b.checkOut; d = addDays(d, 1)) set.add(d);
  return set;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

function nearbyEvents(db: MockDb, p: PropertyDto, date: string): NearbyEventDto[] {
  return db.events
    .filter((e) => e.startDate <= date && e.endDate >= date)
    .map((e) => ({ e, km: distanceKm(p, e) }))
    .filter(({ e, km }) => km <= Math.max(e.radiusKm, 5) || e.city === p.city)
    .map(({ e, km }) => ({ id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, size: e.size, distanceKm: km }));
}

function holidaysOn(db: MockDb, p: PropertyDto, date: string): HolidayDto[] {
  return db.holidays.filter(
    (h) =>
      h.date === date &&
      (h.scope === 'NATIONAL' || (h.scope === 'STATE' && h.state === p.state) || (h.scope === 'MUNICIPAL' && h.ibgeCode === p.ibgeCode)),
  );
}

function isOrphanNight(booked: Set<string>, date: string): boolean {
  if (booked.has(date)) return false;
  const prevBooked = booked.has(addDays(date, -1));
  const nextBooked = booked.has(addDays(date, 1));
  const next2Booked = booked.has(addDays(date, 2));
  const prev2Booked = booked.has(addDays(date, -2));
  return (prevBooked && nextBooked) || (prevBooked && !nextBooked && next2Booked) || (prev2Booked && !prevBooked && nextBooked);
}

export function computeNight(db: MockDb, p: PropertyDto, date: string): NightDto {
  const booked = bookedNights(db.bookings[p.id] ?? []);
  const action = db.actions.find((a) => a.propertyId === p.id && a.date === date && a.status === 'PENDING');
  const wd = weekdayOf(date);
  const month = parseIso(date).getUTCMonth();
  const day = parseIso(date).getUTCDate();
  const events = nearbyEvents(db, p, date);
  const hols = holidaysOn(db, p, date).concat(holidaysOn(db, p, addDays(date, 1)));
  const factors: FactorDto[] = [factor('weekday', WEEKDAY_MULT[wd] ?? 1, wd === 0 || wd >= 5 ? 'Fim de semana' : 'Meio de semana')];
  let score: number = WEEKDAY_SCORE[wd] ?? 0;
  const seasonMult = SEASON_MULT[month] ?? 1;
  if ((month === 11 && day >= 15) || month === 0 || month === 1) {
    score += month === 11 && day < 20 ? 1 : 2;
    factors.push(factor('seasonality', seasonMult, 'Alta temporada de verão'));
  } else if (seasonMult < 0.9) {
    factors.push(factor('seasonality', seasonMult, 'Baixa temporada'));
  }
  if (hols.length > 0) {
    const kind = hols[0]?.kind;
    score += kind === 'REGULAR' ? 2 : 3;
    factors.push(
      factor(kind === 'NEW_YEAR' ? 'newYear' : kind === 'CARNIVAL' ? 'carnival' : 'holiday', kind === 'REGULAR' ? 1.25 : 1.8, hols[0]?.name ?? 'Feriado'),
    );
  }
  if (events.length > 0) {
    score += 2;
    const e = events[0];
    factors.push(factor('event', e?.size === 'XG' ? 2.5 : e?.size === 'G' ? 1.8 : 1.3, `${e?.name ?? 'Evento'} a ${String(e?.distanceKm ?? 2).replace('.', ',')} km`));
  }
  const lead = diffDays(db.today, date);
  if (lead >= 0 && lead <= 6 && !booked.has(date)) factors.push(factor('leadTime', lead <= 2 ? 0.8 : 0.88, 'Data próxima e livre'));
  else if (lead > 60) factors.push(factor('leadTime', 1.05, 'Bem antecipado'));
  const orphan = isOrphanNight(booked, date);
  if (orphan) {
    score = 0;
    factors.push(factor('orphan', 0.8, 'Noite órfã entre reservas'));
  }
  const idx = Math.max(0, Math.min(5, score));
  let suggested = scaled(p.basePrice, idx);
  let usedFactors = factors;
  let headline: string | null = null;
  let explanation: string | null = null;
  if (action && (action.type === 'PRICE' || action.type === 'ORPHAN' || action.type === 'ADJACENT')) {
    suggested = action.toValue;
    usedFactors = action.factors;
    headline = action.headline;
    explanation = action.explanation;
  }
  suggested = Math.min(p.maxPrice, Math.max(p.minPrice, suggested));
  const heatIdx = LADDER.findIndex((v) => scaled(p.basePrice, LADDER.indexOf(v)) >= suggested);
  const heat = HEAT[heatIdx < 0 ? 5 : heatIdx] ?? 0.5;
  if (!headline) {
    if (orphan) {
      headline = 'Noite órfã entre reservas.';
      explanation = 'Uma noite solta é difícil de vender. Estadia mínima de 1 noite e preço menor ajudam.';
    } else if (events.length > 0) {
      headline = wd === 6 ? 'Sábado tá disputado.' : 'Evento perto aumenta a procura.';
      explanation = `${events[0]?.name ?? 'Um evento'} a ${String(events[0]?.distanceKm ?? 2).replace('.', ',')} km do seu imóvel.`;
    } else if (hols.length > 0) {
      headline = `${hols[0]?.name ?? 'Feriado'} chegando.`;
      explanation = 'Feriados enchem as praias. Vale cobrar mais e pedir estadia mínima maior.';
    } else if (idx >= 3) {
      headline = `${WEEKDAY_NAMES[wd] ?? ''} com boa procura.`;
      explanation = 'Fins de semana na praia costumam lotar primeiro.';
    } else if (idx <= 1) {
      headline = 'Meio de semana mais calmo.';
      explanation = 'Procura menor no meio da semana; um preço mais leve ajuda a fechar reserva.';
    } else {
      headline = 'Procura dentro do normal.';
      explanation = 'Sem eventos ou feriados por perto. Preço perto da sua base.';
    }
  }
  const minStay = orphan ? 1 : hols.length > 0 ? 3 : lead > 30 ? 3 : lead >= 14 ? 2 : 1;
  return {
    date,
    status: booked.has(date) ? 'booked' : 'free',
    suggestedPrice: suggested,
    currentPrice: db.approvedPrices[p.id]?.[date] ?? p.basePrice,
    minStay,
    ...(orphan ? { discountPct: 0.2 } : {}),
    factors: usedFactors,
    heat,
    explanation,
    headline,
    isOrphan: orphan,
  };
}

function weatherFor(date: string, lead: number): WeatherDto | null {
  if (lead < 0 || lead > 7) return null;
  const conditions: WeatherDto['condition'][] = ['partly', 'sun', 'sun', 'cloud', 'rain', 'partly', 'sun', 'partly'];
  const condition = conditions[lead] ?? 'sun';
  const n = parseIso(date).getUTCDate();
  return {
    date,
    precipProb: condition === 'rain' ? 0.75 : condition === 'cloud' ? 0.35 : 0.1,
    precipMm: condition === 'rain' ? 8 : null,
    tempMin: 18 + (n % 3),
    tempMax: 23 + (n % 5),
    condition,
  };
}

export function computeNightDetail(db: MockDb, p: PropertyDto, date: string): NightDetailDto {
  const night = computeNight(db, p, date);
  const action = db.actions.find((a) => a.propertyId === p.id && a.date === date && a.status === 'PENDING');
  return {
    ...night,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    weather: weatherFor(date, diffDays(db.today, date)),
    events: nearbyEvents(db, p, date),
    holidays: holidaysOn(db, p, date).map((h) => ({ date: h.date, name: h.name })),
    pendingActionId: action?.id ?? null,
  };
}

// ---------- insights ----------

function metrics(month: string, p: PropertyDto, k: number): MonthMetrics {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
  const occupancy = Math.min(0.92, 0.42 + k * 0.05 + ((m ?? 1) % 2) * 0.03);
  const nightsBooked = Math.round(daysInMonth * occupancy);
  const adr = psychRound(p.basePrice * (0.92 + k * 0.025));
  const revenue = nightsBooked * adr;
  const stays = Math.max(1, Math.round(nightsBooked / 3));
  const estimatedProfit = Math.round(revenue - stays * p.cleaningFee - revenue * p.platformFeePct - (p.monthlyFixedCosts ?? 0));
  return { month, nightsAvailable: daysInMonth, nightsBooked, occupancy: nightsBooked / daysInMonth, adr, revenue, estimatedProfit };
}

export function computeInsights(db: MockDb, p: PropertyDto, month: string): InsightsDto {
  const current = db.today.slice(0, 7);
  const target = month > current ? current : month;
  const history: MonthMetrics[] = [];
  for (let i = 5; i >= 0; i--) {
    const mm = addMonths(target, -i);
    history.push(metrics(mm, p, 5 - i));
  }
  const cur = history[history.length - 1] ?? metrics(target, p, 5);
  const prev = history[history.length - 2] ?? null;
  const baselineMonth = metrics(addMonths(db.user.createdAt.slice(0, 7), -2), p, 0);
  return {
    propertyId: p.id,
    current: cur,
    previous: prev,
    baseline: { ...baselineMonth, occupancy: 0.48, nightsBooked: Math.round(baselineMonth.nightsAvailable * 0.48) },
    ifApprovedAllGain: 64000,
    approvalRate: 0.72,
    history,
  };
}

// ---------- places ----------

interface Place extends PlaceDetailsDto {
  description: string;
}

const GAZETTEER: Place[] = [
  place('pl_gaivotas', 'Rua das Gaivotas, 120 - Campeche, Florianópolis - SC', -27.6789, -48.4867, 'Florianópolis', 'SC', '4205407', 'BEACH'),
  place('pl_pequeno_principe', 'Av. Pequeno Príncipe, 2000 - Campeche, Florianópolis - SC', -27.6712, -48.4804, 'Florianópolis', 'SC', '4205407', 'BEACH'),
  place('pl_lagoa', 'Rua Osni Ortiga, 900 - Lagoa da Conceição, Florianópolis - SC', -27.6011, -48.4744, 'Florianópolis', 'SC', '4205407', 'BEACH'),
  place('pl_copacabana', 'Av. Atlântica, 1702 - Copacabana, Rio de Janeiro - RJ', -22.9671, -43.1787, 'Rio de Janeiro', 'RJ', '3304557', 'BEACH'),
  place('pl_gramado', 'Rua Coberta, 45 - Centro, Gramado - RS', -29.3787, -50.8735, 'Gramado', 'RS', '4309100', 'MOUNTAIN'),
  place('pl_campos', 'Av. Macedo Soares, 300 - Capivari, Campos do Jordão - SP', -22.7217, -45.5685, 'Campos do Jordão', 'SP', '3509700', 'MOUNTAIN'),
  place('pl_paulista', 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP', -23.5649, -46.6519, 'São Paulo', 'SP', '3550308', 'URBAN'),
  place('pl_ouro_preto', 'Rua Direita, 10 - Centro, Ouro Preto - MG', -20.3856, -43.5035, 'Ouro Preto', 'MG', '3146107', 'CULTURAL'),
  place('pl_pirenopolis', 'Rua do Rosário, 22 - Centro, Pirenópolis - GO', -15.8524, -48.9592, 'Pirenópolis', 'GO', '5217302', 'RURAL'),
];

function place(
  placeId: string,
  description: string,
  lat: number,
  lng: number,
  city: string,
  state: BrazilState,
  ibgeCode: string,
  suggestedDestinationType: DestinationType,
): Place {
  return { placeId, description, address: description.split(' - ').slice(0, 2).join(' — '), lat, lng, city, state, ibgeCode, suggestedDestinationType };
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function autocomplete(q: string): { placeId: string; description: string }[] {
  const query = norm(q.trim());
  if (query.length < 3) return [];
  const tokens = query.split(/[\s,]+/).filter(Boolean);
  const hits = GAZETTEER.filter((p) => tokens.every((t) => norm(p.description).includes(t)));
  const list = hits.length > 0 ? hits : GAZETTEER.filter((p) => tokens.some((t) => t.length > 3 && norm(p.description).includes(t)));
  const out = list.slice(0, 5).map((p) => ({ placeId: p.placeId, description: p.description }));
  if (out.length === 0) out.push({ placeId: `free:${encodeURIComponent(q.trim())}`, description: `${q.trim()} - Florianópolis - SC` });
  return out;
}

export function placeDetails(placeId: string): PlaceDetailsDto | null {
  const p = GAZETTEER.find((g) => g.placeId === placeId);
  if (p) {
    const { description: _d, ...details } = p;
    return details;
  }
  if (placeId.startsWith('free:')) {
    const text = decodeURIComponent(placeId.slice(5));
    return {
      placeId,
      address: text,
      lat: -27.6,
      lng: -48.52,
      city: 'Florianópolis',
      state: 'SC',
      ibgeCode: '4205407',
      suggestedDestinationType: 'BEACH',
    };
  }
  return null;
}

// ---------- admin ----------

export function adminHealth(db: MockDb, nowMs: number): AdminHealthDto {
  const jobs = ['ical.sync', 'weather.refresh', 'pricing.recompute', 'explanations.generate', 'events.ingest', 'notifications.daily', 'insights.monthly'];
  return {
    jobs: jobs.map((name, i) => ({
      name,
      waiting: (i * 3) % 5,
      active: i === 0 ? 2 : 0,
      failed: name === 'events.ingest' ? 3 : 0,
      completed: 120 + i * 37,
      lastFinishedAt: new Date(nowMs - (i + 1) * 7 * 60_000).toISOString(),
    })),
    integrations: [
      { name: 'Calendário iCal', provider: 'node-ical', ok: true, detail: null },
      { name: 'Clima', provider: 'Open-Meteo', ok: true, detail: null },
      { name: 'Feriados', provider: 'BrasilAPI', ok: true, detail: null },
      { name: 'Endereços', provider: 'Google Places (fake)', ok: true, detail: 'Adapter fake em desenvolvimento' },
      { name: 'Explicações', provider: 'Anthropic', ok: true, detail: null },
      { name: 'Eventos', provider: 'Curadoria + fontes abertas', ok: false, detail: '3 falhas na última coleta' },
      { name: 'Pagamentos', provider: 'BillingProvider (fake)', ok: true, detail: null },
    ],
    brokenCalendars: db.properties.filter((p) => p.calendarSources.some((c) => c.status === 'ERROR')).length + 2,
  };
}
