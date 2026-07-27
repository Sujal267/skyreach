'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

import { ApiError, flights, seats as seatsApi } from '@/lib/api';
import type { FlightDetailResponse, Seat } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useCountdown } from '@/lib/hooks';
import { formatCents, formatDateShort, formatMinutes, formatTime } from '@/lib/format';
import { slideUp, transition } from '@/lib/motion';
import SeatMap from '@/components/seats/SeatMap';
import { Alert, Badge, Button, Skeleton } from '@/components/ui';

export default function FlightDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<FlightDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Seat | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [pendingSeatId, setPendingSeatId] = useState<string | null>(null);
  const [shakeSeatId, setShakeSeatId] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);

  const countdown = useCountdown(holdExpiresAt);

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const res = await flights.detail(id);
      setData(res);

      // A hold survives a page reload, so restore the user's own selection.
      const mine = res.seats.find((s) => s.heldByYou);
      if (mine) {
        setSelected(mine);
        setHoldExpiresAt(mine.holdExpiresAt);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this flight');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // When the hold lapses, drop the selection rather than letting the user walk
  // into checkout with a seat that is no longer theirs.
  useEffect(() => {
    if (!holdExpiresAt || !countdown.expired) return;
    setSelected(null);
    setHoldExpiresAt(null);
    setHoldError('Your seat hold expired. Choose a seat again.');
    void load();
  }, [countdown.expired, holdExpiresAt, load]);

  // ── Select ───────────────────────────────────────────────────────────────

  const onSelect = async (seat: Seat) => {
    setHoldError(null);

    if (!user) {
      // Bounce through sign-in and come straight back to this seat map.
      router.push(`/login?next=${encodeURIComponent(`/flights/${id}`)}`);
      return;
    }

    // Deselecting: release the hold so someone else can take it immediately.
    if (selected?.id === seat.id) {
      setSelected(null);
      setHoldExpiresAt(null);
      try {
        await seatsApi.release(seat.id);
      } catch {
        // Already gone or already lapsed — nothing to undo.
      }
      void load();
      return;
    }

    setPendingSeatId(seat.id);

    try {
      const res = await seatsApi.hold(seat.id);
      setSelected({ ...seat, status: 'HELD', heldByYou: true });
      setHoldExpiresAt(
        typeof res.seat.holdExpiresAt === 'string' ? res.seat.holdExpiresAt : null,
      );
      void load();
    } catch (err) {
      // Lost the race. Shake, explain, and refresh so the map shows truth.
      setShakeSeatId(seat.id);
      setTimeout(() => setShakeSeatId(null), 500);
      setHoldError(
        err instanceof ApiError ? err.message : 'Could not hold that seat. Try another.',
      );
      void load();
    } finally {
      setPendingSeatId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="mx-auto max-w-shell px-5 py-20 sm:px-8">
        <Alert title="Could not load this flight">{loadError}</Alert>
        <Link href="/" className="mt-4 inline-block text-caption text-sky underline">
          Back to search
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-shell px-5 py-10 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      </div>
    );
  }

  const { flight } = data;
  const total = selected ? selected.priceCents : 0;

  return (
    <div className="bg-surface pb-32">
      {/* Route header */}
      <div className="border-b border-line bg-surface-sunken">
        <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-8">
          <p className="font-mono text-data text-content">
            {flight.origin.iata} → {flight.destination.iata}
          </p>
          <span className="text-content-muted" aria-hidden>
            |
          </span>
          <p className="font-mono text-data text-content-muted">{flight.flightNumber}</p>
          <span className="text-content-muted" aria-hidden>
            |
          </span>
          <p className="font-mono text-data text-content-muted">
            {formatDateShort(flight.departAt, flight.origin.timezone)}
          </p>
          {flight.delayMinutes > 0 && (
            <Badge tone="alert">Delayed {formatMinutes(flight.delayMinutes)}</Badge>
          )}
          {flight.isTracked && <Badge tone="sky">Live tracked</Badge>}
        </div>
      </div>

      <div className="mx-auto max-w-shell px-5 py-8 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* ── Sticky itinerary ─────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded border border-line bg-surface-raised p-5">
              <h1 className="text-h3 text-content">Flight Itinerary</h1>

              <div className="mt-5 space-y-4">
                <TimelineStop
                  time={formatTime(flight.departAt, flight.origin.timezone)}
                  iata={flight.origin.iata}
                  city={flight.origin.city}
                  name={flight.origin.name}
                  filled
                />
                <p className="pl-[26px] text-caption text-content-muted">
                  {formatMinutes(flight.durationMinutes)} · {flight.aircraft.model}
                </p>
                <TimelineStop
                  time={formatTime(flight.arriveAt, flight.destination.timezone)}
                  iata={flight.destination.iata}
                  city={flight.destination.city}
                  name={flight.destination.name}
                />
              </div>
            </div>

            {/* Selection summary */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  variants={slideUp}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="mt-4 rounded border border-sky bg-surface-raised p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="font-mono text-data-lg font-semibold text-content">
                        Seat {selected.seatNumber}
                      </p>
                      <p className="text-caption capitalize text-content-muted">
                        {selected.cabin.toLowerCase()}
                      </p>
                    </div>
                    <p className="font-mono text-data-lg text-content">
                      {formatCents(selected.priceCents)}
                    </p>
                  </div>

                  {holdExpiresAt && !countdown.expired && (
                    <p className="mt-3 border-t border-line pt-3 text-caption text-content-muted">
                      Held for you ·{' '}
                      <span
                        className={`font-mono ${countdown.secondsLeft < 60 ? 'text-error' : 'text-content'}`}
                      >
                        {countdown.label}
                      </span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </aside>

          {/* ── Seat map ─────────────────────────────────────────────────── */}
          <section aria-labelledby="seat-heading">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="seat-heading" className="text-h2 text-content">
                  Select your seat
                </h2>
                <p className="mt-1 text-caption text-content-muted">
                  {flight.aircraft.model} · {flight.aircraft.totalSeats} seats
                </p>
              </div>
            </div>

            {!authLoading && !user && (
              <div className="mb-5">
                <Alert tone="info" title="Sign in to choose a seat">
                  Seats are held for ten minutes while you check out, so we need to know who the
                  hold belongs to.{' '}
                  <Link
                    href={`/login?next=${encodeURIComponent(`/flights/${id}`)}`}
                    className="underline underline-offset-2"
                  >
                    Sign in or create an account
                  </Link>
                  .
                </Alert>
              </div>
            )}

            {holdError && (
              <div className="mb-5">
                <Alert>{holdError}</Alert>
              </div>
            )}

            <SeatMap
              definition={flight.aircraft.seatMap}
              seats={data.seats}
              selectedSeatId={selected?.id ?? null}
              pendingSeatId={pendingSeatId}
              shakeSeatId={shakeSeatId}
              onSelect={(seat) => void onSelect(seat)}
              disabled={!user}
            />
          </section>
        </div>
      </div>

      {/* ── Sticky checkout bar ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            variants={slideUp}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition.base}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-raised/95 backdrop-blur-[10px]"
          >
            <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
              <div className="flex items-baseline gap-4">
                <p className="font-mono text-data text-content-muted">
                  Seat {selected.seatNumber}
                </p>
                <p className="font-mono text-data-lg font-semibold text-content">
                  {formatCents(total)}
                </p>
                {holdExpiresAt && !countdown.expired && (
                  <p className="text-caption text-content-muted">
                    held {countdown.label}
                  </p>
                )}
              </div>

              <Button
                onClick={() =>
                  router.push(`/checkout?seatId=${selected.id}&flightId=${flight.id}`)
                }
                size="lg"
              >
                Continue to checkout →
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TimelineStop({
  time,
  iata,
  city,
  name,
  filled,
}: {
  time: string;
  iata: string;
  city: string;
  name: string;
  filled?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
          filled ? 'bg-sky' : 'border-2 border-sky bg-transparent'
        }`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="font-mono text-data-lg text-content">
          {time} <span className="text-content-muted">{iata}</span>
        </p>
        <p className="truncate text-caption text-content-muted">
          {city} · {name}
        </p>
      </div>
    </div>
  );
}
