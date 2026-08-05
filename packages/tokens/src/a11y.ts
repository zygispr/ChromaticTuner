/** Accessibility floors that every interactive element must clear (FR-020). */
export const a11y = {
  /** Minimum touch target, in density-independent units. */
  minTouchTarget: 44,
  /** WCAG 2.1 AA contrast minimums, asserted in tests/contrast.test.ts. */
  contrastTextAA: 4.5,
  contrastGraphicAA: 3,
  /**
   * How far supporting text may be faded from `text` before it stops clearing
   * AA on the surfaces the app actually puts it on.
   *
   * A token rather than a number at the call site because the ceiling is not
   * obvious: 0.6 looks like a safe "muted" value and is one on `background`
   * (4.6:1), but on the `selected` tint the same fade measures 4.35:1 — under
   * the floor. The tint moved a surface that some text was already sitting
   * close to the limit on, and only a composited measurement caught it.
   */
  mutedOpacity: 0.65,
} as const;

export type A11yToken = keyof typeof a11y;
