import crypto from 'node:crypto';
import { Router } from 'express';
import { BookingStatus, SeatStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';

export const bookingsRouter = Router();

/** "SKY-8F3K2A" — unambiguous alphabet, no 0/O/1/I to misread aloud. */
function generateBookingRef(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return `SKY-${out}`;
}

const TAX_RATE = 0.12;

/** Tax computed in integer cents. Nothing here ever becomes a float. */
function priceBreakdown(seatPriceCents: number) {
  const taxCents = Math.round(seatPriceCents * TAX_RATE);
  return {
    subtotalCents: seatPriceCents,
    taxCents,
    totalCents: seatPriceCents + taxCents,
  };
}

const bookingSelect = {
  id: true,
  bookingRef: true,
  status: true,
  passengerName: true,
  passengerEmail: true,
  totalCents: true,
  paymentRef: true,
  createdAt: true,
  confirmedAt: true,
  cancelledAt: true,
  expiresAt: true,
  seat: { select: { id: true, seatNumber: true, cabin: true, priceCents: true } },
  flight: {
    select: {
      id: true,
      flightNumber: true,
      departAt: true,
      arriveAt: true,
      delayMinutes: true,
      trackingIcao24: true,
      aircraft: { select: { model: true } },
      origin: {
        select: { iata: true, city: true, name: true, lat: true, lon: true, timezone: true },
      },
      destination: {
        select: { iata: true, city: true, name: true, lat: true, lon: true, timezone: true },
      },
    },
  },
} as const;

type BookingRow = Awaited<ReturnType<typeof loadBooking>>;

async function loadBooking(id: string) {
  return prisma.booking.findUnique({ where: { id }, select: bookingSelect });
}

/**
 * Live status pill, derived rather than stored — a stored status would be
 * wrong the moment the clock moved past it.
 */
function deriveLiveStatus(booking: NonNullable<BookingRow>) {
  if (booking.status === BookingStatus.CANCELLED) return 'CANCELLED' as const;
  if (booking.status === BookingStatus.PENDING) return 'PENDING' as const;

  const now = Date.now();
  const delayMs = booking.flight.delayMinutes * 60_000;
  const depart = booking.flight.departAt.getTime() + delayMs;
  const arrive = booking.flight.arriveAt.getTime() + delayMs;

  if (now >= arrive) return 'LANDED' as const;
  if (now >= depart) return 'IN_AIR' as const;
  if (booking.flight.delayMinutes > 0) return 'DELAYED' as const;
  return 'SCHEDULED' as const;
}

function shapeBooking(booking: NonNullable<BookingRow>) {
  return {
    ...booking,
    liveStatus: deriveLiveStatus(booking),
    /** Tracking is only meaningful once the aircraft is actually up. */
    trackable:
      booking.flight.trackingIcao24 !== null && deriveLiveStatus(booking) === 'IN_AIR',
  };
}

// ── POST /api/bookings ───────────────────────────────────────────────────────

const createSchema = z.object({
  seatId: z.string().min(1, 'Choose a seat'),
  passengerName: z.string().min(2, 'Enter the passenger name').max(120).trim(),
  passengerEmail: z.string().email('Enter a valid email address').toLowerCase().trim(),
});

/**
 * Creates a PENDING booking against a seat this user already holds.
 *
 * In a real build this is also where the Stripe PaymentIntent would be created
 * and its client_secret returned. This demo simulates payment (see the confirm
 * route below), so the response carries a mock intent instead — deliberately
 * the same shape, so swapping in a real PSP touches one function, not the flow.
 */
bookingsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = createSchema.parse(req.body);
    const now = new Date();

    const seat = await prisma.seat.findUnique({
      where: { id: body.seatId },
      select: {
        id: true,
        flightId: true,
        seatNumber: true,
        priceCents: true,
        status: true,
        heldUntil: true,
        heldBy: true,
      },
    });

    if (!seat) throw ApiError.notFound('Seat not found', 'SEAT_NOT_FOUND');

    // You may only buy a seat you are actively holding. This closes the gap
    // between "held during checkout" and "paid for".
    const holdValid =
      seat.status === SeatStatus.HELD &&
      seat.heldBy === userId &&
      seat.heldUntil !== null &&
      seat.heldUntil.getTime() > now.getTime();

    if (!holdValid) {
      throw ApiError.conflict(
        seat.status === SeatStatus.BOOKED
          ? 'That seat has already been booked'
          : 'Your hold on that seat expired — please pick it again',
        'HOLD_EXPIRED',
      );
    }

    const { subtotalCents, taxCents, totalCents } = priceBreakdown(seat.priceCents);

    const booking = await prisma.booking.create({
      data: {
        userId,
        flightId: seat.flightId,
        seatId: seat.id,
        passengerName: body.passengerName,
        passengerEmail: body.passengerEmail,
        status: BookingStatus.PENDING,
        totalCents,
        bookingRef: generateBookingRef(),
        expiresAt: new Date(now.getTime() + env.BOOKING_EXPIRY_MINUTES * 60_000),
      },
      select: bookingSelect,
    });

    res.status(201).json({
      booking: shapeBooking(booking),
      breakdown: { subtotalCents, taxCents, totalCents },
      payment: {
        /** Stand-in for a Stripe client_secret. */
        intentRef: `sim_${crypto.randomBytes(12).toString('hex')}`,
        simulated: true,
        expiresInMinutes: env.BOOKING_EXPIRY_MINUTES,
      },
    });
  }),
);

