import { Cabin, SeatStatus } from '@prisma/client';

import { ROUTES, distanceNm, blockMinutes } from '../data/airports.js';
import { AIRCRAFT } from '../data/aircraft.js';
import { columnsOf, seatPriceCents } from '../types/seatmap.js';
import type { SeatMapDefinition } from '../types/seatmap.js';

/**
 * Flight-schedule generation, shared by the destructive one-shot seed script
 * and the additive top-up job. Kept here — not in either caller — so the two
 * can never drift into generating different-shaped schedules.
 */

export const DAYS_AHEAD = 14;
/** Departure slots, local-ish hours. Spread so the results list has variety. */
export const DEPARTURE_HOURS = [6, 7, 9, 11, 13, 15, 17, 19, 21, 22];

const randInt = (rand: () => number, min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(rand: () => number, arr: T[]): T => arr[Math.floor(rand() * arr.length)];

export interface AirportLite {
  id: string;
  iata: string;
}

export interface AircraftLite {
  id: string;
  model: string;
}

export interface GeneratedFlight {
  flightNumber: string;
  originId: string;
  destId: string;
  aircraftId: string;
  departAt: Date;
  arriveAt: Date;
  basePriceCents: number;
  delayMinutes: number;
  seatMap: SeatMapDefinition;
  loadFactor: number;
}

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
export function generateSeatsForFlight(
  flightId: string,
  def: SeatMapDefinition,
  basePriceCents: number,
  loadFactor: number,
  rand: () => number,
): SeatRow[] {
  const seats: SeatRow[] = [];
  const missing = new Set(def.missingRows ?? []);

  for (const section of def.cabins) {
    const cols = columnsOf(section.layout);
    const aisleAdjacent = new Set<string>();
    const windows = new Set<string>([cols[0], cols[cols.length - 1]]);

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

/**
 * Generate every flight for a single calendar day, across all routes. Pure —
 * takes lookups and a starting flight-number sequence, returns data only, so
 * callers decide how (and whether) to persist it.
 */
export function generateDayFlights({
  day,
  today,
  now,
  byIata,
  aircraftByModel,
  flightSeqStart,
  rand,
}: {
  day: number;
  today: Date;
  now: Date;
  byIata: Map<string, AirportLite>;
  aircraftByModel: Map<string, AircraftLite>;
  flightSeqStart: number;
  rand: () => number;
}): { flights: GeneratedFlight[]; nextSeq: number } {
  let flightSeq = flightSeqStart;
  const flights: GeneratedFlight[] = [];

  for (const route of ROUTES) {
    const origin = byIata.get(route.from);
    const dest = byIata.get(route.to);
    if (!origin || !dest) continue;

    const nm = distanceNm(origin as unknown as { lat: number; lon: number }, dest as unknown as { lat: number; lon: number });
    const block = blockMinutes(nm);

    const capable = AIRCRAFT.filter((a) => a.rangeNm >= nm * 1.15);
    if (capable.length === 0) continue;

    const hours = [...DEPARTURE_HOURS].sort(() => rand() - 0.5).slice(0, route.frequency);

    for (const hour of hours) {
      const departAt = new Date(today);
      departAt.setDate(departAt.getDate() + day);
      departAt.setHours(hour, pick(rand, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]), 0, 0);

      // Skip anything already in the past — a search result you cannot book
      // is worse than no result.
      if (departAt.getTime() < now.getTime() + 45 * 60_000) continue;

      const arriveAt = new Date(departAt.getTime() + block * 60_000);
      const frame = pick(rand, capable);
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
      const delayMinutes = rand() < 0.08 ? randInt(rand, 15, 95) : 0;

      // Fuller loads on near-term and peak departures.
      const loadFactor = Math.min(0.9, 0.3 + (day <= 3 ? 0.3 : 0.12) + rand() * 0.28);

      flights.push({
        flightNumber: `SR${flightSeq++}`,
        originId: origin.id,
        destId: dest.id,
        aircraftId: aircraftRecord.id,
        departAt,
        arriveAt,
        basePriceCents,
        delayMinutes,
        seatMap: frame.seatMap,
        loadFactor,
      });
    }
  }

  return { flights, nextSeq: flightSeq };
}
