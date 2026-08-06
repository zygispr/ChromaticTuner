import { describe, expect, it } from 'vitest';

import { a11y, color, motion, space, type } from '../src/index';
import type { ThemedColor } from '../src/colors';

type Theme = 'light' | 'dark';
const THEMES: Theme[] = ['light', 'dark'];

/** WCAG 2.1 relative luminance for an sRGB hex colour. */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  expect(value).toMatch(/^[0-9a-fA-F]{6}$/);

  const channel = (offset: number): number => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG 2.1 contrast ratio, 1:1 to 21:1. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * What the eye actually receives from a colour drawn at less than full opacity:
 * the colour blended over whatever sits beneath it. A ratio measured against the
 * unblended token is a ratio of something nobody sees.
 */
function compositeOver(hex: string, alpha: number, backdrop: string): string {
  const channels = (value: string) =>
    [0, 2, 4].map((offset) => parseInt(value.replace('#', '').slice(offset, offset + 2), 16));

  const front = channels(hex);
  const back = channels(backdrop);
  return `#${front
    .map((c, i) =>
      Math.round(c! * alpha + back[i]! * (1 - alpha))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

describe('contrast helper', () => {
  it('composites a colour over a backdrop by its alpha', () => {
    // The degenerate ends first, since a compositor that ignored alpha would
    // still pass a mid-range case that happened to land near the token.
    expect(compositeOver('#000000', 1, '#FFFFFF')).toBe('#000000');
    expect(compositeOver('#000000', 0, '#FFFFFF')).toBe('#ffffff');
    expect(compositeOver('#000000', 0.5, '#FFFFFF')).toBe('#808080');
  });

  it('computes the known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // Order must not matter.
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#000000'),
      10
    );
  });
});

describe('WCAG 2.1 AA contrast (token guarantee T2)', () => {
  // Verified by test rather than by eye — Constitution Principle IV. Colour is
  // the product's primary at-a-glance signal, so this is load-bearing.
  const textColors: Array<[string, ThemedColor]> = [
    ['text', color.text],
    ['flat', color.flat],
    ['sharp', color.sharp],
    ['inTune', color.inTune],
    ['noReading', color.noReading],
  ];

  for (const theme of THEMES) {
    describe(`${theme} theme`, () => {
      for (const [name, themed] of textColors) {
        it(`${name} meets 4.5:1 against the background`, () => {
          const ratio = contrastRatio(themed[theme], color.background[theme]);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }

      it('line meets 3:1 against the background (meaningful graphic)', () => {
        const ratio = contrastRatio(color.line[theme], color.background[theme]);
        expect(ratio).toBeGreaterThanOrEqual(3);
      });

      // The same graphic floor on the raised surface, because every unchosen
      // option's border and the reset button's are `line` drawn ON the settings
      // sheet — the only place `line` meets `surface` rather than `background`.
      it('line meets 3:1 against the raised surface too', () => {
        const ratio = contrastRatio(color.line[theme], color.surface[theme]);
        expect(ratio).toBeGreaterThanOrEqual(3);
      });

      for (const [name, themed] of textColors) {
        it(`${name} meets 4.5:1 against the raised surface`, () => {
          const ratio = contrastRatio(themed[theme], color.surface[theme]);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }

      // `selected` is a surface, so the 4.5:1 rule applies to what sits ON it
      // rather than to the token itself. The label of a chosen option stays
      // `text` — the whole point of a tinted container over an inverted one —
      // so this is the ratio that keeps the choice readable.
      it('text meets 4.5:1 against the selected fill', () => {
        const ratio = contrastRatio(color.text[theme], color.selected[theme]);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      // `mutedOpacity` is the one token that is a MULTIPLIER rather than a
      // colour, so the palette checks above cannot see it: they measure `text`
      // at full strength, which is not what lands on the page anywhere the
      // token is used. That gap is exactly how `001` shipped the FLAT/SHARP
      // labels at 0.55 (3.9:1) — Axe caught those only because they are text,
      // and a dimmed graphic beside them would have gone through untouched.
      //
      // This is the platform-free version of that check. It has to live here
      // rather than in either app: web verifies its composites through Axe and
      // jest has no compositor at all, so mobile had nothing.
      for (const surface of ['background', 'surface', 'selected'] as const) {
        it(`muted text meets 4.5:1 over ${surface}`, () => {
          const composited = compositeOver(
            color.text[theme],
            a11y.mutedOpacity,
            color[surface][theme]
          );
          expect(contrastRatio(composited, color[surface][theme])).toBeGreaterThanOrEqual(
            a11y.contrastTextAA
          );
        });
      }
    });
  }
});

describe('state colours are distinguishable from each other', () => {
  // FR-014 requires visually distinct flat / sharp / in-tune states. Distinct
  // hue is not enough on its own — the states must also separate by luminance
  // so they survive greyscale and colour-vision deficiency (SC-009).
  for (const theme of THEMES) {
    it(`${theme}: flat, sharp and in-tune have separable luminance`, () => {
      const luminances = [color.flat, color.sharp, color.inTune].map((c) =>
        relativeLuminance(c[theme])
      );

      for (let i = 0; i < luminances.length; i += 1) {
        for (let j = i + 1; j < luminances.length; j += 1) {
          const a = luminances[i]!;
          const b = luminances[j]!;
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          expect(ratio).toBeGreaterThanOrEqual(1.2);
        }
      }
    });
  }
});

describe('token shape', () => {
  it('defines every state colour in both themes', () => {
    // Six digits, or eight where a token carries alpha — the scrim behind the
    // settings sheet is the only one that does, and 8-digit hex is the one
    // notation both CSS and React Native accept unchanged.
    for (const themed of Object.values(color)) {
      for (const theme of THEMES) {
        expect(themed[theme]).toMatch(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
      }
    }
  });

  it('keeps the scrim translucent, since an opaque one would hide the tuner', () => {
    for (const theme of THEMES) {
      const alpha = color.scrim[theme].slice(7);
      expect(alpha).toHaveLength(2);
      expect(parseInt(alpha, 16)).toBeGreaterThan(0);
      expect(parseInt(alpha, 16)).toBeLessThan(255);
    }
  });

  it('keeps the press wash translucent, since it layers over an existing fill', () => {
    for (const theme of THEMES) {
      const alpha = color.pressed[theme].slice(7);
      expect(alpha).toHaveLength(2);
      expect(parseInt(alpha, 16)).toBeGreaterThan(0);
      expect(parseInt(alpha, 16)).toBeLessThan(255);
    }
  });

  /**
   * The property that lets ONE wash serve both button shapes.
   *
   * The apps have two: ghost controls (transparent over `background`) and solid
   * ones (filled with `text`). A wash darker than both would vanish on the
   * solid button in light theme; a wash lighter than both would vanish on the
   * ghost button in dark theme. Sitting strictly between them means it always
   * moves the surface it lands on — away from `background` on a ghost control,
   * away from `text` on a solid one — in either appearance.
   *
   * Asserted rather than eyeballed, because "it looked fine on my monitor in
   * light mode" is exactly how the 3.9:1 badge shipped in `001`.
   */
  it('sits between background and text in luminance, so it reads on both button shapes', () => {
    for (const theme of THEMES) {
      const wash = relativeLuminance(color.pressed[theme].slice(0, 7));
      const surface = relativeLuminance(color.background[theme]);
      const solid = relativeLuminance(color.text[theme]);

      const lower = Math.min(surface, solid);
      const upper = Math.max(surface, solid);

      expect(wash).toBeGreaterThan(lower);
      expect(wash).toBeLessThan(upper);
    }
  });

  /**
   * The selected fill is a visible step from the surface, and only a step.
   *
   * Both bounds matter. Too small and the chosen option is indistinguishable
   * without colour, which is the FR-015 failure the fill exists to fix. Too
   * large and it becomes the primary-action treatment again — an inverted box
   * shouting from a settings sheet, which is what the tinted container
   * replaced. The band is what "tinted container" means, expressed as a number
   * rather than left to whoever next opens the palette.
   */
  it('keeps the selected fill a tint, not an inversion', () => {
    for (const theme of THEMES) {
      // Measured against `surface`, not `background`. These options only ever
      // appear inside the settings sheet, so the surface they tint is the
      // sheet's. The two tokens were the same colour until the sheet gained its
      // own elevation, and this assertion silently measured the wrong pair for
      // as long as that was true.
      const step = contrastRatio(color.selected[theme], color.surface[theme]);
      expect(step).toBeGreaterThan(1.1);
      expect(step).toBeLessThan(2);

      // On the same side of the surface as the surface itself, not across it: a
      // fill that crossed `text` would be an inversion whatever its ratio.
      const distanceToBackground = Math.abs(
        relativeLuminance(color.selected[theme]) - relativeLuminance(color.surface[theme])
      );
      const distanceToText = Math.abs(
        relativeLuminance(color.selected[theme]) - relativeLuminance(color.text[theme])
      );
      expect(distanceToBackground).toBeLessThan(distanceToText);
    }
  });

  it('exposes a positive, ascending spacing scale', () => {
    const values = [space.xs, space.sm, space.md, space.lg, space.xl];
    for (const v of values) expect(v).toBeGreaterThan(0);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('sizes the note label far larger than supporting text (FR-017 glanceability)', () => {
    expect(type.noteSize).toBeGreaterThan(type.centsSize);
    expect(type.centsSize).toBeGreaterThan(type.labelSize);
    expect(type.noteSize).toBeGreaterThanOrEqual(96);
  });

  it('keeps motion durations short enough to feel immediate', () => {
    expect(motion.markerMs).toBeGreaterThan(0);
    expect(motion.markerMs).toBeLessThanOrEqual(120);
    expect(motion.colorMs).toBeLessThanOrEqual(300);
  });

  it('sets the minimum touch target to 44 (FR-020)', () => {
    expect(a11y.minTouchTarget).toBe(44);
  });
});
