'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

import { bookings as bookingsApi } from '@/lib/api';
import type { Booking } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { formatCents, formatDateShort, formatTime } from '@/lib/format';
import { fade, staggerChild, staggerParent, transition } from '@/lib/motion';
import { Alert, Button, EmptyState, Skeleton, StatusPill, cx } from '@/components/ui';

type Tab = 'upcoming' | 'past' | 'cancelled';

const TABS: { value: Tab; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent('/dashboard')}`);
      return;
    }

    bookingsApi
      .list()
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your trips'));
  }, [user, authLoading, router]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const all = bookings ?? [];

    return {
      upcoming: all.filter(
        (b) => b.status === 'CONFIRMED' && new Date(b.flight.arriveAt).getTime() >= now,
      ),
      past: all.filter(
        (b) => b.status === 'CONFIRMED' && new Date(b.flight.arriveAt).getTime() < now,
      ),
      cancelled: all.filter((b) => b.status === 'CANCELLED'),
    };
  }, [bookings]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);

    try {
      const res = await bookingsApi.cancel(cancelTarget.id);
      setBookings((prev) =>
        (prev ?? []).map((b) => (b.id === res.booking.id ? res.booking : b)),
      );
      setNotice(res.refund.message);
      setCancelTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel that booking');
    } finally {
      setCancelling(false);
    }
  };

  const visible = grouped[tab];

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-shell px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-h2 text-content">My Trips</h1>
            {user && (
              <p className="mt-1 text-caption text-content-muted">
                Signed in as {user.email}
              </p>
            )}
          </div>
          <Link href="/">
            <Button variant="secondary">Book a flight</Button>
          </Link>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex gap-1 border-b border-line" role="tablist" aria-label="Trips">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cx(
                'tactile relative px-4 py-3 text-caption font-medium transition-colors duration-fast ease-out',
                tab === t.value ? 'text-content' : 'text-content-muted hover:text-content',
              )}
            >
              {t.label}
              <span className="ml-1.5 text-content-muted">{grouped[t.value].length}</span>
              {tab === t.value && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-sky"
                  transition={transition.fast}
                />
              )}
            </button>
          ))}
        </div>

        {notice && (
          <div className="mt-6">
            <Alert tone="info" title="Cancellation complete">
              {notice}
            </Alert>
          </div>
        )}

        {error && (
          <div className="mt-6">
            <Alert>{error}</Alert>
          </div>
        )}

        {/* List */}
        <div className="mt-6">
          {bookings === null && !error && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          )}

          {bookings !== null && visible.length === 0 && (
            <EmptyState
              title={
                tab === 'upcoming'
                  ? 'No trips ahead'
                  : tab === 'past'
                    ? 'Nothing flown yet'
                    : 'Nothing cancelled'
              }
              action={
                tab === 'upcoming' ? (
                  <Link href="/">
                    <Button>Find a flight</Button>
                  </Link>
                ) : undefined
              }
            >
              {tab === 'upcoming'
                ? 'Book a flight and it will appear here, with live tracking once it departs.'
                : undefined}
            </EmptyState>
          )}

          <AnimatePresence mode="wait">
            {visible.length > 0 && (
              <motion.ul
                key={tab}
                variants={staggerParent()}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-3"
              >
                {visible.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    onCancel={() => setCancelTarget(booking)}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Cancel confirmation */}
      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            variants={fade}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-5 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={transition.base}
              className="w-full max-w-md rounded-md border border-line bg-surface-raised p-6"
            >
              <h2 id="cancel-title" className="text-h3 text-content">
                Cancel this booking?
              </h2>
              <p className="mt-2 text-caption leading-relaxed text-content-muted">
                {cancelTarget.flight.origin.iata} → {cancelTarget.flight.destination.iata} on{' '}
                {formatDateShort(cancelTarget.flight.departAt, cancelTarget.flight.origin.timezone)}
                , seat {cancelTarget.seat.seatNumber}. The seat is released immediately and cannot
                be reclaimed.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setCancelTarget(null)}
                  disabled={cancelling}
                >
                  Keep booking
                </Button>
                <Button variant="danger" loading={cancelling} onClick={() => void confirmCancel()}>
                  Cancel booking
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel: () => void }) {
  const inAir = booking.liveStatus === 'IN_AIR';
  const canCancel =
    booking.status === 'CONFIRMED' && new Date(booking.flight.departAt).getTime() > Date.now();

  return (
    <motion.li variants={staggerChild}>
      <div
        className={cx(
          'rounded border p-5 transition-colors duration-fast ease-out',
          inAir ? 'border-sky bg-sky/[0.06]' : 'border-line bg-surface-raised',
        )}
      >
        <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          {/* When */}
          <div className="lg:w-40">
            <p className="font-mono text-data-lg text-content">
              {formatTime(booking.flight.departAt, booking.flight.origin.timezone)}
            </p>
            <p className="text-caption text-content-muted">
              {formatDateShort(booking.flight.departAt, booking.flight.origin.timezone)}
            </p>
          </div>

          {/* What */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-data-lg text-content">
                {booking.flight.origin.iata}
                <span className="mx-2 text-content-muted" aria-hidden>
                  →
                </span>
                {booking.flight.destination.iata}
              </p>
              <StatusPill status={booking.liveStatus} />
            </div>

            <p className="mt-1.5 text-caption text-content-muted">
              {booking.flight.origin.city} to {booking.flight.destination.city} ·{' '}
              {booking.flight.flightNumber} · Seat{' '}
              <span className="font-mono">{booking.seat.seatNumber}</span>
            </p>

            <p className="mt-1 font-mono text-caption text-content-muted">
              {booking.bookingRef} · {formatCents(booking.totalCents)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Link href={`/bookings/${booking.id}`}>
              <Button variant={inAir ? 'primary' : 'secondary'} size="sm">
                {inAir ? 'View live track' : 'Manage booking'}
              </Button>
            </Link>

            {canCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="tactile px-2 py-1.5 text-caption text-content-muted underline underline-offset-2 hover:text-error"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  );
}
