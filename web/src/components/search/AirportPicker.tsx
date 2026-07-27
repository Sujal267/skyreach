'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import type { Airport } from '@/lib/types';
import { useClickOutside } from '@/lib/hooks';
import { transition } from '@/lib/motion';
import { cx } from '@/components/ui';

/**
 * Airport autocomplete.
 *
 * The full airport list is small enough to filter client-side, so there is no
 * request per keystroke and no loading state to design around — the list is
 * fetched once by the parent and matching is instant.
 *
 * Implemented as a WAI-ARIA combobox: the input keeps focus throughout and the
 * listbox is driven by aria-activedescendant, so arrow keys move the highlight
 * without moving focus. That is what lets a screen reader announce each option
 * as you arrow through it.
 */

export interface AirportPickerProps {
  label: string;
  airports: Airport[];
  value: Airport | null;
  onChange: (airport: Airport | null) => void;
  placeholder?: string;
  /** Hidden from the list — you cannot fly somewhere from itself. */
  exclude?: Airport | null;
  className?: string;
}

function matches(airport: Airport, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    airport.iata.toLowerCase().startsWith(q) ||
    airport.city.toLowerCase().includes(q) ||
    airport.name.toLowerCase().includes(q) ||
    airport.country.toLowerCase().includes(q)
  );
}

export default function AirportPicker({
  label,
  airports,
  value,
  onChange,
  placeholder = 'City or airport',
  exclude,
  className,
}: AirportPickerProps) {
  const id = useId();
  const listboxId = `${id}-listbox`;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(wrapperRef, () => setOpen(false), open);

  const options = useMemo(
    () => airports.filter((a) => a.id !== exclude?.id && matches(a, query)).slice(0, 7),
    [airports, exclude, query],
  );

  // Keep the highlight inside the list as it shrinks under typing.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const display = value ? `${value.iata} — ${value.city}` : '';

  const commit = (airport: Airport) => {
    onChange(airport);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) => {
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
        return (next + options.length) % Math.max(1, options.length);
      });
      return;
    }

    if (e.key === 'Enter' && open && options[highlight]) {
      e.preventDefault();
      commit(options[highlight]);
      return;
    }

    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={cx('relative', className)}>
      <label htmlFor={id} className="block text-caption text-content-muted">
        {label}
      </label>

      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[highlight] ? `${id}-opt-${highlight}` : undefined}
        autoComplete="off"
        value={open ? query : display}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="mt-1 w-full bg-transparent text-h3 text-content outline-none placeholder:font-normal placeholder:text-content-muted"
      />

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transition.fast}
            className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded border border-line bg-surface-raised py-1 shadow-lift scroll-slim"
          >
            {options.length === 0 && (
              <li className="px-3 py-3 text-caption text-content-muted">
                No airports match “{query}”
              </li>
            )}

            {options.map((airport, i) => (
              <li
                key={airport.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                // mousedown, not click: the input's blur would close the list
                // before a click event ever landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(airport);
                }}
                className={cx(
                  'flex cursor-pointer items-center gap-3 px-3 py-2.5',
                  i === highlight && 'bg-surface-sunken',
                )}
              >
                <span className="w-10 shrink-0 font-mono text-data font-medium text-sky">
                  {airport.iata}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-medium text-content">
                    {airport.city}
                  </span>
                  <span className="block truncate text-caption text-content-muted">
                    {airport.name} · {airport.country}
                  </span>
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
