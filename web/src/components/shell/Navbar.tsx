'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuth } from '@/lib/auth-context';
import { initialsOf } from '@/lib/format';
import { transition } from '@/lib/motion';

const LINKS = [
  { href: '/live-map', label: 'Live Map' },
  { href: '/', label: 'Search' },
  { href: '/support', label: 'Support' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/search') : pathname.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 border-b border-line shadow-nav backdrop-blur-[10px]"
      style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 90%, transparent)' }}
    >
      <nav
        className="mx-auto flex h-16 max-w-shell items-center justify-between gap-6 px-5 sm:px-8"
        aria-label="Main"
      >
        {/* Left — wordmark */}
        <Link
          href="/"
          className="tactile shrink-0 text-[1.0625rem] font-bold uppercase tracking-[0.14em] text-content"
        >
          Skyreach
        </Link>

        {/* Centre — primary links */}
        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                data-active={isActive(link.href)}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className="nav-link text-[0.9375rem] text-content-soft transition-colors duration-fast ease-out hover:text-content data-[active=true]:text-content"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right — trips + account */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="tactile hidden rounded border border-line px-4 py-2 text-caption font-medium text-content hover:border-sky hover:text-sky sm:block"
          >
            My Trips
          </Link>

          {loading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-sunken" aria-hidden />
          ) : user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
                className="tactile grid h-9 w-9 place-items-center rounded-full bg-sky text-caption font-semibold text-white"
              >
                {initialsOf(user.firstName, user.lastName)}
              </button>

              <AnimatePresence>
                {accountOpen && (
                  <>
                    {/* Click-away catcher, kept out of the tab order. */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setAccountOpen(false)}
                      aria-hidden
                    />
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={transition.fast}
                      className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-line bg-surface-raised p-1.5 shadow-lift"
                    >
                      <div className="border-b border-line px-3 py-2.5">
                        <p className="truncate text-caption font-medium text-content">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="truncate text-caption text-content-muted">{user.email}</p>
                      </div>

                      <Link
                        href="/dashboard"
                        role="menuitem"
                        onClick={() => setAccountOpen(false)}
                        className="block rounded px-3 py-2 text-caption text-content-soft hover:bg-surface-sunken"
                      >
                        My Trips
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountOpen(false);
                          void logout();
                        }}
                        className="block w-full rounded px-3 py-2 text-left text-caption text-content-soft hover:bg-surface-sunken"
                      >
                        Sign out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              href="/login"
              className="tactile rounded bg-sky px-4 py-2 text-caption font-semibold text-white hover:bg-[#35699c]"
            >
              Sign in
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="tactile grid h-9 w-9 place-items-center rounded border border-line md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
              <path
                d={menuOpen ? 'M3 3l10 10M13 3L3 13' : 'M2 4h12M2 8h12M2 12h12'}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition.fast}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <ul className="mx-auto max-w-shell px-5 py-3 sm:px-8">
              {[...LINKS, { href: '/dashboard', label: 'My Trips' }].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block py-2.5 text-body text-content-soft"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