// ── POST /api/bookings/:id/confirm ───────────────────────────────────────────

const confirmSchema = z.object({
  /** Last 4 digits, used only to echo a believable receipt line. */
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
});

/**
 * Simulated payment capture.
 *
 * A real deployment would never expose this — the transition to CONFIRMED
 * would be driven by a signature-verified `payment_intent.succeeded` webhook,
 * because a client saying "I paid" is not evidence of payment. This project is
 * a demo of the *booking* flow with payment explicitly out of scope, so the
 * transition happens here instead, while keeping the same state machine:
 *
 *     PENDING --(payment)--> CONFIRMED, seat HELD --> BOOKED
 *
 * The seat flip uses the same conditional-update trick as the hold endpoint,
 * so even here two concurrent confirms cannot both win.
 */
bookingsRouter.post(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = confirmSchema.parse(req.body ?? {});

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, seatId: true, status: true, expiresAt: true },
    });

    if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
    if (booking.userId !== userId) throw ApiError.forbidden('That is not your booking');

    if (booking.status === BookingStatus.CONFIRMED) {
      // Idempotent: a double-submit or a retried request returns the same result.
      const existing = await loadBooking(booking.id);
      res.json({ booking: shapeBooking(existing!), alreadyConfirmed: true });
      return;
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw ApiError.conflict('That booking was cancelled', 'BOOKING_CANCELLED');
    }

    if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
      throw ApiError.conflict('This booking expired — please start again', 'BOOKING_EXPIRED');
    }

    const { count } = await prisma.seat.updateMany({
      where: { id: booking.seatId, status: SeatStatus.HELD, heldBy: userId },
      data: { status: SeatStatus.BOOKED, heldUntil: null, heldBy: null },
    });

    if (count === 0) {
      throw ApiError.conflict(
        'Your hold on that seat expired — please pick it again',
        'HOLD_EXPIRED',
      );
    }

    const confirmed = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: null,
        paymentRef: `sim_pay_${crypto.randomBytes(10).toString('hex')}`,
      },
      select: bookingSelect,
    });

    res.json({
      booking: shapeBooking(confirmed),
      receipt: {
        simulated: true,
        cardLast4: body.cardLast4 ?? '4242',
        paidAt: confirmed.confirmedAt,
      },
    });
  }),
);

// ── GET /api/bookings ────────────────────────────────────────────────────────

bookingsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: {
        userId: req.user!.id,
        // Abandoned PENDING bookings are checkout debris, not trips.
        NOT: { status: BookingStatus.PENDING },
      },
      select: bookingSelect,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ bookings: bookings.map(shapeBooking) });
  }),
);

// ── GET /api/bookings/:id ────────────────────────────────────────────────────

bookingsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await loadBooking(req.params.id);
    if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');

    const owner = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });
    if (owner?.userId !== req.user!.id) {
      throw ApiError.forbidden('That is not your booking');
    }

    res.json({ booking: shapeBooking(booking) });
  }),
);

// ── PATCH /api/bookings/:id/cancel ───────────────────────────────────────────

bookingsRouter.patch(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        userId: true,
        seatId: true,
        status: true,
        totalCents: true,
        flight: { select: { departAt: true } },
      },
    });

    if (!booking) throw ApiError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
    if (booking.userId !== userId) throw ApiError.forbidden('That is not your booking');
    if (booking.status === BookingStatus.CANCELLED) {
      throw ApiError.conflict('That booking is already cancelled', 'ALREADY_CANCELLED');
    }
    if (booking.flight.departAt.getTime() < Date.now()) {
      throw ApiError.conflict('That flight has already departed', 'FLIGHT_DEPARTED');
    }

    // Release the seat back to inventory and cancel, together — a cancelled
    // booking holding a dead seat would quietly shrink the aircraft.
    const [, cancelled] = await prisma.$transaction([
      prisma.seat.update({
        where: { id: booking.seatId },
        data: { status: SeatStatus.AVAILABLE, heldUntil: null, heldBy: null },
      }),
      prisma.booking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
        select: bookingSelect,
      }),
    ]);

    res.json({
      booking: shapeBooking(cancelled),
      refund: {
        simulated: true,
        amountCents: booking.totalCents,
        message: 'Refund processed — allow 5–10 business days',
      },
    });
  }),
);
