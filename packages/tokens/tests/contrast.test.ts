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

describe('contrast helper', () => {
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
    for (const themed of Object.values(color)) {
      for (const theme of THEMES) {
        expect(themed[theme]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
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
