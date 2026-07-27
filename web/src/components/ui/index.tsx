'use client';

import { forwardRef } from 'react';
import type { LiveStatus } from '@/lib/types';

/** Tiny classnames joiner. A dependency for this would be silly. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sky text-white hover:bg-[#35699c] disabled:hover:bg-sky',
  secondary:
    'border border-line bg-surface-raised text-content hover:border-sky hover:text-sky',
  ghost: 'text-content-muted hover:text-content hover:bg-surface-sunken',
  danger: 'bg-error text-white hover:bg-[#9e4034]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-caption',
  md: 'px-4 py-2.5 text-caption',
  lg: 'px-6 py-3.5 text-h3',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button that can be clicked again submits twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'tactile inline-flex items-center justify-center gap-2 rounded font-semibold',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-3.5 w-3.5 animate-spin', className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'alert' | 'success' | 'sky' | 'error';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-content-muted border-line',
  alert: 'bg-amber text-white border-transparent',
  success: 'bg-success text-white border-transparent',
  sky: 'bg-sky text-white border-transparent',
  error: 'bg-error text-white border-transparent',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-xs border px-2 py-0.5 text-[0.75rem] font-medium leading-5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * "Seats left" badge. Turns amber under five — the threshold the brief calls
 * for, and the point where scarcity is genuinely worth flagging rather than
 * manufacturing urgency.
 */
export function SeatsLeftBadge({ count }: { count: number }) {
  const scarce = count < 5;
  return (
    <Badge tone={scarce ? 'alert' : 'neutral'}>
      {count === 0 ? 'Sold out' : `${count} seat${count === 1 ? '' : 's'} left`}
    </Badge>
  );
}

// ── Status pill ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<LiveStatus, string> = {
  PENDING: 'Awaiting payment',
  SCHEDULED: 'Scheduled',
  DELAYED: 'Delayed',
  IN_AIR: 'In air',
  LANDED: 'Landed',
  CANCELLED: 'Cancelled',
};

export function StatusPill({ status }: { status: LiveStatus }) {
  const tone: BadgeTone =
    status === 'IN_AIR'
      ? 'success'
      : status === 'DELAYED'
        ? 'alert'
        : status === 'CANCELLED'
          ? 'error'
          : 'neutral';

  return (
    <Badge tone={tone} className="gap-1.5">
      {status === 'IN_AIR' && (
        // The one place a pulse is warranted: it means "this is live".
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      )}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Form field ──────────────────────────────────────────────────────────────

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-caption font-medium text-content-muted">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-caption text-content-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          'w-full rounded border border-line bg-surface-raised px-3 py-2.5 text-body text-content',
          'placeholder:text-content-muted',
          'transition-colors duration-fast ease-out focus:border-sky',
          'aria-[invalid=true]:border-error',
          className,
        )}
        {...rest}
      />
    );
  },
);

// ── Alert ───────────────────────────────────────────────────────────────────

export function Alert({
  tone = 'error',
  title,
  children,
}: {
  tone?: 'error' | 'alert' | 'info';
  title?: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'error'
      ? 'border-error/40 bg-error/5 text-error'
      : tone === 'alert'
        ? 'border-amber/40 bg-amber/5 text-amber'
        : 'border-sky/40 bg-sky/5 text-sky';

  return (
    <div role="alert" className={cx('rounded border px-4 py-3', styles)}>
      {title && <p className="text-caption font-semibold">{title}</p>}
      <div className="text-caption leading-relaxed">{children}</div>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx('animate-pulse rounded bg-surface-sunken', className)}
      aria-hidden
    />
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded border border-dashed border-line px-6 py-16 text-center">
      {/* Display serif here, per the brief: empty states are a display moment. */}
      <h2 className="font-display text-h1 text-content">{title}</h2>
      {children && (
        <p className="max-w-sm text-body text-content-muted">{children}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
