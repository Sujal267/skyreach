'use client';

import { useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';

import type { Cabin, Seat, SeatMapDefinition } from '@/lib/types';
import { formatCents } from '@/lib/format';
import { cx } from '@/components/ui';

/**
 * ── The seat map ────────────────────────────────────────────────────────────
 *
 * Drawn as a top-down fuselage with the nose at the left, which is how every
 * airline seat selector a traveller has ever used is oriented. Row numbers run
 * left to right; seat letters stack vertically with a gap where the aisle is.
 *
 * Accessibility is the hard part and is done properly here rather than bolted
 * on: the whole thing is a `role="grid"`, one `row` per seat letter, one
 * `gridcell` per seat. Arrow keys move between seats in two dimensions using
 * roving tabindex, so the grid is a single tab stop rather than 180 of them —
 * tabbing through an A320 one seat at a time would be unusable.
 *
 * Every seat's accessible name states its number, cabin, price and whether it
 * can be taken, because a screen-reader user cannot see the colour legend.
 */

export interface SeatMapProps {
  definition: SeatMapDefinition;
  seats: Seat[];
  selectedSeatId: string | null;
  /** Seat ids currently mid-request, for the optimistic pending state. */
  pendingSeatId: string | null;
  /** Seat ids whose hold was rejected — triggers the shake. */
  shakeSeatId: string | null;
  onSelect: (seat: Seat) => void;
  disabled?: boolean;
}

const CABIN_LEGEND: { cabin: Cabin; label: string; swatch: string }[] = [
  { cabin: 'BUSINESS', label: 'Business', swatch: 'bg-[#1d3a56]' },
  { cabin: 'PREMIUM', label: 'Premium', swatch: 'bg-amber' },
  { cabin: 'ECONOMY', label: 'Economy', swatch: 'bg-[#cfd9e4]' },
];

export default function SeatMap({
  definition,
  seats,
  selectedSeatId,
  pendingSeatId,
  shakeSeatId,
  onSelect,
  disabled,
}: SeatMapProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const seatByNumber = useMemo(
    () => new Map(seats.map((s) => [s.seatNumber, s])),
    [seats],
  );

  /**
   * Flatten the cabin sections into a single visual grid. Different sections
   * have different column layouts (2-2 up front, 3-3 behind), so the grid is
   * sized to the widest and narrower sections are centred within it.
   */
  const { rowNumbers, letterLanes, sectionOfRow } = useMemo(() => {
    const missing = new Set(definition.missingRows ?? []);
    const rows: number[] = [];
    const sectionOf = new Map<number, SeatMapDefinition['cabins'][number]>();

    for (const section of definition.cabins) {
      for (let r = section.rowStart; r <= section.rowEnd; r++) {
        if (missing.has(r)) continue;
        rows.push(r);
        sectionOf.set(r, section);
      }
    }
    rows.sort((a, b) => a - b);

    // Build the vertical lanes from the widest layout, preserving aisle gaps.
    const widest = definition.cabins.reduce((best, s) =>
      s.layout.replace(/\|/g, '').length > best.layout.replace(/\|/g, '').length ? s : best,
    );

    const lanes: ({ letter: string } | { aisle: true })[] = [];
    for (const ch of widest.layout) {
      if (ch === '|') lanes.push({ aisle: true });
      else lanes.push({ letter: ch });
    }

    return { rowNumbers: rows, letterLanes: lanes, sectionOfRow: sectionOf };
  }, [definition]);

  const seatLetters = letterLanes.filter(
    (l): l is { letter: string } => 'letter' in l,
  );

  /**
   * Roving tabindex target. The first selectable seat owns tabindex=0 so the
   * grid is reachable; everything else is -1 and reached with arrow keys.
   */
  const firstFocusable = useMemo(() => {
    for (const row of rowNumbers) {
      for (const lane of seatLetters) {
        const seat = seatByNumber.get(`${row}${lane.letter}`);
        if (seat && seat.status !== 'BOOKED') return seat.seatNumber;
      }
    }
    return null;
  }, [rowNumbers, seatLetters, seatByNumber]);

  const focusSeat = useCallback((seatNumber: string) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-seat="${seatNumber}"]`,
    );
    el?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, row: number, letter: string) => {
      const rowIdx = rowNumbers.indexOf(row);
      const letterIdx = seatLetters.findIndex((l) => l.letter === letter);
      if (rowIdx === -1 || letterIdx === -1) return;

      let nextRow = rowIdx;
      let nextLetter = letterIdx;

      switch (e.key) {
        case 'ArrowRight':
          nextRow = Math.min(rowIdx + 1, rowNumbers.length - 1);
          break;
        case 'ArrowLeft':
          nextRow = Math.max(rowIdx - 1, 0);
          break;
        case 'ArrowDown':
          nextLetter = Math.min(letterIdx + 1, seatLetters.length - 1);
          break;
        case 'ArrowUp':
          nextLetter = Math.max(letterIdx - 1, 0);
          break;
        case 'Home':
          nextRow = 0;
          break;
        case 'End':
          nextRow = rowNumbers.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();

      // Walk on past gaps — some rows have no seat in a given lane.
      const target = `${rowNumbers[nextRow]}${seatLetters[nextLetter].letter}`;
      if (seatByNumber.has(target)) focusSeat(target);
    },
    [rowNumbers, seatLetters, seatByNumber, focusSeat],
  );

  return (
    <div>
      {/* Legend */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        {CABIN_LEGEND.map((item) => (
          <span key={item.cabin} className="flex items-center gap-2 text-caption text-content-muted">
            <span className={cx('h-3 w-3 rounded-xs', item.swatch)} aria-hidden />
            {item.label}
          </span>
        ))}
        <span className="flex items-center gap-2 text-caption text-content-muted">
          <span className="h-3 w-3 rounded-xs bg-sky" aria-hidden />
          Your seat
        </span>
        <span className="flex items-center gap-2 text-caption text-content-muted">
          <span className="h-3 w-3 rounded-xs bg-slate/40" aria-hidden />
          Taken
        </span>
      </div>

      {/* Fuselage */}
      <div className="overflow-x-auto scroll-slim">
        <div className="relative mx-auto min-w-max px-2 py-6">
          {/* Wings, behind the cabin. Pure decoration — it is what makes the
              grid read as an aircraft rather than a spreadsheet. */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[260px] -translate-x-1/2 -translate-y-1/2"
            style={{
              background:
                'linear-gradient(180deg, transparent 0%, rgba(107,107,114,0.10) 45%, rgba(107,107,114,0.10) 55%, transparent 100%)',
              clipPath: 'polygon(35% 0%, 65% 0%, 100% 50%, 65% 100%, 35% 100%, 0% 50%)',
            }}
            aria-hidden
          />

          <div className="flex items-stretch">
            {/* Nose */}
            <div
              className="w-14 shrink-0 rounded-l-full border-y border-l border-line bg-surface-sunken"
              aria-hidden
            />

            {/* Cabin */}
            <div
              ref={gridRef}
              role="grid"
              aria-label={`Seat map for ${definition.model}. Use arrow keys to move between seats.`}
              aria-rowcount={seatLetters.length}
              aria-colcount={rowNumbers.length}
              className="border-y border-line bg-surface-sunken px-3 py-3"
            >
              {/* Row-number ruler */}
              <div className="mb-1.5 flex gap-1" aria-hidden>
                {rowNumbers.map((row) => (
                  <span
                    key={row}
                    className="w-9 text-center font-mono text-[0.625rem] text-content-muted"
                  >
                    {row}
                  </span>
                ))}
              </div>

              {letterLanes.map((lane, laneIdx) =>
                'aisle' in lane ? (
                  // The aisle. Real space, so the two banks read as separate.
                  <div key={`aisle-${laneIdx}`} className="h-5" aria-hidden />
                ) : (
                  <div
                    key={lane.letter}
                    role="row"
                    aria-rowindex={seatLetters.findIndex((l) => l.letter === lane.letter) + 1}
                    className="flex items-center gap-1 py-0.5"
                  >
                    {rowNumbers.map((row, colIdx) => {
                      const seatNumber = `${row}${lane.letter}`;
                      const seat = seatByNumber.get(seatNumber);
                      const section = sectionOfRow.get(row);

                      if (!seat || !section) {
                        // No seat in this lane for this row — narrower cabin
                        // section, or a galley gap.
                        return (
                          <div
                            key={seatNumber}
                            role="gridcell"
                            aria-colindex={colIdx + 1}
                            className="h-9 w-9"
                          />
                        );
                      }

                      return (
                        <div key={seatNumber} role="gridcell" aria-colindex={colIdx + 1}>
                          <SeatButton
                            seat={seat}
                            isExitRow={definition.exitRows.includes(row)}
                            selected={seat.id === selectedSeatId}
                            pending={seat.id === pendingSeatId}
                            shaking={seat.id === shakeSeatId}
                            tabbable={seat.seatNumber === firstFocusable}
                            disabled={disabled}
                            onSelect={() => onSelect(seat)}
                            onKeyDown={(e) => onKeyDown(e, row, lane.letter)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ),
              )}

              {/* Seat-letter ruler */}
              <div className="mt-1.5 flex gap-1" aria-hidden>
                {rowNumbers.map((row) => (
                  <span key={row} className="w-9" />
                ))}
              </div>
            </div>

            {/* Tail */}
            <div
              className="w-16 shrink-0 border-y border-r border-line bg-surface-sunken"
              style={{ clipPath: 'polygon(0 0, 55% 0, 100% 50%, 55% 100%, 0 100%)' }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── One seat ────────────────────────────────────────────────────────────────

function SeatButton({
  seat,
  isExitRow,
  selected,
  pending,
  shaking,
  tabbable,
  disabled,
  onSelect,
  onKeyDown,
}: {
  seat: Seat;
  isExitRow: boolean;
  selected: boolean;
  pending: boolean;
  shaking: boolean;
  tabbable: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const taken = seat.status === 'BOOKED' || (seat.status === 'HELD' && !seat.heldByYou);

  const cabinStyles: Record<Cabin, string> = {
    BUSINESS: 'bg-[#1d3a56] border-[#1d3a56] text-white',
    PREMIUM: 'bg-amber border-amber text-white',
    ECONOMY: 'bg-[#cfd9e4] border-[#b3c2d3] text-ink',
  };

  const label = [
    `Seat ${seat.seatNumber}`,
    seat.cabin.charAt(0) + seat.cabin.slice(1).toLowerCase(),
    isExitRow ? 'exit row, extra legroom' : null,
    formatCents(seat.priceCents),
    taken ? 'unavailable' : selected ? 'selected' : 'available',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <motion.button
      type="button"
      data-seat={seat.seatNumber}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      disabled={taken || disabled || pending}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      aria-pressed={selected}
      // Shake on a rejected hold — brief, physical, and unmistakably "no".
      animate={shaking ? { x: [-5, 5, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      className={cx(
        'tactile relative grid h-9 w-9 place-items-center rounded-sm border text-[0.625rem] font-medium',
        'disabled:cursor-not-allowed',
        selected
          ? 'border-sky bg-sky text-white shadow-glow'
          : taken
            ? 'border-slate/30 bg-slate/25 text-transparent'
            : cabinStyles[seat.cabin],
        shaking && 'border-error',
        isExitRow && !selected && !taken && 'ring-1 ring-inset ring-white/40',
      )}
    >
      {selected ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <motion.path
            d="M3 7.5l2.8 2.8L11 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.25 }}
          />
        </svg>
      ) : taken ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="text-slate">
          <path
            d="M2 2l6 6M8 2l-6 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : pending ? (
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
      ) : null}
    </motion.button>
  );
}
