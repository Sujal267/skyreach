import type { Transition, Variants } from 'framer-motion';

/**
 * Motion tokens, mirrored from globals.css so Framer Motion and CSS agree.
 * Global ease: a quick, decisive ease-out. Nothing here floats or bounces —
 * the only slow motion in the product is the live map's aircraft interpolation.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_INOUT = [0.65, 0, 0.35, 1] as const;

export const D_FAST = 0.15;
export const D_BASE = 0.3;
export const D_SLOW = 0.6;

export const transition = {
  fast: { duration: D_FAST, ease: EASE_OUT } satisfies Transition,
  base: { duration: D_BASE, ease: EASE_OUT } satisfies Transition,
  slow: { duration: D_SLOW, ease: EASE_OUT } satisfies Transition,
};

/** Page-level enter/exit used by AnimatePresence. Prevents "page jump". */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

/** Parent of any staggered list or card grid. */
export const staggerParent = (stagger = 0.04, delayChildren = 0): Variants => ({
  initial: {},
  animate: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

/** Child of `staggerParent`. Results list uses y: 12 -> 0 per the spec. */
export const staggerChild: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transition.base },
};

/** The search card's entrance: rises and fades in on load. */
export const riseIn: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: transition.base },
};

/** Sticky summary bars that slide up on first selection. */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, y: 32, transition: transition.fast },
};

export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

/** Seat hold-conflict feedback. */
export const shake = {
  x: [-5, 5, -5, 5, 0],
  transition: { duration: 0.4, ease: EASE_INOUT },
};

/**
 * Reduced-motion variants. Not a no-op — elements still appear, they just
 * cross-fade instead of translating, and staggers collapse to zero.
 */
export const reducedPageVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: D_FAST } },
  exit: { opacity: 0, transition: { duration: D_FAST } },
};

export const reducedChild: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: D_FAST } },
};
