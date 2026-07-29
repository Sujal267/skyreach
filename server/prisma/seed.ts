import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { AIRPORTS } from '../src/data/airports.js';
import { AIRCRAFT, totalSeatsFor } from '../src/data/aircraft.js';
import { fetchStates } from '../src/services/opensky.js';
import {
  DAYS_AHEAD,
  generateDayFlights,
  generateSeatsForFlight,
} from '../src/lib/flightGeneration.js';

const prisma = new PrismaClient();

/** Deterministic PRNG — reseeding produces the same demo, which matters when
 *  you are screenshotting a portfolio piece and want yesterday's shot to match. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260723);

// ─────────────────────────────────────────────────────────────────────────────
// Live ICAO24 lookup — the bit that makes "watch it move" genuinely real
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull a handful of aircraft that are airborne *right now* and cruising, so the
 * confirmation page's hero moment shows a real aeroplane actually moving rather
 * than a static pin. If OpenSky is unreachable we seed without tracking hexes —
 * the app then correctly shows the "live tracking activates on departure" state,
 * which is the honest fallback, not a broken one.
 */
async function findLiveAircraft(count: number): Promise<string[]> {
  try {
    console.log('  ↳ querying OpenSky for currently-airborne aircraft…');
    const states = await fetchStates();

    const cruising = states.filter(
      (s) =>
        !s.onGround &&
        s.altitude !== null &&
        s.altitude > 8000 && // above ~26,000ft: settled in cruise, not about to land
        s.velocity !== null &&
        s.velocity > 150 &&
        s.callsign !== null,
    );

    if (cruising.length === 0) {
      console.warn('  ↳ no cruising aircraft returned; seeding without live tracking.');
      return [];
    }

    // Spread the picks across the list rather than taking the first N, which
    // would cluster them geographically.
    const step = Math.max(1, Math.floor(cruising.length / count));
    const picked: string[] = [];
    for (let i = 0; i < cruising.length && picked.length < count; i += step) {
      picked.push(cruising[i].icao24);
    }

    console.log(
      `  ↳ found ${cruising.length} cruising aircraft, tracking ${picked.length}: ${picked.join(', ')}`,
    );
    return picked;
  } catch (err) {
    console.warn(
      '  ↳ OpenSky unavailable at seed time; seeding without live tracking hexes.',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🛫 Seeding SkyReach…\n');

  console.log('· Clearing existing data');
  // Order matters: children before parents.
  await prisma.booking.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.aircraft.deleteMany();
  await prisma.airport.deleteMany();

  console.log('· Airports');
  await prisma.airport.createMany({ data: AIRPORTS });
  const airports = await prisma.airport.findMany();
  const byIata = new Map(airports.map((a) => [a.iata, a]));
  console.log(`  ↳ ${airports.length} airports`);

  console.log('· Aircraft');
  for (const seed of AIRCRAFT) {
    await prisma.aircraft.create({
      data: {
        model: seed.model,
        seatMap: seed.seatMap as unknown as object,
        totalSeats: totalSeatsFor(seed),
      },
    });
  }
  const aircraft = await prisma.aircraft.findMany();
  const aircraftByModel = new Map(aircraft.map((a) => [a.model, a]));
  console.log(
    `  ↳ ${aircraft.length} airframes: ${aircraft.map((a) => `${a.model} (${a.totalSeats} seats)`).join(', ')}`,
  );

  console.log('· Live aircraft lookup (OpenSky)');
  const liveHexes = await findLiveAircraft(3);

  console.log('· Flights + seats');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let flightSeq = 100;
  let flightCount = 0;
  let seatCount = 0;

  /** Flights departing later today get the real tracking hexes attached. */
  const todayFlightIds: string[] = [];

  for (let day = 0; day < DAYS_AHEAD; day++) {
    const { flights, nextSeq } = generateDayFlights({
      day,
      today,
      now,
      byIata,
      aircraftByModel,
      flightSeqStart: flightSeq,
      rand,
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

      if (day === 0) todayFlightIds.push(flight.id);

      const seats = generateSeatsForFlight(flight.id, f.seatMap, f.basePriceCents, f.loadFactor, rand);
      await prisma.seat.createMany({ data: seats });

      flightCount++;
      seatCount += seats.length;
    }
  }

  console.log(`  ↳ ${flightCount} flights, ${seatCount.toLocaleString()} seats`);

  // Attach the real, currently-airborne hexes to flights departing today, so
  // the confirmation page has something genuinely live to point at.
  if (liveHexes.length > 0 && todayFlightIds.length > 0) {
    console.log('· Attaching live tracking hexes');
    const targets = todayFlightIds.slice(0, liveHexes.length);
    for (let i = 0; i < targets.length; i++) {
      await prisma.flight.update({
        where: { id: targets[i] },
        data: { trackingIcao24: liveHexes[i] },
      });
    }
    console.log(`  ↳ ${targets.length} flights are now trackable against real ADS-B data`);
  }

  console.log('· Demo user');
  const demo = await prisma.user.create({
    data: {
      email: 'demo@skyreach.app',
      passwordHash: await bcrypt.hash('skyreach123', 12),
      firstName: 'Ada',
      lastName: 'Sharma',
    },
  });
  console.log(`  ↳ ${demo.email} / skyreach123`);

  console.log('\n✅ Seed complete.\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:\n', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
