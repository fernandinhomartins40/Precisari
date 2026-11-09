/**
 * Demo data: Carla and her "Studio do Campeche" (Florianópolis/SC) with bookings, holidays, an event,
 * SC school vacations and a weather forecast, then a pricing recompute so the app shows nights and actions.
 * Idempotent: re-running resets Carla's data.  Run: pnpm --filter api db:seed
 */
import 'reflect-metadata';
import { loadDotenv } from '../src/config/load-dotenv';

loadDotenv();

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const { PricingService } = await import('../src/pricing/pricing.service');
  const { addDays, isoToDate, todayInTz } = await import('../src/common/dates');
  const { weatherGrid } = await import('../src/common/geo');

  process.env.JOBS_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const today = todayInTz('America/Sao_Paulo');
  const d = (offset: number): Date => isoToDate(addDays(today, offset));
  const year = Number(today.slice(0, 4));

  const email = 'carla@precisari.dev';
  await prisma.user.deleteMany({ where: { email } });
  const carla = await prisma.user.create({
    data: {
      email,
      name: 'Carla',
      subscription: { create: { plan: 'PRO', status: 'TRIALING', trialEndsAt: d(14) } },
      consents: { create: [{ kind: 'terms', version: '2026-11' }, { kind: 'privacy', version: '2026-11' }] },
    },
  });

  const lat = -27.6789;
  const lng = -48.4867;
  const property = await prisma.property.create({
    data: {
      userId: carla.id,
      name: 'Studio do Campeche',
      address: 'Av. Campeche, 1000 - Campeche, Florianópolis - SC',
      lat,
      lng,
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
      listingUrl: 'https://www.airbnb.com.br/rooms/000000',
      // Signed up ~45 days ago so insights have a baseline window and history.
      createdAt: new Date(Date.now() - 45 * 86_400_000),
    },
  });

  const bookings: [number, number, 'BOOKED' | 'BLOCKED'][] = [
    // History (baseline + previous months)
    [-120, -116, 'BOOKED'], [-104, -101, 'BOOKED'], [-90, -85, 'BOOKED'], [-70, -67, 'BOOKED'], [-60, -58, 'BOOKED'],
    [-40, -36, 'BOOKED'], [-30, -27, 'BOOKED'], [-21, -19, 'BLOCKED'], [-12, -8, 'BOOKED'], [-3, 1, 'BOOKED'],
    // Upcoming — leaves a 1-night orphan gap at +6
    [4, 6, 'BOOKED'], [7, 10, 'BOOKED'], [18, 19, 'BLOCKED'], [26, 30, 'BOOKED'], [45, 52, 'BOOKED'],
  ];
  await prisma.booking.createMany({
    data: bookings.map(([a, b, status], i) => ({ propertyId: property.id, source: 'seed', externalUid: `seed-${i}`, checkIn: d(a), checkOut: d(b), status })),
  });

  const holidays: { date: string; name: string; kind?: 'REGULAR' | 'CARNIVAL' | 'NEW_YEAR'; isBridge?: boolean }[] = [
    { date: `${year}-11-15`, name: 'Proclamação da República' },
    { date: `${year}-11-20`, name: 'Dia da Consciência Negra' },
    { date: `${year}-12-25`, name: 'Natal' },
    { date: `${year + 1}-01-01`, name: 'Confraternização Universal', kind: 'NEW_YEAR' },
    { date: `${year + 1}-02-16`, name: 'Carnaval', kind: 'CARNIVAL', isBridge: true },
    { date: `${year + 1}-02-17`, name: 'Carnaval', kind: 'CARNIVAL' },
  ];
  for (const h of holidays) {
    const data = { date: isoToDate(h.date), scope: 'NATIONAL' as const, name: h.name, kind: h.kind ?? 'REGULAR', isBridge: h.isBridge ?? false };
    const exists = await prisma.holiday.findFirst({ where: { date: data.date, scope: 'NATIONAL', name: h.name } });
    if (!exists) await prisma.holiday.create({ data });
  }

  await prisma.event.deleteMany({ where: { source: 'seed' } });
  await prisma.event.create({
    data: {
      name: 'Festival de Verão do Campeche', city: 'Florianópolis', state: 'SC', lat: -27.6745, lng: -48.4801,
      startDate: d(12), endDate: d(13), size: 'G', radiusKm: 5, source: 'seed', verified: true,
    },
  });

  await prisma.schoolVacation.deleteMany({ where: { state: 'SC', year: year + 1 } });
  await prisma.schoolVacation.create({ data: { state: 'SC', startDate: isoToDate(`${year}-12-19`), endDate: isoToDate(`${year + 1}-02-08`), year: year + 1 } });

  const gLat = weatherGrid(lat);
  const gLng = weatherGrid(lng);
  for (let i = -3; i <= 10; i++) {
    const precipProb = [10, 20, 85, 90, 15, 5, 30, 60, 10, 0, 40, 20, 10, 5][i + 3] ?? 10;
    const data = { precipProb, precipMm: precipProb > 50 ? 18 : 0.5, tempMin: 19, tempMax: 28, fetchedAt: new Date() };
    await prisma.weatherForecast.upsert({
      where: { lat_lng_date: { lat: gLat, lng: gLng, date: d(i) } },
      create: { lat: gLat, lng: gLng, date: d(i), ...data },
      update: data,
    });
  }

  const result = await app.get(PricingService).recompute(property.id);
  console.log(`Seeded ${email} / "${property.name}" (${property.id}): ${result?.nights ?? 0} nights, ${result?.actions.created ?? 0} actions.`);
  await app.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
