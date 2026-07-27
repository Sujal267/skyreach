/**
 * Money is integer cents everywhere in this codebase — in the DB, over the
 * wire, and in component state. These helpers are the ONLY place a value
 * becomes a decimal, and they do it at the very last moment, for display.
 */
export function formatCents(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Compact variant for dense UI (badges, filter rail bounds): "$1,000". */
export function formatCentsCompact(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** "07:00" — always the airport's local wall-clock time, never the viewer's. */
export function formatTime(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(d);
}

/** "Mon, 28 Jul" */
export function formatDateShort(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(d);
}

/** "28 July 2026" */
export function formatDateLong(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(d);
}

/** "2026-07-28" in local time — the wire format for date inputs and queries. */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "6h 30m" from two instants. */
export function formatDuration(departAt: string | Date, arriveAt: string | Date): string {
  const a = typeof departAt === 'string' ? new Date(departAt) : departAt;
  const b = typeof arriveAt === 'string' ? new Date(arriveAt) : arriveAt;
  return formatMinutes(Math.round((b.getTime() - a.getTime()) / 60000));
}

export function formatMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Metres -> feet, the unit aviation actually uses for altitude. */
export function metresToFeet(m: number): number {
  return Math.round(m * 3.28084);
}

/** m/s -> knots, the unit aviation actually uses for speed. */
export function mpsToKnots(mps: number): number {
  return Math.round(mps * 1.94384);
}

export function formatHeading(deg: number): string {
  return `${Math.round(((deg % 360) + 360) % 360)}°`;
}

/** Grouped thousands for altitude/speed readouts: "32,000". */
export function formatNumber(n: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? '').trim().charAt(0);
  const b = (lastName ?? '').trim().charAt(0);
  return (a + b).toUpperCase() || '··';
}
