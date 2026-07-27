import { Router } from 'express';
import { Prisma, SeatStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import type { SeatMapDefinition } from '../types/seatmap.js';

export const flightsRouter = Router();

/**
 * A seat counts as sellable if it is AVAILABLE, or HELD by someone whose hold
 * has quietly lapsed. Reading `heldUntil` at query time rather than trusting
 * `status` means an expired hold releases itself the moment anyone looks —
 * the cleanup job is a tidy-up, not a correctness dependency.
 */
function sellableNow(): Prisma.SeatWhereInput {
  return {
    OR: [
      { status: SeatStatus.AVAILABLE },
      { status: SeatStatus.HELD, heldUntil: { lt: new Date() } },
    ],
  };
}

const airportSelect = {
  id: true,
  iata: true,
  icao: true,
  name: true,
  city: true,
  country: true,
  lat: true,
  lon: true,
  timezone: true,
} as const;

// ── GET /api/flights/airports ────────────────────────────────────────────────

/** Powers the origin/destination autocomplete. Small, cacheable, public. */
flightsRouter.get(
  '/airports',
  asyncHandler(async (_req, res) => {
    const airports = await prisma.airport.findMany({
      select: airportSelect,
      orderBy: { city: 'asc' },
    });
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ airports });
  }),
);

// ── GET /api/flights/popular ─────────────────────────────────────────────────

/**
 * "Popular routes" cards on the home page. The seats-available count is a real
 * aggregate over live inventory, not a decorative number — that is the whole
 * point of the card.
 */
flightsRouter.get(
  '/popular',
  asyncHandler(async (_req, res) => {
    const from = new Date();
    const to = new Date(from.getTime() + 24 * 3600_000);

    const flights = await prisma.flight.findMany({
      where: { departAt: { gte: from, lte: to } },
      include: {
        origin: { select: airportSelect },
        destination: { select: airportSelect },
      },
      orderBy: { departAt: 'asc' },
    });

    // Collapse to one entry per route, keeping the cheapest departure.
    const byRoute = new Map<
      string,
      { flightIds: string[]; sample: (typeof flights)[number]; lowestCents: number }
    >();

    for (const f of flights) {
      const key = `${f.origin.iata}-${f.destination.iata}`;
      const entry = byRoute.get(key);
      if (!entry) {
        byRoute.set(key, { flightIds: [f.id], sample: f, lowestCents: f.basePriceCents });
      } else {
        entry.flightIds.push(f.id);
        if (f.basePriceCents < entry.lowestCents) {
          entry.lowestCents = f.basePriceCents;
          entry.sample = f;
        }
      }
    }

    const top = [...byRoute.entries()].slice(0, 4);

    const routes = await Promise.all(
      top.map(async ([key, entry]) => {
        const seatsAvailable = await prisma.seat.count({
          where: { flightId: { in: entry.flightIds }, ...sellableNow() },
        });
        return {
          key,
          origin: entry.sample.origin,
          destination: entry.sample.destination,
          lowestPriceCents: entry.lowestCents,
          departuresToday: entry.flightIds.length,
          seatsAvailable,
        };
      }),
    );

    res.set('Cache-Control', 'public, max-age=60');
    res.json({ routes });
  }),
);

// ── GET /api/flights/search ──────────────────────────────────────────────────

