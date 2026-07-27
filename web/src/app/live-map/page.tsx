'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { motion } from 'framer-motion';

import { ThemeScope } from '@/lib/theme-context';
import { transition } from '@/lib/motion';

const LiveMap = dynamic(() => import('@/components/map/LiveMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-ink" />,
});

/**
 * The live map, unfiltered and interactive — the same component the home hero
 * and the confirmation page use, just given the whole viewport and no bounding
 * box. This is also the page that demonstrates the performance claim: every
 * airborne aircraft OpenSky reports, rendered at once.
 */
export default function LiveMapPage() {
  const [count, setCount] = useState(0);

  return (
    <>
      <ThemeScope theme="dark" />

      <div className="relative h-[calc(100dvh-4rem)] bg-ink">
        <LiveMap
          mode="ambient"
          className="absolute inset-0"
          interactive
          initialZoom={2}
          initialCenter={[10, 30]}
          onTrafficCount={setCount}
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition.base}
          className="pointer-events-none absolute left-5 top-5 max-w-sm rounded-md border border-white/10 bg-ink/85 p-5 backdrop-blur-[10px] sm:left-8 sm:top-8"
        >
          <p className="flex items-center gap-2 font-mono text-caption uppercase tracking-[0.16em] text-pearl/50">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky" />
            </span>
            Live traffic
          </p>

          <p className="mt-3 font-mono text-display leading-none text-pearl">
            {count.toLocaleString()}
          </p>
          <p className="mt-2 text-caption text-pearl/60">aircraft airborne worldwide</p>

          <p className="mt-4 border-t border-white/10 pt-4 text-caption leading-relaxed text-pearl/50">
            Real ADS-B positions from the OpenSky Network, polled server-side every 15 seconds and
            interpolated on your machine in between. Rendered as a single WebGL layer, not{' '}
            {count.toLocaleString()} DOM nodes.
          </p>
        </motion.div>
      </div>
    </>
  );
}
