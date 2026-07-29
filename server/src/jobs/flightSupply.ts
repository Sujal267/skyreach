import cron from 'node-cron';
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';
import { AIRPORTS } from '../data/airports.js';
import { AIRCRAFT, totalSeatsFor } from '../data/aircraft.js';
import { DAYS_AHEAD, generateDayFlights, generateSeatsForFlight } from '../lib/flightGeneration.js';

/**
 * Keeps a rolling DAYS_AHEAD-day flight schedule topped up, forever, with no
 * manual reseeding.
 *
 * Deliberately additive only — unlike `prisma/seed.ts` (which wipes and
 * rebuilds everything for a clean demo reset) this never deletes a row. It is
 * safe to run against a live database with real users and bookings on it: it
 * only fills in calendar days that have zero flights, and only bootstraps
 * airports/aircraft/the demo user if the database is completely empty.
 */
export async function ensureFlightSupply(): Promise<void> {
  const airportCount = await prisma.airport.count();
  if (airportCount === 0) {
    await prisma.airport.createMany({ data: AIRPORTS });
    console.log(`[flight-supply] seeded ${AIRPORTS.length} airports`);
  }

  const aircraftCount = await prisma.aircraft.count();
  if (aircraftCount === 0) {
    for (const seed of AIRCRAFT) {
      await prisma.aircraft.create({
        data: {
          model: seed.model,
          seatMap: seed.seatMap as unknown as object,
          totalSeats: totalSeatsFor(seed),
        },
      });
    }
    console.log(`[flight-supply] seeded ${AIRCRAFT.length} aircraft`);
  }

  const demoUser = await prisma.user.findUnique({ where: { email: 'demo@skyreach.app' } });
  if (!demoUser) {
    await prisma.user.create({
      data: {
        email: 'demo@skyreach.app',
        passwordHash: await bcrypt.hash('skyreach123', 12),
        firstName: 'Ada',
        lastName: 'Sharma',
      },
    });
    console.log('[flight-supply] created demo user');
  }

  const airports = await prisma.airport.findMany();
  const byIata = new Map(airports.map((a) => [a.iata, a]));
  const aircraft = await prisma.aircraft.findMany();
  const aircraftByModel = new Map(aircraft.map((a) => [a.model, a]));

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Continue the flight-number sequence rather than colliding with existing rows.
  const existingNumbers = (await prisma.flight.findMany({ select: { flightNumber: true } }))
    .map((f) => parseInt(f.flightNumber.replace(/^SR/, ''), 10))
    .filter((n) => Number.isFinite(n));
  let flightSeq = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 100;

  let flightsCreated = 0;
  let seatsCreated = 0;

  for (let day = 0; day < DAYS_AHEAD; day++) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() + day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // A day that already has any flights is treated as already scheduled —
    // never re-generate it, so a partially-booked day is never touched.
    const existing = await prisma.flight.count({
      where: { departAt: { gte: dayStart, lt: dayEnd } },
    });
    if (existing > 0) continue;

    const { flights, nextSeq } = generateDayFlights({
      day,
      today,
      now,
      byIata,
      aircraftByModel,
      flightSeqStart: flightSeq,
      rand: Math.random,
    });
    flightSeq = nextSeq;

    for (const f of flights) {
      const flight = await prisma.flight.create({
        data: {
          flightNumber: f.flightNumber,
          originId: f.originId,
          destId: f.destId,
          aircraftId: f.aircraftId,
          departAt: f.departAt,
          arriveAt: f.arriveAt,
          basePriceCents: f.basePriceCents,
          delayMinutes: f.delayMinutes,
        },
      });

      const seats = generateSeatsForFlight(flight.id, f.seatMap, f.basePriceCents, f.loadFactor, Math.random);
      await prisma.seat.createMany({ data: seats });

      flightsCreated++;
      seatsCreated += seats.length;
    }
  }

  if (flightsCreated > 0) {
    console.log(
      `[flight-supply] topped up ${flightsCreated} flight(s), ${seatsCreated.toLocaleString()} seat(s) — window now covers ${DAYS_AHEAD} days`,
    );
  }
}

export function startFlightSupplyJob(): void {
  // Once a day is plenty — the window only needs a new day added once every
  // 24h for it to never run dry. Run once immediately too, so a fresh deploy
  // (or a database that's never been seeded at all) is ready right away.
  cron.schedule('17 3 * * *', () => void ensureFlightSupply().catch((err) => {
    console.error('[flight-supply] scheduled top-up failed:', err);
  }));
  console.log('[flight-supply] scheduled daily at 03:17');

  void ensureFlightSupply().catch((err) => {
    console.error('[flight-supply] startup top-up failed:', err);
  });
}
