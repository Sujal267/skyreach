'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

import { bookings } from '@/lib/api';
import type { Booking, LiveAircraft } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { ThemeScope } from '@/lib/theme-context';
import {
  formatCents,
  formatDateLong,
  formatHeading,
  formatNumber,
  formatTime,
  metresToFeet,
  mpsToKnots,
} from '@/lib/format';
import { transition } from '@/lib/motion';
import { Alert, Badge, Button, Skeleton, StatusPill } from '@/components/ui';

const LiveMap = dynamic(() => import('@/components/map/LiveMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ink" />,
});

/**
 * ── The payoff page ─────────────────────────────────────────────────────────
 *
 * Two states, and being honest about which one you are in is the whole point:
 *
 *   A. The booked flight's tracked aircraft is airborne right now → a live map
 *      following its real position, updating every 15s, with real altitude,
 *      speed and heading in the corner.
 *
 *   B. It is not → a static great-circle route map and a plain note saying
 *      tracking starts at departure. Faking a position for an aircraft that has
 *      not taken off would undermine the one thing that makes state A land.
 */
export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const justBooked = params.get('justBooked') === '1';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aircraft, setAircraft] = useState<LiveAircraft | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setError('Sign in to view this booking.');
      return;
    }

    bookings
      .get(id)
      .then((res) => setBooking(res.booking))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load booking'));
  }, [id, user, authLoading]);

  // Re-derive the live status periodically — a flight departs while the page
  // is open, and the UI should follow it from Scheduled to In air on its own.
  useEffect(() => {
    if (!booking) return;
    const t = setInterval(() => {
      bookings
        .get(id)
        .then((res) => setBooking(res.booking))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [id, booking]);

  if (error) {
    return (
      <div className="mx-auto max-w-shell px-5 py-20 sm:px-8">
        <Alert title="Could not open this booking">{error}</Alert>
        <Link href="/dashboard" className="mt-4 inline-block text-caption text-sky underline">
          Go to My Trips
        </Link>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-shell px-5 py-20 sm:px-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const isLive = booking.trackable && booking.flight.trackingIcao24 !== null;
  const cancelled = booking.status === 'CANCELLED';

  return (
    <>
      {/* Map-centric screen: the product goes moody here. */}
      <ThemeScope theme="dark" />

      <div className="min-h-dvh bg-ink">
        <div className="mx-auto max-w-shell px-5 py-12 sm:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            {/* ── Left: the confirmation ──────────────────────────────── */}
            <div>
              {justBooked && !cancelled && <Checkmark />}

              <h1 className="mt-8 font-display text-display text-pearl">
                {cancelled
                  ? 'This trip is cancelled.'
                  : isLive
                    ? 'Welcome aboard, you’re tracked.'
                    : 'Your trip is confirmed.'}
              </h1>

              <p className="mt-5 font-mono text-data text-pearl/60">
                Booking Ref{' '}
                <span className="text-pearl">{booking.bookingRef}</span>
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <StatusPill status={booking.liveStatus} />
                {booking.flight.delayMinutes > 0 && !cancelled && (
                  <Badge tone="alert">Delayed {booking.flight.delayMinutes}m</Badge>
                )}
              </div>

              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-8">
                <Detail
                  label="Route"
                  value={`${booking.flight.origin.iata} → ${booking.flight.destination.iata}`}
                  mono
                />
                <Detail label="Flight" value={booking.flight.flightNumber} mono />
                <Detail
                  label="Departs"
                  value={`${formatTime(booking.flight.departAt, booking.flight.origin.timezone)} · ${formatDateLong(booking.flight.departAt, booking.flight.origin.timezone)}`}
                />
                <Detail
                  label="Arrives"
                  value={`${formatTime(booking.flight.arriveAt, booking.flight.destination.timezone)}`}
                  mono
                />
                <Detail label="Seat" value={booking.seat.seatNumber} mono />
                <Detail label="Passenger" value={booking.passengerName} />
                <Detail label="Aircraft" value={booking.flight.aircraft.model} />
                <Detail label="Paid" value={formatCents(booking.totalCents)} mono />
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/dashboard">
                  <Button variant="secondary">View all trips</Button>
                </Link>
                <Link href="/">
                  <Button variant="ghost">Book another flight</Button>
                </Link>
              </div>
            </div>

            {/* ── Right: the map ──────────────────────────────────────── */}
            <div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...transition.slow, delay: justBooked ? 0.5 : 0 }}
                className="relative aspect-[4/3] overflow-hidden rounded-md border border-white/10 lg:aspect-[5/4]"
              >
                {isLive ? (
                  <LiveMap
                    mode="track"
                    className="absolute inset-0"
                    icao24={booking.flight.trackingIcao24}
                    theme="dark"
                    initialZoom={5}
                    initialCenter={[booking.flight.origin.lon, booking.flight.origin.lat]}
                    onAircraftUpdate={setAircraft}
                  />
                ) : (
                  <LiveMap
                    mode="route"
                    className="absolute inset-0"
                    theme="dark"
                    origin={booking.flight.origin}
                    destination={booking.flight.destination}
                    interactive={false}
                  />
                )}

                {/* Live data overlay — real numbers, or nothing at all. */}
                {isLive && aircraft && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={transition.base}
                    className="absolute bottom-4 right-4 rounded border border-white/15 bg-ink/85 p-3.5 backdrop-blur-[10px]"
                  >
                    <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-pearl/50">
                      <span className="relative flex h-1.5 w-1.5" aria-hidden>
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                      </span>
                      Live Data
                    </p>
                    <dl className="space-y-1 font-mono text-data text-pearl">
                      <Readout label="ALT" value={`${formatNumber(metresToFeet(aircraft.alt))} ft`} />
                      <Readout label="SPD" value={`${formatNumber(mpsToKnots(aircraft.spd))} kt`} />
                      <Readout label="HDG" value={formatHeading(aircraft.hdg)} />
                      <Readout label="A/C" value={aircraft.callsign ?? booking.flight.flightNumber} />
                    </dl>
                  </motion.div>
                )}
              </motion.div>

              <p className="mt-4 text-caption leading-relaxed text-pearl/50">
                {isLive ? (
                  <>
                    Following{' '}
                    <span className="font-mono text-pearl/80">
                      {booking.flight.trackingIcao24?.toUpperCase()}
                    </span>{' '}
                    — a genuine aircraft, airborne right now, from the OpenSky Network’s ADS-B
                    feed. Position updates every 15 seconds and is interpolated in between.
                  </>
                ) : cancelled ? (
                  'This booking was cancelled and the seat has been released.'
                ) : (
                  'Live tracking activates once your flight departs. Until then this is the great-circle route your aircraft will fly.'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** SVG checkmark that draws itself. The one slow animation outside the map. */
function Checkmark() {
  return (
    <motion.svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      initial="initial"
      animate="animate"
      aria-hidden
    >
      <motion.circle
        cx="36"
        cy="36"
        r="33"
        stroke="var(--success)"
        strokeWidth="2"
        variants={{
          initial: { pathLength: 0, opacity: 0 },
          animate: {
            pathLength: 1,
            opacity: 1,
            transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
          },
        }}
      />
      <motion.path
        d="M22 37.5L31.5 47L50 26"
        stroke="var(--success)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          initial: { pathLength: 0 },
          animate: {
            pathLength: 1,
            transition: { duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] },
          },
        }}
      />
    </motion.svg>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-pearl/45">{label}</dt>
      <dd className={`mt-1 text-pearl ${mono ? 'font-mono text-data' : 'text-body'}`}>{value}</dd>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-8 shrink-0 text-pearl/45">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
