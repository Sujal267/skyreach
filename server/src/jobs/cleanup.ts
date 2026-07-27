import cron from 'node-cron';
import { BookingStatus, SeatStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { purgeStaleTokens } from '../lib/tokens.js';

/**
 * Housekeeping, not correctness.
 *
 * Every read path already treats a lapsed hold as available and an expired
 * PENDING booking as dead, so the system is correct without this job ever
 * running. What it does is stop the tables filling with rows nobody will look
 * at again, and keep `status` columns honest for anyone inspecting the DB
 * directly. At portfolio scale an in-process cron beats a separate scheduled
 * machine; at real scale this would move out to its own worker.
 */

/** Seats whose 10-minute hold lapsed and were never bought. */
export async function releaseExpiredHolds(): Promise<number> {
  const { count } = await prisma.seat.updateMany({
    where: { status: SeatStatus.HELD, heldUntil: { lt: new Date() } },
    data: { status: SeatStatus.AVAILABLE, heldUntil: null, heldBy: null },
  });
  return count;
}

/**
 * PENDING bookings past their expiry — an abandoned checkout, or a payment
 * that never completed. Cancelling them releases the seat as a side effect of
 * the hold expiry above.
 */
export async function expireStaleBookings(): Promise<number> {
  const stale = await prisma.booking.findMany({
    where: { status: BookingStatus.PENDING, expiresAt: { lt: new Date() } },
    select: { id: true, seatId: true },
  });

  if (stale.length === 0) return 0;

  await prisma.$transaction([
    prisma.booking.updateMany({
      where: { id: { in: stale.map((b) => b.id) } },
      data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), expiresAt: null },
    }),
    // Only release seats still merely HELD — never claw back one that was
    // confirmed in the gap between the read above and this write.
    prisma.seat.updateMany({
      where: { id: { in: stale.map((b) => b.seatId) }, status: SeatStatus.HELD },
      data: { status: SeatStatus.AVAILABLE, heldUntil: null, heldBy: null },
    }),
  ]);

  return stale.length;
}

export async function runCleanup(): Promise<void> {
  try {
    const [holds, bookings, tokens] = await Promise.all([
      releaseExpiredHolds(),
      expireStaleBookings(),
      purgeStaleTokens(),
    ]);

    if (holds || bookings || tokens) {
      console.log(
        `[cleanup] released ${holds} seat hold(s), expired ${bookings} booking(s), purged ${tokens} token(s)`,
      );
    }
  } catch (err) {
    // A failed sweep is not fatal — the next one will catch up.
    console.error('[cleanup] sweep failed:', err);
  }
}

export function startCleanupJob(): void {
  // Every minute. Holds are 10 minutes, so a 60s resolution is plenty.
  cron.schedule('* * * * *', () => void runCleanup());
  console.log('[cleanup] scheduled every minute');
  void runCleanup();
}
