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

  /**
   * Dims the tuner behind the settings sheet.
   *
   * The only token carrying alpha, which is what a scrim is: 8-digit hex works
   * verbatim in both CSS and React Native styles, so the two platforms dim by
   * exactly the same amount rather than each picking a plausible-looking value
   * (Principle IV, FR-018). Never a foreground colour, so the AA contrast rule
   * does not apply to it.
   */
  scrim: { light: '#00000073', dark: '#00000099' },

  /**
   * The hover / pressed wash on any control (FR-058, FR-059).
   *
   * Carries alpha for the same reason the scrim does, and works the same way on
   * both platforms: it **layers over** whatever fill the control already has
   * rather than replacing it. That is what lets one token serve both button
   * shapes — the ghost controls that are transparent over `background`, and the
   * solid ones filled with `text`.
   *
   * A mid grey, deliberately. Its luminance sits strictly between `background`
   * and `text` in both appearances, so it always moves the surface it lands on:
   * a wash darker than both would disappear on a solid button in light theme,
   * and a lighter one would disappear on a ghost button in dark theme. Asserted
   * in `tests/contrast.test.ts` rather than trusted.
   *
   * Never a foreground colour, so the AA text rule does not apply to it — but
   * it must never be the *only* signal either. Every control it lands on
   * already carries a border or a fill at rest (FR-052), because hover does not
   * exist on touch and a control that only becomes visible under a pointer is
   * invisible to half the users.
   */
  pressed: { light: '#7A818F33', dark: '#9BA2B033' },
} as const satisfies Record<string, ThemedColor>;

export type ColorToken = keyof typeof color;