const searchSchema = z.object({
  from: z.string().length(3, 'Use a 3-letter IATA code').toUpperCase(),
  to: z.string().length(3, 'Use a 3-letter IATA code').toUpperCase(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  passengers: z.coerce.number().int().min(1).max(9).default(1),
  cabin: z.enum(['ECONOMY', 'PREMIUM', 'BUSINESS']).optional(),
});

flightsRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const q = searchSchema.parse(req.query);

    if (q.from === q.to) {
      throw ApiError.badRequest('Origin and destination must differ', 'SAME_AIRPORT');
    }

    const [origin, destination] = await Promise.all([
      prisma.airport.findUnique({ where: { iata: q.from }, select: airportSelect }),
      prisma.airport.findUnique({ where: { iata: q.to }, select: airportSelect }),
    ]);

    if (!origin) throw ApiError.notFound(`No airport with code ${q.from}`, 'ORIGIN_UNKNOWN');
    if (!destination) throw ApiError.notFound(`No airport with code ${q.to}`, 'DEST_UNKNOWN');

    // The search date is a calendar day at the *origin* airport, which is what
    // a traveller means by "flying on the 28th".
    const dayStart = new Date(`${q.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);

    const flights = await prisma.flight.findMany({
      where: {
        originId: origin.id,
        destId: destination.id,
        departAt: { gte: dayStart, lt: dayEnd },
      },
      include: {
        origin: { select: airportSelect },
        destination: { select: airportSelect },
        aircraft: { select: { id: true, model: true, totalSeats: true } },
      },
      orderBy: { departAt: 'asc' },
    });

    // One grouped count for every flight rather than N queries in a loop.
    const grouped = await prisma.seat.groupBy({
      by: ['flightId', 'cabin'],
      where: { flightId: { in: flights.map((f) => f.id) }, ...sellableNow() },
      _count: { _all: true },
      _min: { priceCents: true },
    });

    const statsFor = new Map<
      string,
      { total: number; byCabin: Record<string, { count: number; fromCents: number }> }
    >();

    for (const row of grouped) {
      const entry = statsFor.get(row.flightId) ?? { total: 0, byCabin: {} };
      entry.total += row._count._all;
      entry.byCabin[row.cabin] = {
        count: row._count._all,
        fromCents: row._min.priceCents ?? 0,
      };
      statsFor.set(row.flightId, entry);
    }

    const results = flights
      .map((f) => {
        const stats = statsFor.get(f.id) ?? { total: 0, byCabin: {} };
        const cabinStats = q.cabin ? stats.byCabin[q.cabin] : undefined;
        const seatsLeft = q.cabin ? (cabinStats?.count ?? 0) : stats.total;
        const cheapest = q.cabin
          ? (cabinStats?.fromCents ?? 0)
          : Math.min(
              ...Object.values(stats.byCabin).map((c) => c.fromCents),
              f.basePriceCents,
            );

        return {
          id: f.id,
          flightNumber: f.flightNumber,
          origin: f.origin,
          destination: f.destination,
          aircraft: f.aircraft,
          departAt: f.departAt,
          arriveAt: f.arriveAt,
          durationMinutes: Math.round(
            (f.arriveAt.getTime() - f.departAt.getTime()) / 60_000,
          ),
          basePriceCents: f.basePriceCents,
          fromPriceCents: cheapest,
          delayMinutes: f.delayMinutes,
          isTracked: f.trackingIcao24 !== null,
          seatsLeft,
          cabinAvailability: stats.byCabin,
        };
      })
      // A flight with no seats for this party size is not a result.
      .filter((f) => f.seatsLeft >= q.passengers);

    res.json({
      origin,
      destination,
      date: q.date,
      passengers: q.passengers,
      count: results.length,
      results,
    });
  }),
);

// ── GET /api/flights/:id ─────────────────────────────────────────────────────

/** Full detail including the seat map and every seat's current state. */
flightsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const flight = await prisma.flight.findUnique({
      where: { id: req.params.id },
      include: {
        origin: { select: airportSelect },
        destination: { select: airportSelect },
        aircraft: true,
        seats: {
          orderBy: [{ cabin: 'asc' }, { seatNumber: 'asc' }],
          select: {
            id: true,
            seatNumber: true,
            cabin: true,
            status: true,
            priceCents: true,
            heldUntil: true,
            heldBy: true,
          },
        },
      },
    });

    if (!flight) throw ApiError.notFound('Flight not found', 'FLIGHT_NOT_FOUND');

    const now = Date.now();
    const viewerId = req.user?.id ?? null;

    const seats = flight.seats.map((s) => {
      const holdActive = s.heldUntil !== null && s.heldUntil.getTime() > now;
      // A lapsed hold is reported as available, matching what a purchase
      // attempt would actually find.
      const effectiveStatus =
        s.status === SeatStatus.HELD && !holdActive ? SeatStatus.AVAILABLE : s.status;

      return {
        id: s.id,
        seatNumber: s.seatNumber,
        cabin: s.cabin,
        status: effectiveStatus,
        priceCents: s.priceCents,
        /** True when *this* viewer owns the hold, so their selection survives a reload. */
        heldByYou: holdActive && viewerId !== null && s.heldBy === viewerId,
        holdExpiresAt: holdActive ? s.heldUntil : null,
      };
    });

    res.json({
      flight: {
        id: flight.id,
        flightNumber: flight.flightNumber,
        origin: flight.origin,
        destination: flight.destination,
        departAt: flight.departAt,
        arriveAt: flight.arriveAt,
        durationMinutes: Math.round(
          (flight.arriveAt.getTime() - flight.departAt.getTime()) / 60_000,
        ),
        basePriceCents: flight.basePriceCents,
        delayMinutes: flight.delayMinutes,
        isTracked: flight.trackingIcao24 !== null,
        aircraft: {
          id: flight.aircraft.id,
          model: flight.aircraft.model,
          totalSeats: flight.aircraft.totalSeats,
          seatMap: flight.aircraft.seatMap as unknown as SeatMapDefinition,
        },
      },
      seats,
    });
  }),
);
