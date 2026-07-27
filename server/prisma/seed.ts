import 'dotenv/config';
import { PrismaClient, Cabin, SeatStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { AIRPORTS, ROUTES, distanceNm, blockMinutes } from './data/airports.js';
import { AIRCRAFT, totalSeatsFor } from './data/aircraft.js';
import { columnsOf, seatPriceCents } from '../src/types/seatmap.js';
import type { SeatMapDefinition } from '../src/types/seatmap.js';
import { fetchStates } from '../src/services/opensky.js';

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

const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const DAYS_AHEAD = 14;
/** Departure slots, local-ish hours. Spread so the results list has variety. */
const DEPARTURE_HOURS = [6, 7, 9, 11, 13, 15, 17, 19, 21, 22];

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
// Seat generation
// ─────────────────────────────────────────────────────────────────────────────

interface SeatRow {
  flightId: string;
  seatNumber: string;
  cabin: Cabin;
  status: SeatStatus;
  priceCents: number;
}

/**
 * Expand a seat-map definition into one row per physical seat, then pre-book a
 * realistic share of them. Occupancy is weighted by cabin — economy fills
 * first, business rarely sells out — and window/aisle seats go before middles,
 * which is what makes the rendered map look like a real load rather than noise.
 */
function generateSeats(
  flightId: string,
  def: SeatMapDefinition,
  basePriceCents: number,
  loadFactor: number,
): SeatRow[] {
  const seats: SeatRow[] = [];
  const missing = new Set(def.missingRows ?? []);

  for (const section of def.cabins) {
    const cols = columnsOf(section.layout);
    const aisleAdjacent = new Set<string>();
    const windows = new Set<string>([cols[0], cols[cols.length - 1]]);

    // Columns either side of each "|" are aisle seats.
    let letterIdx = 0;
    for (let i = 0; i < section.layout.length; i++) {
      const ch = section.layout[i];
      if (ch === '|') {
        if (letterIdx - 1 >= 0) aisleAdjacent.add(cols[letterIdx - 1]);
        if (letterIdx < cols.length) aisleAdjacent.add(cols[letterIdx]);
      } else {
        letterIdx++;
      }
    }

    // Business sells lightest, economy heaviest.
    const cabinLoad =
      section.cabin === 'BUSINESS'
        ? loadFactor * 0.55
        : section.cabin === 'PREMIUM'
          ? loadFactor * 0.75
          : loadFactor;

    for (let row = section.rowStart; row <= section.rowEnd; row++) {
      if (missing.has(row)) continue;

      for (const col of cols) {
        const desirability = windows.has(col) ? 1.25 : aisleAdjacent.has(col) ? 1.15 : 0.75;
        const takenChance = Math.min(0.97, cabinLoad * desirability);

        seats.push({
          flightId,
          seatNumber: `${row}${col}`,
          cabin: section.cabin as Cabin,
          status: rand() < takenChance ? SeatStatus.BOOKED : SeatStatus.AVAILABLE,
          priceCents: seatPriceCents(basePriceCents, section, row, def.exitRows),
        });
      }
    }
  }

  return seats;
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

  for (const route of ROUTES) {
    const origin = byIata.get(route.from);
    const dest = byIata.get(route.to);
    if (!origin || !dest) continue;

    const nm = distanceNm(origin, dest);
    const block = blockMinutes(nm);

    // Only assign an airframe that can actually fly the sector.
    const capable = AIRCRAFT.filter((a) => a.rangeNm >= nm * 1.15);
    if (capable.length === 0) continue;

    for (let day = 0; day < DAYS_AHEAD; day++) {
      const hours = [...DEPARTURE_HOURS].sort(() => rand() - 0.5).slice(0, route.frequency);

      for (const hour of hours) {
        const departAt = new Date(today);
        departAt.setDate(departAt.getDate() + day);
        departAt.setHours(hour, pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]), 0, 0);

        // Skip anything already in the past — a search result you cannot book
        // is worse than no result.
        if (departAt.getTime() < now.getTime() + 45 * 60_000) continue;

        const arriveAt = new Date(departAt.getTime() + block * 60_000);
        const frame = pick(capable);
        const aircraftRecord = aircraftByModel.get(frame.model);
        if (!aircraftRecord) continue;

        // Fares drift with how soon you fly and which departure slot you pick.
        const leadTimeMultiplier = day <= 2 ? 1.35 : day <= 5 ? 1.15 : day >= 11 ? 0.92 : 1.0;
        const slotMultiplier = hour <= 7 || hour >= 21 ? 0.9 : hour >= 17 ? 1.08 : 1.0;
        const jitter = 0.94 + rand() * 0.12;
        const basePriceCents = Math.round(
          route.baseFareCents * leadTimeMultiplier * slotMultiplier * jitter,
        );

        // One flight in twelve runs late, so the DELAYED pill has something to show.
        const delayMinutes = rand() < 0.08 ? randInt(15, 95) : 0;

        const flight = await prisma.flight.create({
          data: {
            flightNumber: `SR${flightSeq++}`,
            originId: origin.id,
            destId: dest.id,
            aircraftId: aircraftRecord.id,
            departAt,
            arriveAt,
            basePriceCents,
            delayMinutes,
          },
        });

        if (day === 0) todayFlightIds.push(flight.id);

        // Fuller loads on near-term and peak departures.
        const loadFactor = Math.min(0.9, 0.3 + (day <= 3 ? 0.3 : 0.12) + rand() * 0.28);
        const seats = generateSeats(flight.id, frame.seatMap, basePriceCents, loadFactor);
        await prisma.seat.createMany({ data: seats });

        flightCount++;
        seatCount += seats.length;
      }
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
