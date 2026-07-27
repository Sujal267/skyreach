'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { ApiError, bookings, flights } from '@/lib/api';
import type { FlightDetailResponse, Seat } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useCountdown } from '@/lib/hooks';
import { formatCents, formatDateShort, formatMinutes, formatTime } from '@/lib/format';
import { Alert, Button, Field, Input, Skeleton } from '@/components/ui';
import TestModeBanner from '@/components/checkout/TestModeBanner';
import PaymentForm, {
  validatePayment,
  type PaymentFormValue,
} from '@/components/checkout/PaymentForm';

/** Matches the server's TAX_RATE. Display only — the server is authoritative. */
const TAX_RATE = 0.12;

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const seatId = params.get('seatId') ?? '';
  const flightId = params.get('flightId') ?? '';

  const [data, setData] = useState<FlightDetailResponse | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [passengerName, setPassengerName] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [payment, setPayment] = useState<PaymentFormValue>({
    cardNumber: '',
    expiry: '',
    cvc: '',
    name: '',
  });
  const [paymentErrors, setPaymentErrors] = useState<
    Partial<Record<keyof PaymentFormValue, string>>
  >({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const countdown = useCountdown(seat?.holdExpiresAt ?? null);

  // ── Guard: must be signed in ─────────────────────────────────────────────

  useEffect(() => {
    if (authLoading || user) return;
    router.replace(`/login?next=${encodeURIComponent(`/checkout?seatId=${seatId}&flightId=${flightId}`)}`);
  }, [authLoading, user, router, seatId, flightId]);

  // ── Load flight + verify the hold is still ours ──────────────────────────

  const load = useCallback(async () => {
    if (!flightId || !seatId) {
      setLoadError('Missing checkout details. Please pick a seat again.');
      return;
    }

    try {
      const res = await flights.detail(flightId);
      setData(res);

      const found = res.seats.find((s) => s.id === seatId);
      if (!found) {
        setLoadError('That seat no longer exists on this flight.');
        return;
      }
      if (!found.heldByYou) {
        setLoadError('Your hold on that seat expired. Please choose a seat again.');
        return;
      }
      setSeat(found);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your selection');
    }
  }, [flightId, seatId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // Prefill from the signed-in account — one less thing to type.
  useEffect(() => {
    if (!user) return;
    setPassengerName((n) => n || `${user.firstName} ${user.lastName}`);
    setPassengerEmail((e) => e || user.email);
    setPayment((p) => (p.name ? p : { ...p, name: `${user.firstName} ${user.lastName}` }));
  }, [user]);

  // ── Submit ───────────────────────────────────────────────────────────────

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const nextFieldErrors: Record<string, string> = {};
    if (passengerName.trim().length < 2) {
      nextFieldErrors.passengerName = 'Enter the passenger’s full name';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passengerEmail.trim())) {
      nextFieldErrors.passengerEmail = 'Enter a valid email address';
    }
    setFieldErrors(nextFieldErrors);

    const nextPaymentErrors = validatePayment(payment);
    setPaymentErrors(nextPaymentErrors);

    if (Object.keys(nextFieldErrors).length > 0 || Object.keys(nextPaymentErrors).length > 0) {
      return;
    }
    if (!seat) return;

    setSubmitting(true);

    try {
      // Step 1 — create the PENDING booking. This is where a real build would
      // also create the Stripe PaymentIntent and get back a client_secret.
      const created = await bookings.create({
        seatId: seat.id,
        passengerName: passengerName.trim(),
        passengerEmail: passengerEmail.trim(),
      });

      // Step 2 — "capture". Simulated, but deliberately not instant: the whole
      // point of a PENDING state is that time passes between intent and
      // confirmation, and the UI has to hold up during it.
      await new Promise((resolve) => setTimeout(resolve, 900));

      // Step 3 — confirm. Server flips the booking to CONFIRMED and the seat
      // to BOOKED, atomically.
      const confirmed = await bookings.confirm(created.booking.id, {
        cardLast4: payment.cardNumber.replace(/\s/g, '').slice(-4),
      });

      router.push(`/bookings/${confirmed.booking.id}?justBooked=1`);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'Could not complete the booking. Try again.',
      );
      setSubmitting(false);
      // The seat may have been lost in the gap — refresh so the page tells
      // the truth about what is still held.
      void load();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="mx-auto max-w-shell px-5 py-20 sm:px-8">
        <Alert title="Checkout could not continue">{loadError}</Alert>
        <Link
          href={flightId ? `/flights/${flightId}` : '/'}
          className="mt-4 inline-block text-caption text-sky underline underline-offset-2"
        >
          ← Back to seat selection
        </Link>
      </div>
    );
  }

  if (!data || !seat) return <CheckoutSkeleton />;

  const { flight } = data;
  const subtotal = seat.priceCents;
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  return (
    <div className="bg-surface pb-24">
      <div className="mx-auto max-w-shell px-5 py-8 sm:px-8">
        <Link
          href={`/flights/${flight.id}`}
          className="text-caption text-content-muted underline underline-offset-2 hover:text-sky"
        >
          ← Change seat
        </Link>

        <h1 className="mt-4 text-h2 text-content">Checkout</h1>

        {seat.holdExpiresAt && !countdown.expired && (
          <p className="mt-1.5 text-caption text-content-muted">
            Seat {seat.seatNumber} is held for you ·{' '}
            <span
              className={`font-mono ${countdown.secondsLeft < 120 ? 'text-error' : 'text-content'}`}
            >
              {countdown.label}
            </span>{' '}
            remaining
          </p>
        )}

        <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
          {/* ── Passenger + payment ─────────────────────────────────────── */}
          <div className="space-y-6">
            <section className="rounded border border-line bg-surface-raised p-5">
              <h2 className="text-h3 text-content">Passenger details</h2>
              <p className="mt-1 text-caption text-content-muted">
                As printed on the travel document.
              </p>

              <div className="mt-5 space-y-4">
                <Field
                  label="Full name"
                  htmlFor="passengerName"
                  error={fieldErrors.passengerName}
                >
                  <Input
                    id="passengerName"
                    value={passengerName}
                    autoComplete="name"
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.passengerName)}
                    onChange={(e) => setPassengerName(e.target.value)}
                  />
                </Field>

                <Field
                  label="Email"
                  htmlFor="passengerEmail"
                  error={fieldErrors.passengerEmail}
                  hint="Your booking reference is shown on screen — no email is actually sent."
                >
                  <Input
                    id="passengerEmail"
                    type="email"
                    value={passengerEmail}
                    autoComplete="email"
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.passengerEmail)}
                    onChange={(e) => setPassengerEmail(e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <PaymentForm
              value={payment}
              onChange={setPayment}
              errors={paymentErrors}
              disabled={submitting}
            />

            {submitError && <Alert title="Payment could not complete">{submitError}</Alert>}
          </div>

          {/* ── Order summary ──────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded border border-line bg-surface-raised p-5">
              <h2 className="text-h3 text-content">Order summary</h2>

              <div className="mt-5 space-y-3 border-b border-line pb-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-data text-content">
                    {flight.origin.iata} → {flight.destination.iata}
                  </p>
                  <p className="font-mono text-data text-content-muted">
                    {flight.flightNumber}
                  </p>
                </div>

                <p className="font-mono text-data text-content-muted">
                  {formatDateShort(flight.departAt, flight.origin.timezone)} ·{' '}
                  {formatTime(flight.departAt, flight.origin.timezone)} →{' '}
                  {formatTime(flight.arriveAt, flight.destination.timezone)}
                </p>

                <p className="text-caption text-content-muted">
                  {formatMinutes(flight.durationMinutes)} · {flight.aircraft.model}
                </p>

                <p className="text-caption text-content-muted">
                  Seat{' '}
                  <span className="font-mono text-content">{seat.seatNumber}</span> ·{' '}
                  <span className="capitalize">{seat.cabin.toLowerCase()}</span>
                </p>
              </div>

              <dl className="mt-5 space-y-2.5">
                <Line label="Base fare" value={formatCents(subtotal)} />
                <Line label="Taxes & fees" value={formatCents(tax)} />
              </dl>

              <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-line pt-5">
                <p className="text-h3 text-content">Total</p>
                <p className="font-mono text-data-lg font-semibold text-content">
                  {formatCents(total)}
                </p>
              </div>

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                className="mt-5"
                disabled={countdown.expired}
              >
                {submitting ? 'Processing…' : `Pay ${formatCents(total)}`}
              </Button>

              <p className="mt-3 text-center text-caption text-content-muted">
                No real charge occurs.
              </p>
            </div>
          </aside>
        </form>
      </div>

      <TestModeBanner />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-caption text-content-muted">{label}</dt>
      <dd className="font-mono text-data text-content">{value}</dd>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-shell px-5 py-10 sm:px-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <Skeleton className="h-[520px] w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
