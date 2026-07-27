'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

import { flights } from '@/lib/api';
import type { Cabin, SearchResponse } from '@/lib/types';
import { formatDateLong } from '@/lib/format';
import { staggerParent, transition } from '@/lib/motion';
import SearchCard from '@/components/search/SearchCard';
import FlightCard from '@/components/search/FlightCard';
import FilterRail, { type FilterBounds, type Filters } from '@/components/search/FilterRail';
import { Alert, EmptyState, Skeleton, cx } from '@/components/ui';

type SortKey = 'price' | 'duration' | 'departure';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'duration', label: 'Duration' },
  { value: 'departure', label: 'Departure' },
];

export default function SearchPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const params = useSearchParams();

  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const date = params.get('date') ?? '';
  const passengers = Number(params.get('passengers') ?? 1);
  const cabinParam = (params.get('cabin') as Cabin | null) ?? undefined;

  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('price');
  const [filters, setFilters] = useState<Filters | null>(null);
  /** Brief cross-fade when filters change, instead of a layout jump. */
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!from || !to || !date) {
      setError('Missing search details. Try searching again.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    flights
      .search({ from, to, date, passengers, cabin: cabinParam })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFilters(defaultFilters(res, cabinParam));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, date, passengers, cabinParam]);

  // ── Bounds ───────────────────────────────────────────────────────────────

  const bounds: FilterBounds = useMemo(() => {
    if (!data || data.results.length === 0) {
      return { minPriceCents: 0, maxPriceCents: 100_000 };
    }
    const prices = data.results.map((f) => f.fromPriceCents);
    // Round outward to a clean step so the slider ends on a tidy number.
    return {
      minPriceCents: Math.floor(Math.min(...prices) / 1000) * 1000,
      maxPriceCents: Math.ceil(Math.max(...prices) / 1000) * 1000,
    };
  }, [data]);

  // ── Filter + sort, entirely client-side ──────────────────────────────────
  // The seeded dataset for one route on one day is small, so re-fetching on
  // every filter tweak would be latency for nothing.

  const visible = useMemo(() => {
    if (!data || !filters) return [];

    const filtered = data.results.filter((f) => {
      if (f.fromPriceCents > filters.maxPriceCents) return false;
      if (filters.hideDelayed && f.delayMinutes > 0) return false;

      const depart = new Date(f.departAt);
      const minutes = depart.getUTCHours() * 60 + depart.getUTCMinutes();
      if (minutes < filters.departFrom || minutes > filters.departTo) return false;

      if (filters.cabins.length > 0) {
        const hasCabin = filters.cabins.some(
          (c) => (f.cabinAvailability[c]?.count ?? 0) >= passengers,
        );
        if (!hasCabin) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'price') return a.fromPriceCents - b.fromPriceCents;
      if (sort === 'duration') return a.durationMinutes - b.durationMinutes;
      return new Date(a.departAt).getTime() - new Date(b.departAt).getTime();
    });
  }, [data, filters, sort, passengers]);

  const applyFilters = (next: Filters) => {
    setFilters(next);
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 150);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="bg-surface">
      {/* Search summary + editable card */}
      <div className="border-b border-line bg-surface-sunken">
        <div className="mx-auto max-w-shell px-5 py-6 sm:px-8">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-h2 text-content">
              {data ? (
                <>
                  {data.origin.city} <span className="text-content-muted">to</span>{' '}
                  {data.destination.city}
                </>
              ) : (
                `${from} to ${to}`
              )}
            </h1>
            {date && (
              <p className="font-mono text-data text-content-muted">
                {formatDateLong(`${date}T12:00:00Z`)} · {passengers} passenger
                {passengers === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <SearchCard
            animate={false}
            initial={{ from, to, date, passengers, cabin: cabinParam }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-shell px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {filters && (
            <FilterRail
              filters={filters}
              bounds={bounds}
              onChange={applyFilters}
              onReset={() => data && setFilters(defaultFilters(data, cabinParam))}
              resultCount={visible.length}
            />
          )}

          <div className="min-w-0 flex-1">
            {/* Sort bar */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-caption text-content-muted" aria-live="polite">
                {loading
                  ? 'Searching…'
                  : `${visible.length} flight${visible.length === 1 ? '' : 's'}`}
              </p>

              <div className="flex items-center gap-1" role="group" aria-label="Sort results by">
                <span className="mr-1 text-caption text-content-muted">Sort</span>
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSort(s.value)}
                    aria-pressed={sort === s.value}
                    className={cx(
                      'tactile rounded px-3 py-1.5 text-caption transition-colors duration-fast ease-out',
                      sort === s.value
                        ? 'bg-sky text-white'
                        : 'text-content-muted hover:bg-surface-sunken hover:text-content',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <Alert title="Could not search">{error}</Alert>}

            {loading && <ResultsSkeleton />}

            {!loading && !error && visible.length === 0 && (
              <EmptyState title="Nothing matches">
                {data && data.results.length > 0
                  ? 'Your filters are hiding every flight on this route. Try widening the price or time range.'
                  : 'No flights on this route for that date. Try a different day — the schedule runs 14 days out.'}
              </EmptyState>
            )}

            {!loading && visible.length > 0 && (
              <AnimatePresence mode="wait">
                <motion.ul
                  // Re-keying on the sort makes each re-order a cross-fade
                  // rather than rows sliding past each other.
                  key={sort}
                  variants={staggerParent()}
                  initial="initial"
                  animate="animate"
                  transition={transition.fast}
                  style={{ opacity: refreshing ? 0.45 : 1 }}
                  className="space-y-3 transition-opacity duration-fast ease-out"
                >
                  {visible.map((flight) => (
                    <FlightCard key={flight.id} flight={flight} passengers={passengers} />
                  ))}
                </motion.ul>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultFilters(data: SearchResponse, cabin?: Cabin): Filters {
  const prices = data.results.map((f) => f.fromPriceCents);
  return {
    maxPriceCents:
      prices.length > 0 ? Math.ceil(Math.max(...prices) / 1000) * 1000 : 100_000,
    departFrom: 0,
    departTo: 1439,
    cabins: cabin ? [cabin] : [],
    nonStopOnly: false,
    hideDelayed: false,
  };
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}
