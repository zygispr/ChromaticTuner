/** A colour with a variant for each appearance (FR-019). */
export interface ThemedColor {
  readonly light: string;
  readonly dark: string;
}

/**
 * The state palette.
 *
 * Colour is the product's primary at-a-glance signal (FR-014), so these are
 * chosen against three constraints, all verified by test in
 * `tests/contrast.test.ts` rather than by eye:
 *
 * 1. WCAG 2.1 AA against the background in BOTH themes — 4.5:1 for text,
 *    3:1 for meaningful graphics.
 * 2. Separable by luminance, not only by hue, so the states survive greyscale
 *    and colour-vision deficiency (SC-009).
 * 3. Blue for flat and amber for sharp rather than the conventional red/green
 *    pair, which is the single worst choice for deuteranopia and protanopia.
 *    Cool reads as low, warm reads as high, which also matches the mental model
 *    of the horizontal line.
 */
export const color = {
  /** Flat — the player must tighten. Lightest of the three in both themes. */
  flat: { light: '#0B6FD4', dark: '#4C93F0' },
  /** Sharp — the player must loosen. */
  sharp: { light: '#8A3D06', dark: '#FFC978' },
  /** In tune. Green is conventional here and worth keeping. */
  inTune: { light: '#084521', dark: '#34C46A' },
  /** Listening, with no usable signal. Deliberately quiet. */
  noReading: { light: '#565B66', dark: '#9BA2B0' },

  background: { light: '#FCFCFD', dark: '#0B0B0F' },
  text: { light: '#16181D', dark: '#F2F4F8' },
  /** The horizontal line itself and its tick marks. */
  line: { light: '#7A818F', dark: '#6B7280' },
} as const satisfies Record<string, ThemedColor>;

export type ColorToken = keyof typeof color;
