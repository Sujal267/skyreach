'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import type { Cabin } from '@/lib/types';
import { formatCentsCompact, formatMinutes } from '@/lib/format';
import { transition } from '@/lib/motion';
import { cx } from '@/components/ui';

export interface Filters {
  maxPriceCents: number;
  /** Minutes past midnight at the origin airport. */
  departFrom: number;
  departTo: number;
  cabins: Cabin[];
  nonStopOnly: boolean;
  hideDelayed: boolean;
}

export interface FilterBounds {
  minPriceCents: number;
  maxPriceCents: number;
}

const CABIN_LABELS: { value: Cabin; label: string }[] = [
  { value: 'BUSINESS', label: 'Business' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'ECONOMY', label: 'Economy' },
];

export default function FilterRail({
  filters,
  bounds,
  onChange,
  onReset,
  resultCount,
}: {
  filters: Filters;
  bounds: FilterBounds;
  onChange: (next: Filters) => void;
  onReset: () => void;
  resultCount: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <aside
      className={cx(
        'shrink-0 border-line transition-[width] duration-base ease-out lg:border-r',
        collapsed ? 'lg:w-16' : 'lg:w-72',
      )}
      aria-label="Filter results"
    >
      <div className="flex items-center justify-between gap-2 pb-4 lg:pr-6">
        {!collapsed && <h2 className="text-h3 text-content">Filters</h2>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
          className="tactile hidden h-8 w-8 place-items-center rounded border border-line text-content-muted hover:border-sky hover:text-sky lg:grid"
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={transition.fast}>
            «
          </motion.span>
        </button>
      </div>

      {collapsed ? null : (
        <div className="space-y-1 lg:pr-6">
          {/* ── Price ─────────────────────────────────────────────────────── */}
          <Accordion title="Price range" defaultOpen>
            <RangeSlider
              label="Maximum price"
              min={bounds.minPriceCents}
              max={bounds.maxPriceCents}
              step={1000}
              value={filters.maxPriceCents}
              onChange={(v) => set({ maxPriceCents: v })}
              format={formatCentsCompact}
            />
          </Accordion>

          {/* ── Departure window ──────────────────────────────────────────── */}
          <Accordion title="Departure time" defaultOpen>
            <div className="space-y-4">
              <RangeSlider
                label="Earliest departure"
                min={0}
                max={1439}
                step={30}
                value={filters.departFrom}
                onChange={(v) => set({ departFrom: Math.min(v, filters.departTo - 30) })}
                format={clockLabel}
              />
              <RangeSlider
                label="Latest departure"
                min={0}
                max={1439}
                step={30}
                value={filters.departTo}
                onChange={(v) => set({ departTo: Math.max(v, filters.departFrom + 30) })}
                format={clockLabel}
              />
              <p className="font-mono text-caption text-content-muted">
                {clockLabel(filters.departFrom)} — {clockLabel(filters.departTo)}
              </p>
            </div>
          </Accordion>

          {/* ── Cabin ─────────────────────────────────────────────────────── */}
          <Accordion title="Cabin class" defaultOpen>
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Cabin class</legend>
              {CABIN_LABELS.map((cabin) => (
                <Checkbox
                  key={cabin.value}
                  label={cabin.label}
                  checked={filters.cabins.includes(cabin.value)}
                  onChange={(checked) =>
                    set({
                      cabins: checked
                        ? [...filters.cabins, cabin.value]
                        : filters.cabins.filter((c) => c !== cabin.value),
                    })
                  }
                />
              ))}
            </fieldset>
          </Accordion>

          {/* ── Flight ────────────────────────────────────────────────────── */}
          <Accordion title="Flight">
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Flight options</legend>
              <Checkbox
                label="Non-stop only"
                checked={filters.nonStopOnly}
                onChange={(v) => set({ nonStopOnly: v })}
              />
              <Checkbox
                label="Hide delayed flights"
                checked={filters.hideDelayed}
                onChange={(v) => set({ hideDelayed: v })}
              />
            </fieldset>
          </Accordion>

          <div className="flex items-center justify-between gap-3 pt-5">
            <p className="text-caption text-content-muted" aria-live="polite">
              {resultCount} result{resultCount === 1 ? '' : 's'}
            </p>
            <button
              type="button"
              onClick={onReset}
              className="tactile text-caption text-content-muted underline underline-offset-2 hover:text-sky"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Accordion ───────────────────────────────────────────────────────────────

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="border-b border-line py-3.5">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="tactile flex w-full items-center justify-between gap-2 text-left text-caption font-semibold uppercase tracking-wider text-content"
        >
          {title}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={transition.fast}
            className="text-content-muted"
            aria-hidden
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 4.5L6 8l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition.base}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Range slider ────────────────────────────────────────────────────────────

/**
 * A styled native `input[type=range]`. Custom-built sliders are a well-known
 * source of broken keyboard and screen-reader support; the native control
 * already does arrow keys, Home/End and value announcement correctly, so the
 * work here is purely visual.
 */
function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const id = useId();
  const percent = max === min ? 100 : ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-caption text-content-muted">
          {label}
        </label>
        <output htmlFor={id} className="font-mono text-caption font-medium text-content">
          {format(value)}
        </output>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sr-range mt-2 w-full"
        style={{ '--fill': `${percent}%` } as React.CSSProperties}
      />

      <style jsx>{`
        .sr-range {
          -webkit-appearance: none;
          appearance: none;
          height: 20px;
          background: transparent;
          cursor: pointer;
        }
        .sr-range::-webkit-slider-runnable-track {
          height: 3px;
          border-radius: 2px;
          background: linear-gradient(
            to right,
            var(--sky) 0%,
            var(--sky) var(--fill),
            var(--slate) var(--fill),
            var(--slate) 100%
          );
        }
        .sr-range::-moz-range-track {
          height: 3px;
          border-radius: 2px;
          background: var(--slate);
        }
        .sr-range::-moz-range-progress {
          height: 3px;
          border-radius: 2px;
          background: var(--sky);
        }
        .sr-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          margin-top: -5.5px;
          border-radius: 50%;
          background: var(--sky);
          border: 2px solid var(--surface-raised);
          box-shadow: 0 1px 3px rgba(11, 12, 16, 0.25);
        }
        .sr-range::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--sky);
          border: 2px solid var(--surface-raised);
          box-shadow: 0 1px 3px rgba(11, 12, 16, 0.25);
        }
      `}</style>
    </div>
  );
}

// ── Checkbox ────────────────────────────────────────────────────────────────

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-sky"
      />
      <label htmlFor={id} className="cursor-pointer text-caption text-content-soft">
        {label}
      </label>
    </div>
  );
}
