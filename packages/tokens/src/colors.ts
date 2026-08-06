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

  /**
   * The app's base canvas — the tuner screen itself.
   *
   * The dark value was `#0B0B0F` (L* 3.1) until it was reported as "way too
   * dark". That is darker than either platform's own baseline — Material's
   * dark surface is `#121212` (L* 6.5) — and it left nothing below it, which
   * is the reason the settings sheet could not be told apart from the screen
   * behind it: see `surface`.
   */
  background: { light: '#FCFCFD', dark: '#121419' },

  /**
   * A surface that sits ABOVE the background — today, the settings sheet.
   *
   * Identical to `background` in light, and deliberately so: there the sheet is
   * separated by the scrim, which dims the tuner behind it from L* 99 to L* 57
   * — a step of 41. Nothing more is needed.
   *
   * **Dark cannot use that mechanism at all**, and this token exists because it
   * was quietly broken. A scrim darkens, and there is almost nothing below
   * `background` to darken towards: `#0B0B0F` dimmed by the dark scrim became
   * `#040406`, so a sheet painted in `background` stood out from the screen
   * behind it by ΔL* 2.0 — measurably invisible, against 41.5 in light. The
   * `box-shadow` contributed nothing either, being black on near-black.
   *
   * So elevation in dark is carried by LIGHTNESS, as it is on both platforms:
   * a raised surface is lighter, not shadowed. `#1F232B` puts the sheet ΔL*
   * 11.5 above the dimmed tuner. That step and the corner radius are the whole
   * of the edge: the sheet drew a `line` border on top of them for a while, as
   * a second channel, but `line` is sized for the tuning ruler's 3:1 against
   * `background` and at L* 48 it was brighter than both the dimmed tuner and
   * this surface — a rule across the screen rather than an edge. Retuning
   * either of these two values means re-checking that step by eye.
   */
  surface: { light: '#FCFCFD', dark: '#1F232B' },

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
   * The resting fill under a chosen option — the accidental buttons (FR-023).
   *
   * A tinted container rather than a reuse of `text`, which is what this was
   * first built as. `text` is the app's PRIMARY-ACTION fill (`allow-microphone`,
   * `retry-button`), and spending it on a passive preference made a choice
   * between two note-naming conventions the loudest thing in the settings
   * sheet — louder than Done and Reset, which are the actual actions. It is
   * also not what the platforms do: iOS gives a selected segment a
   * low-contrast thumb, Material a `secondaryContainer` tint. Neither inverts.
   *
   * Deliberately a small step from `background` — 1.2:1 light, 1.3:1 dark. That
   * is a weaker colour-free channel than an inversion, so the accidental
   * buttons carry the bold weight and the border alongside it rather than
   * leaning on the surface alone (FR-015).
   *
   * A surface, never a foreground, so the AA text rule does not apply to the
   * token itself — but `text` has to stay legible ON it, which the contrast
   * test asserts in both appearances. That constraint is tighter than it looks:
   * the tint darkens the surface enough that the buttons' example line, set at
   * a fraction of `text`, lands close to the 4.5:1 floor.
   *
   * Measured against `surface`, not `background`, because that is what these
   * options actually sit on — they only ever appear inside the settings sheet.
   * The two were the same colour until the sheet gained its own elevation, at
   * which point the dark tint had to come up with it or it would have been a
   * step DOWN from the surface it tints.
   */
  selected: { light: '#E6E8ED', dark: '#2E333D' },

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
