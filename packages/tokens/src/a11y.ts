/** Accessibility floors that every interactive element must clear (FR-020). */
export const a11y = {
  /** Minimum touch target, in density-independent units. */
  minTouchTarget: 44,
  /** WCAG 2.1 AA contrast minimums, asserted in tests/contrast.test.ts. */
  contrastTextAA: 4.5,
  contrastGraphicAA: 3,
} as const;

export type A11yToken = keyof typeof a11y;
