'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * "Themed context" from the design brief: this product is not light-or-dark by
 * user preference, it is light or dark *by screen purpose*. Transaction and
 * search screens run light (--pearl) to promote focus and trust; map-centric
 * screens run dark (--ink) so live data and route lines can glow.
 *
 * Pages declare their context with <ThemeScope theme="dark" /> and the token
 * layer in globals.css does the rest.
 */

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Keeps the mobile browser chrome in step with the page, so a dark
    // confirmation screen does not sit under a white status bar.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0B0C10' : '#F5F4F1');
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * Drop into any page to declare its theme context. Restores the light default
 * on unmount so navigating away from the confirmation screen does not leave
 * the rest of the app dark.
 */
export function ThemeScope({ theme }: { theme: Theme }) {
  const { setTheme } = useTheme();

  const apply = useCallback(() => setTheme(theme), [setTheme, theme]);

  useEffect(() => {
    apply();
    return () => setTheme('light');
  }, [apply, setTheme]);

  return null;
}
