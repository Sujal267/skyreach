'use client';

import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

/**
 * The API runs on a free tier that spins down when idle, so the very first
 * request after a while can take up to ~30s to wake it back up. Nothing is
 * broken during that window — it just looks like a hang without an
 * explanation, so this pings /health on load and only surfaces once the
 * response is actually slow, rather than flashing on every visit.
 */
export default function ColdStartNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let settled = false;

    // A warm server answers in well under a second — only show the notice
    // once we're past the point where that's plausible.
    const showTimer = setTimeout(() => {
      if (!settled) setVisible(true);
    }, 1200);

    const controller = new AbortController();
    fetch(`${API_BASE}/health`, { signal: controller.signal })
      .catch(() => {})
      .finally(() => {
        settled = true;
        clearTimeout(showTimer);
        setVisible(false);
      });

    return () => {
      settled = true;
      clearTimeout(showTimer);
      controller.abort();
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded border border-amber/40 bg-surface-raised px-4 py-3 shadow-lg sm:left-auto sm:right-4 sm:top-20 sm:translate-x-0"
    >
      <div className="flex items-start gap-3">
        <Spinner className="mt-0.5 shrink-0 text-amber" />
        <p className="text-caption leading-relaxed text-content">
          <span className="font-semibold text-amber">Waking up the server…</span>{' '}
          It runs on a free tier, so the first request after a while can take up to 30 seconds.
          Thanks for waiting.
        </p>
      </div>
    </div>
  );
}
