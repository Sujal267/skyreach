'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

import type { FlightSummary } from '@/lib/types';
import { formatCents, formatMinutes, formatTime } from '@/lib/format';
import { staggerChild } from '@/lib/motion';
import { Badge, SeatsLeftBadge } from '@/components/ui';

/**
 * A result row, built for scanning down a column rather than reading across.
 * Times, duration and price are all mono so they align vertically between
 * cards — that alignment is what makes comparison fast, and it is the reason
 * the type system has a separate data face at all.
 */
export default function FlightCard({
  flight,
  passengers,
}: {
  flight: FlightSummary;
  passengers: number;
}) {
  const href = `/flights/${flight.id}?passengers=${passengers}`;

  return (
    <motion.li variants={staggerChild}>
      <Link
        href={href}
        className="tactile group block rounded border border-line bg-surface-raised p-4 transition-shadow duration-fast ease-out hover:shadow-card sm:p-5"
      >
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[auto_1fr_auto] sm:gap-6 lg:grid-cols-[auto_1fr_auto_auto]">
          {/* Carrier */}
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xs bg-surface-sunken font-mono text-caption font-semibold text-content-muted"
              aria-hidden
            >
              SR
            </span>
            <div>
              <p className="font-mono text-data text-content-muted">{flight.flightNumber}</p>
              <p className="text-caption text-content-muted">{flight.aircraft.model}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-right">
              <p className="font-mono text-data-lg text-content">
                {formatTime(flight.departAt, flight.origin.timezone)}
              </p>
              <p className="font-mono text-caption text-content-muted">{flight.origin.iata}</p>
            </div>

            {/* Solid dot at origin, hollow circle at destination. */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <p className="text-caption text-content-muted">
                {formatMinutes(flight.durationMinutes)}
              </p>
              <div className="flex w-full items-center gap-1" aria-hidden>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate" />
                <span className="h-px flex-1 bg-line" />
                <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-slate">
                  <path
                    d="M1 5h6M5 2l3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="h-px flex-1 bg-line" />
                <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-slate" />
              </div>
              <p className="text-caption text-content-muted">Non-stop</p>
            </div>

            <div>
              <p className="font-mono text-data-lg text-content">
                {formatTime(flight.arriveAt, flight.destination.timezone)}
              </p>
              <p className="font-mono text-caption text-content-muted">
                {flight.destination.iata}
              </p>
            </div>
          </div>

          {/* Status flags */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {flight.delayMinutes > 0 && (
              <Badge tone="alert">Delayed {formatMinutes(flight.delayMinutes)}</Badge>
            )}
            {flight.isTracked && <Badge tone="sky">Live tracked</Badge>}
            <SeatsLeftBadge count={flight.seatsLeft} />
          </div>

          {/* Price + action */}
          <div className="flex items-center justify-between gap-4 border-t border-line pt-4 sm:border-0 sm:pt-0 lg:justify-end">
            <div className="text-right">
              <p className="text-caption text-content-muted">From</p>
              <p className="font-mono text-data-lg font-semibold text-content">
                {formatCents(flight.fromPriceCents)}
              </p>
            </div>
            <span className="tactile inline-flex items-center gap-1.5 rounded bg-sky px-4 py-2.5 text-caption font-semibold text-white transition-colors duration-fast ease-out group-hover:bg-[#35699c]">
              SELECT
              <span aria-hidden>→</span>
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
