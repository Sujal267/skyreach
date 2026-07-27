'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { flights } from '@/lib/api';
import type { PopularRoute } from '@/lib/types';
import { formatCents } from '@/lib/format';
import { staggerChild, staggerParent, transition } from '@/lib/motion';
import SearchCard from '@/components/search/SearchCard';
import { Skeleton } from '@/components/ui';

/**
 * The map is client-only — MapLibre reaches for `window` and WebGL at module
 * scope, neither of which exist during SSR.
 */
const LiveMap = dynamic(() => import('@/components/map/LiveMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ink" />,
});

export default function HomePage() {
  const [routes, setRoutes] = useState<PopularRoute[] | null>(null);
  const [trafficCount, setTrafficCount] = useState(0);

  useEffect(() => {
    flights
      .popular()
      .then((res) => setRoutes(res.routes))
      .catch(() => setRoutes([]));
  }, []);

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate min-h-[640px] overflow-hidden bg-ink">
        {/*
          Real global air traffic, dimmed to 0.7 and non-interactive — texture,
          not a feature. It is the first "wait, is that real?" moment, and it
          costs nothing extra because it reads from the same cached snapshot
          every other map on the site uses.
        */}
        <LiveMap
          mode="ambient"
          className="absolute inset-0"
          interactive={false}
          dim={0.7}
          initialZoom={1.5}
          initialCenter={[-20, 35]}
          onTrafficCount={setTrafficCount}
        />

        {/* Vignette so the search card sits on something legible. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 45%, rgba(11,12,16,0.35) 0%, rgba(11,12,16,0.72) 55%, rgba(11,12,16,0.92) 100%)',
          }}
          aria-hidden
        />

        <div className="relative mx-auto flex min-h-[640px] max-w-shell flex-col justify-center px-5 py-20 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition.base}
            className="mb-8 max-w-2xl"
          >
            <p className="flex items-center gap-2 font-mono text-caption uppercase tracking-[0.16em] text-pearl/60">
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky" />
              </span>
              {trafficCount > 0
                ? `${trafficCount.toLocaleString()} aircraft airborne right now`
                : 'Connecting to live traffic…'}
            </p>

            <h1 className="mt-4 font-display text-display text-pearl">
              Book the flight. Then watch it fly.
            </h1>

            <p className="mt-4 max-w-lg text-body text-pearl/70">
              Every aircraft on this map is real, live ADS-B data. Book a seat and, once your
              flight is airborne, track its actual counterpart across the world.
            </p>
          </motion.div>

          <SearchCard className="max-w-5xl" />
        </div>
      </section>

      {/* ── Popular routes ────────────────────────────────────────────────── */}
      <section className="bg-surface py-16 sm:py-20">
        <div className="mx-auto max-w-shell px-5 sm:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-h2 text-content">Popular Routes</h2>
              <p className="mt-1.5 text-caption text-content-muted">
                Seat counts below are live inventory, updated as people book.
              </p>
            </div>
          </div>

          <motion.ul
            variants={staggerParent()}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {routes === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-52 w-full" />
                </li>
              ))}

            {routes?.map((route) => (
              <motion.li key={route.key} variants={staggerChild}>
                <RouteCard route={route} />
              </motion.li>
            ))}

            {routes?.length === 0 && (
              <li className="col-span-full rounded border border-dashed border-line px-6 py-10 text-center text-caption text-content-muted">
                No departures in the next 24 hours. Search any date above to see the full
                schedule.
              </li>
            )}
          </motion.ul>
        </div>
      </section>

      {/* ── The honest bit ────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-surface-sunken py-16">
        <div className="mx-auto grid max-w-shell gap-10 px-5 sm:px-8 md:grid-cols-3">
          {[
            {
              title: 'Real aircraft, live',
              body: 'Positions, altitudes, headings and speeds come from the OpenSky Network’s ADS-B feed — the same data flight trackers use. Nothing on the map is simulated.',
            },
            {
              title: 'Invented schedules',
              body: 'Flights, seat maps and fares are demo data we generated. OpenSky has no concept of a commercial schedule, so it could not power a booking flow even in principle.',
            },
            {
              title: 'Simulated payment',
              body: 'Checkout walks the full state machine — hold, pay, confirm — without a payment processor. No card is charged, and none is ever transmitted.',
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="text-h3 text-content">{item.title}</h3>
              <p className="mt-2 text-caption leading-relaxed text-content-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * Route card. The destination image is a CSS gradient rather than a photo —
 * no external image host, no layout shift, no licensing question, and it keeps
 * the grayscale-plus-blue-multiply treatment the design calls for.
 */
function RouteCard({ route }: { route: PopularRoute }) {
  const scarce = route.seatsAvailable < 20;

  return (
    <Link
      href={`/search?from=${route.origin.iata}&to=${route.destination.iata}&date=${new Date(
        Date.now() + 86_400_000,
      )
        .toISOString()
        .slice(0, 10)}&passengers=1`}
      className="tactile group block overflow-hidden rounded border border-line bg-surface-sunken"
    >
      <div className="relative h-28 overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-base ease-out group-hover:scale-105"
          style={{
            background:
              'linear-gradient(135deg, #2a3038 0%, #4a5460 45%, #1c2128 100%)',
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 mix-blend-multiply"
          style={{ background: 'linear-gradient(160deg, #3D7AB5 0%, #1d3a56 100%)', opacity: 0.75 }}
          aria-hidden
        />
        <div className="absolute inset-0 flex items-end p-4">
          <p className="font-mono text-data-lg font-medium text-white">
            {route.origin.iata}
            <span className="mx-1.5 opacity-60">→</span>
            {route.destination.iata}
          </p>
        </div>
      </div>

      <div className="p-4">
        <p className="truncate text-caption text-content-muted">
          {route.origin.city} to {route.destination.city}
        </p>

        <p className="mt-2 font-mono text-data-lg font-medium text-sky">
          {formatCents(route.lowestPriceCents)}
        </p>

        <p className="mt-1.5 text-caption text-content-muted">
          <span className={scarce ? 'text-amber' : undefined}>
            {route.seatsAvailable.toLocaleString()} seats
          </span>{' '}
          available today · {route.departuresToday} departure
          {route.departuresToday === 1 ? '' : 's'}
        </p>
      </div>
    </Link>
  );
}
