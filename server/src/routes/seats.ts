import { Router } from 'express';
import { SeatStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';

export const seatsRouter = Router();

/**
 * ── The seat-hold concurrency problem ───────────────────────────────────────
 *
 * Two people open the same flight and click seat 14C within the same second.
 * Exactly one must win, and the loser must find out immediately rather than at
 * the payment step.
 *
 * The naive version — read the seat, check it is free, then write — is a
 * textbook race: both reads happen before either write, both see AVAILABLE,
 * both write, and the seat is sold twice.
 *
 * The fix is to never read-then-write. `updateMany` with the availability
 * condition *inside the WHERE clause* compiles to a single
 *
 *     UPDATE "Seat" SET status='HELD', ... WHERE id = $1 AND (<is free>)
 *
 * which the database executes atomically under a row lock. It returns the
 * number of rows it actually changed: 1 for the winner, 0 for everyone else.
 * That count is the answer — no transaction, no advisory lock, no retry loop.
 *
 * Holds are soft: `heldUntil` lapses on its own after SEAT_HOLD_MINUTES, so an
 * abandoned checkout returns the seat to inventory without anyone intervening.
 * Every read path treats a lapsed hold as available, which means the cleanup
 * job is housekeeping rather than something correctness depends on.
 */

// ── POST /api/seats/:id/hold ─────────────────────────────────────────────────

seatsRouter.post(
  '/:id/hold',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const heldUntil = new Date(now.getTime() + env.SEAT_HOLD_MINUTES * 60_000);

    const seat = await prisma.seat.findUnique({
      where: { id: req.params.id },
      select: { id: true, flightId: true, seatNumber: true, cabin: true, priceCents: true },
    });
    if (!seat) throw ApiError.notFound('Seat not found', 'SEAT_NOT_FOUND');

    // One seat per user per flight — taking a second silently releases the first,
    // which is what "changing your mind" should do.
    await prisma.seat.updateMany({
      where: {
        flightId: seat.flightId,
        heldBy: userId,
        status: SeatStatus.HELD,
        id: { not: seat.id },
      },
      data: { status: SeatStatus.AVAILABLE, heldUntil: null, heldBy: null },
    });

    const { count } = await prisma.seat.updateMany({
      where: {
        id: seat.id,
        OR: [
          { status: SeatStatus.AVAILABLE },
          // A hold that has lapsed is fair game...
          { status: SeatStatus.HELD, heldUntil: { lt: now } },
          // ...and so is one this same user already owns (idempotent re-hold).
          { status: SeatStatus.HELD, heldBy: userId },
        ],
      },
      data: { status: SeatStatus.HELD, heldUntil, heldBy: userId },
    });

    if (count === 0) {
      // Lost the race, or the seat is already sold. Tell the client which,
      // because the UI copy differs.
      const current = await prisma.seat.findUnique({
        where: { id: seat.id },
        select: { status: true },
      });
      throw ApiError.conflict(
        current?.status === SeatStatus.BOOKED
          ? 'That seat has already been booked'
          : 'Someone just took that seat',
        'SEAT_UNAVAILABLE',
      );
    }

    res.json({
      seat: {
        id: seat.id,
        seatNumber: seat.seatNumber,
        cabin: seat.cabin,
        priceCents: seat.priceCents,
        status: SeatStatus.HELD,
        heldByYou: true,
        holdExpiresAt: heldUntil,
      },
      holdMinutes: env.SEAT_HOLD_MINUTES,
    });
  }),
);

// ── DELETE /api/seats/:id/hold ───────────────────────────────────────────────

/** Release early — deselecting, or backing out of checkout. */
seatsRouter.delete(
  '/:id/hold',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    // Scoped to this user's own hold, so releasing someone else's is impossible.
    const { count } = await prisma.seat.updateMany({
      where: { id: req.params.id, status: SeatStatus.HELD, heldBy: userId },
      data: { status: SeatStatus.AVAILABLE, heldUntil: null, heldBy: null },
    });

    if (count === 0) {
      throw ApiError.conflict('You do not hold that seat', 'NOT_YOUR_HOLD');
    }

    res.status(204).end();
  }),
);
