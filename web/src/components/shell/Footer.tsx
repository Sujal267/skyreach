import Link from 'next/link';

/**
 * The data-honesty note lives here, on every page, rather than buried in a
 * case study. Being straight about which half is real is the point — a viewer
 * who discovers the seat inventory is invented *after* being impressed feels
 * misled; one who is told up front is just impressed by the live half.
 */
export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-shell px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-[1.0625rem] font-bold uppercase tracking-[0.14em] text-content">
              Skyreach
            </p>
            <p className="mt-3 text-caption leading-relaxed text-content-muted">
              Aircraft positions on every map are real, live ADS-B data from the{' '}
              <a
                href="https://opensky-network.org/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-content-soft underline underline-offset-2 hover:text-sky"
              >
                OpenSky Network
              </a>
              . Schedules, seat maps, fares and bookings are invented demo data, and payment is
              simulated — no card is ever charged.
            </p>
          </div>

          <nav aria-label="Footer" className="flex gap-12">
            <div>
              <h2 className="text-caption font-semibold uppercase tracking-wider text-content-muted">
                Product
              </h2>
              <ul className="mt-3 space-y-2">
                {[
                  { href: '/', label: 'Search' },
                  { href: '/live-map', label: 'Live Map' },
                  { href: '/dashboard', label: 'My Trips' },
                ].map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-caption text-content-soft hover:text-sky"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-caption font-semibold uppercase tracking-wider text-content-muted">
                Help
              </h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/support" className="text-caption text-content-soft hover:text-sky">
                    Support
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className="mt-10 border-t border-line pt-6 font-mono text-[0.75rem] text-content-muted">
          SKYREACH · PORTFOLIO DEMONSTRATION · NOT A REAL AIRLINE
        </p>
      </div>
    </footer>
  );
}
