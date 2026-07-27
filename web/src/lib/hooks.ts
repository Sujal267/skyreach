'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `prefers-reduced-motion`, reactively.
 *
 * Returns false during SSR and the first client render so markup matches on
 * hydration; the real value lands in the effect immediately after. Every
 * animation in this app reads this, not just the CSS ones — the live map's
 * position interpolation in particular has no CSS to disable.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Polls an async function on an interval.
 *
 * Pauses when the tab is hidden — a backgrounded map does not need fresh
 * aircraft positions, and not fetching them is the single easiest saving on
 * the OpenSky credit budget.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  options: { enabled?: boolean; immediate?: boolean } = {},
) {
  const { enabled = true, immediate = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(immediate);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mounted = useRef(true);

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => void run(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up immediately on return, then resume the cadence.
        void run();
        start();
      }
    };

    if (immediate) void run();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, immediate, intervalMs, run]);

  return { data, error, loading, refetch: run };
}

/** Debounced value — used by the airport autocomplete. */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

/** Fires when a click lands outside the ref'd element. Closes popovers. */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: () => void,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      handlerRef.current();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [ref, enabled]);
}

/**
 * Live countdown against a future instant. Drives the seat-hold timer, so a
 * user can see exactly how long their seat is theirs.
 */
export function useCountdown(target: string | null): {
  secondsLeft: number;
  expired: boolean;
  label: string;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);

  if (!target) return { secondsLeft: 0, expired: false, label: '' };

  const secondsLeft = Math.max(0, Math.floor((new Date(target).getTime() - now) / 1000));
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return {
    secondsLeft,
    expired: secondsLeft === 0,
    label: `${mins}:${String(secs).padStart(2, '0')}`,
  };
}

/** True once mounted on the client. Guards portals and map containers. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
