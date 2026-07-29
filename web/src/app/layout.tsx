import type { Metadata, Viewport } from 'next';
import { Instrument_Serif } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import Navbar from '@/components/shell/Navbar';
import Footer from '@/components/shell/Footer';
import ColdStartNotice from '@/components/shell/ColdStartNotice';

/**
 * Type system, per the brief: Instrument Serif for display moments, Geist Sans
 * for everything functional, Geist Mono for anything that benefits from
 * tabular alignment — times, prices, seat codes, booking references.
 */
const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-serif',
});

export const metadata: Metadata = {
  title: {
    default: 'SkyReach — Search, book and track flights',
    template: '%s · SkyReach',
  },
  description:
    'Book a flight, then watch its real-world counterpart move across a live map. Aircraft positions are genuine ADS-B data from the OpenSky Network.',
  openGraph: {
    title: 'SkyReach',
    description: 'The flight site where the map is not decoration.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F5F4F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
      // Theme is applied to this element on mount; without this React warns
      // about the attribute changing between server and client.
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <ThemeProvider>
          <AuthProvider>
            {/* Skip link — first tab stop, visible only when focused. */}
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-sky focus:px-4 focus:py-2 focus:text-caption focus:font-semibold focus:text-white"
            >
              Skip to content
            </a>

            <ColdStartNotice />
            <Navbar />
            <main id="main" className="min-h-dvh">
              {children}
            </main>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
