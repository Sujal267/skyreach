import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support',
  description: 'How SkyReach works, what is real, and what is demo data.',
};

const FAQ = [
  {
    q: 'Are the aircraft on the map real?',
    a: 'Yes. Every position, altitude, heading and speed comes from the OpenSky Network’s ADS-B feed — the same public data that flight-tracking sites use. Nothing on the map is generated or replayed.',
  },
  {
    q: 'Are the flights I can book real?',
    a: 'No, and they could not be. OpenSky reports where aircraft are, not what they cost or which seats are free — it has no concept of a commercial schedule at all. Every flight number, departure time, seat map and fare here is demo data we generated.',
  },
  {
    q: 'So how does “track your booked flight” work?',
    a: 'A few flights departing today are linked to a real aircraft that was airborne when the data was seeded. Booking one of those and opening the confirmation page shows that genuine aircraft moving. Every other booking correctly shows a static route map and says tracking starts at departure — we do not invent a position for an aircraft that has not taken off.',
  },
  {
    q: 'Will my card be charged?',
    a: 'No card is charged and none is transmitted. Checkout runs the full booking state machine — seat hold, pending booking, confirmation, seat marked as sold — but the payment step is simulated in the browser. Card details never leave the page.',
  },
  {
    q: 'Why do seats get held for ten minutes?',
    a: 'Because two people can click the same seat at the same moment. Selecting a seat takes a short exclusive lock on it, so nobody else can start checking out for that seat while you are paying. If you walk away, the hold lapses on its own and the seat returns to inventory.',
  },
  {
    q: 'I picked a seat and it was rejected.',
    a: 'Someone else got there first. The seat map refreshes to show what is actually available. This is the hold system working as intended, not an error.',
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="font-display text-h1 text-content">Support</h1>
        <p className="mt-3 text-body text-content-muted">
          SkyReach is a portfolio demonstration. Half of it is genuinely live and half of it is
          invented, and it is worth being precise about which is which.
        </p>

        <dl className="mt-12 space-y-9">
          {FAQ.map((item) => (
            <div key={item.q} className="border-b border-line pb-9 last:border-0">
              <dt className="text-h3 text-content">{item.q}</dt>
              <dd className="mt-2.5 text-body leading-relaxed text-content-muted">{item.a}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 rounded border border-line bg-surface-sunken p-6">
          <h2 className="text-h3 text-content">Demo account</h2>
          <p className="mt-2 text-caption text-content-muted">
            Sign in with{' '}
            <span className="font-mono text-content">demo@skyreach.app</span> /{' '}
            <span className="font-mono text-content">skyreach123</span> to skip registration.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-caption text-sky underline underline-offset-2"
          >
            Go to sign in →
          </Link>
        </div>
      </div>
    </div>
  );
}
