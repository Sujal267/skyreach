'use client';

/**
 * The safety net.
 *
 * A reviewer should never have to wonder whether a real card is about to be
 * charged. Fixed to the bottom of the viewport, solid amber, unmissable, and
 * present for the whole of checkout — not a dismissible toast.
 */
export default function TestModeBanner() {
  return (
    <div
      role="note"
      className="fixed inset-x-0 bottom-0 z-50 bg-amber px-5 py-2.5 text-center sm:px-8"
    >
      <p className="text-caption font-semibold text-white">
        DEMO MODE — payment is simulated. Use card{' '}
        <span className="font-mono">4242 4242 4242 4242</span>, any future date, any CVC. No card
        details are transmitted and no charge occurs.
      </p>
    </div>
  );
}
