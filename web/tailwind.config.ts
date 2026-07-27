import type { Config } from 'tailwindcss';

/**
 * Design tokens are declared once as CSS custom properties in globals.css and
 * merely *referenced* here. That keeps a single source of truth: runtime theme
 * switching (light transaction screens -> dark map screens) changes the CSS vars,
 * and every Tailwind utility follows automatically.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        pearl: 'var(--pearl)',
        'pearl-soft': 'var(--pearl-soft)',
        slate: 'var(--slate)',
        sky: 'var(--sky)',
        'sky-glow': 'var(--sky-glow)',
        amber: 'var(--amber)',
        success: 'var(--success)',
        error: 'var(--error)',

        // Theme-aware semantic aliases — flip with [data-theme="dark"].
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'surface-sunken': 'var(--surface-sunken)',
        content: 'var(--content)',
        'content-soft': 'var(--content-soft)',
        'content-muted': 'var(--content-muted)',
        line: 'var(--line)',
      },
      fontFamily: {
        display: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['clamp(2.25rem, 6vw, 4rem)', { lineHeight: '1.1', fontWeight: '400' }],
        h1: ['clamp(1.75rem, 4vw, 2.5rem)', { lineHeight: '1.2', fontWeight: '400' }],
        h2: ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['1.125rem', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        caption: ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],
        'data-lg': ['1.25rem', { lineHeight: '1.2', fontWeight: '500' }],
        data: ['0.9375rem', { lineHeight: '1.2', fontWeight: '500' }],
        'data-sm': ['0.8125rem', { lineHeight: '1.2', fontWeight: '500' }],
      },
      borderRadius: {
        // Deliberately tight. "Functional Elegance" reads as precision, not softness.
        none: '0',
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        nav: '0 4px 30px rgba(11, 12, 16, 0.03)',
        card: '0 1px 2px rgba(11, 12, 16, 0.04), 0 8px 24px -12px rgba(11, 12, 16, 0.10)',
        lift: '0 2px 4px rgba(11, 12, 16, 0.05), 0 16px 40px -16px rgba(11, 12, 16, 0.18)',
        float: '0 8px 60px -12px rgba(11, 12, 16, 0.28)',
        glow: '0 0 0 6px var(--sky-glow)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        inout: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '300ms',
        slow: '600ms',
      },
      maxWidth: {
        shell: '1240px',
      },
    },
  },
  plugins: [],
};

export default config;
