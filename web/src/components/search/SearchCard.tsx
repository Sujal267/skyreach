'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import { flights } from '@/lib/api';
import type { Airport, Cabin } from '@/lib/types';
import { toDateInputValue } from '@/lib/format';
import { riseIn, transition } from '@/lib/motion';
import { Alert, Button, cx } from '@/components/ui';
import AirportPicker from './AirportPicker';

/**
 * The search card. Per the brief: a clean rectangular panel with a four-column
 * grid, floating over the live map. Precision over softness — tight radii,
 * hairline dividers between fields rather than four separate boxed inputs.
 */

export interface SearchCardProps {
  /** Prefill when returning to search from a results page. */
  initial?: { from?: string; to?: string; date?: string; passengers?: number; cabin?: Cabin };
  className?: string;
  /** Skip the entrance animation when the card is not the page's hero. */
  animate?: boolean;
}

const CABINS: { value: Cabin | ''; label: string }[] = [
  { value: '', label: 'Any cabin' },
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'BUSINESS', label: 'Business' },
];

export default function SearchCard({ initial, className, animate = true }: SearchCardProps) {
  const router = useRouter();
  const id = useId();

  const [airports, setAirports] = useState<Airport[]>([]);
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [date, setDate] = useState(initial?.date ?? '');
  const [passengers, setPassengers] = useState(initial?.passengers ?? 1);
  const [cabin, setCabin] = useState<Cabin | ''>(initial?.cabin ?? '');

  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = toDateInputValue(new Date());

  useEffect(() => {
    let cancelled = false;

    flights
      .airports()
      .then((res) => {
        if (cancelled) return;
        setAirports(res.airports);

        // Resolve prefilled IATA codes, or fall back to a sensible default
        // pair so a first-time visitor can search without typing anything.
        const from =
          res.airports.find((a) => a.iata === initial?.from) ??
          res.airports.find((a) => a.iata === 'JFK') ??
          res.airports[0] ??
          null;
        const to =
          res.airports.find((a) => a.iata === initial?.to) ??
          res.airports.find((a) => a.iata === 'LHR') ??
          res.airports[1] ??
          null;

        setOrigin(from);
        setDestination(to?.id === from?.id ? (res.airports[1] ?? null) : to);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load airports — is the API running?');
      });

    return () => {
      cancelled = true;
    };
  }, [initial?.from, initial?.to]);

  // Default to five days out: far enough that the seeded schedule is dense.
  useEffect(() => {
    if (date) return;
    const d = new Date();
    d.setDate(d.getDate() + 5);
    setDate(toDateInputValue(d));
  }, [date]);

  const swap = () => {
    setSwapping(true);
    setOrigin(destination);
    setDestination(origin);
    setTimeout(() => setSwapping(false), 300);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!origin || !destination) {
      setError('Choose both an origin and a destination.');
      return;
    }
    if (origin.id === destination.id) {
      setError('Origin and destination must be different.');
      return;
    }
    if (!date) {
      setError('Choose a departure date.');
      return;
    }

    setSubmitting(true);
    const qs = new URLSearchParams({
      from: origin.iata,
      to: destination.iata,
      date,
      passengers: String(passengers),
      ...(cabin ? { cabin } : {}),
    });
    router.push(`/search?${qs}`);
  };

  return (
    <motion.form
      onSubmit={submit}
      variants={animate ? riseIn : undefined}
      initial={animate ? 'initial' : false}
      animate={animate ? 'animate' : false}
      className={cx(
        'w-full rounded-md border border-line bg-surface-raised shadow-float',
        className,
      )}
      aria-label="Flight search"
    >
      <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-[1.15fr_1.15fr_0.9fr_0.9fr] md:divide-x md:divide-y-0">
        {/* Origin */}
        <div className="relative px-5 py-4">
          <AirportPicker
            label="Origin"
            airports={airports}
            value={origin}
            onChange={setOrigin}
            exclude={destination}
          />

          {/* Swap — sits on the divider between the two airport fields. */}
          <motion.button
            type="button"
            onClick={swap}
            animate={{ rotate: swapping ? 180 : 0 }}
            transition={transition.base}
            aria-label="Swap origin and destination"
            className="tactile absolute -bottom-4 right-5 z-20 grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-raised text-content-muted shadow-card hover:border-sky hover:text-sky md:-right-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 2.5v11M4 2.5L1.5 5M4 2.5L6.5 5M12 13.5v-11M12 13.5L9.5 11M12 13.5L14.5 11"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.button>
        </div>

        {/* Destination */}
        <div className="px-5 py-4">
          <AirportPicker
            label="Destination"
            airports={airports}
            value={destination}
            onChange={setDestination}
            exclude={origin}
          />
        </div>

        {/* Date */}
        <div className="px-5 py-4">
          <label htmlFor={`${id}-date`} className="block text-caption text-content-muted">
            Date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full bg-transparent font-mono text-data-lg text-content outline-none"
          />
        </div>

        {/* Passengers + cabin */}
        <div className="px-5 py-4">
          <label htmlFor={`${id}-pax`} className="block text-caption text-content-muted">
            Passengers
          </label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id={`${id}-pax`}
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
              className="bg-transparent text-h3 text-content outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} adult{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <span className="text-content-muted" aria-hidden>
              ·
            </span>
            <select
              value={cabin}
              onChange={(e) => setCabin(e.target.value as Cabin | '')}
              aria-label="Cabin class"
              className="min-w-0 flex-1 bg-transparent text-h3 text-content outline-none"
            >
              {CABINS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="border-t border-line px-5 py-3">
          <Alert>{error}</Alert>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={submitting}
        className="rounded-none rounded-b-md tracking-[0.08em]"
      >
        FIND FLIGHTS
      </Button>
    </motion.form>
  );
}
