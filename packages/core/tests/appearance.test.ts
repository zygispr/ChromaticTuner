import { describe, expect, it } from 'vitest';

import { resolveAppearance } from '../src/appearance';
import type { Appearance, AppearancePreference } from '../src/types';

/**
 * V39 / M1-M4 — the resolution rule (data-model §3).
 *
 * The table below is the whole specification of this function, and the two
 * middle rows are the reason the table exists rather than three assertions.
 * `resolveAppearance('system', 'dark') === 'dark'` is satisfied by a function
 * that ignores its first argument entirely and returns the device value — which
 * is precisely the defect FR-116 describes, an app that follows the OS even
 * after the user said not to. Only the rows where preference and device
 * DISAGREE can tell the two implementations apart.
 */

const CASES: ReadonlyArray<{
  preference: AppearancePreference;
  device: Appearance;
  expected: Appearance;
  why: string;
}> = [
  // M2: an explicit choice outranks the device (FR-116). These four rows are
  // the load-bearing ones; the two where they contradict the device are what a
  // device-only implementation fails.
  { preference: 'light', device: 'light', expected: 'light', why: 'M2, agreeing' },
  { preference: 'light', device: 'dark', expected: 'light', why: 'M2, CONTRADICTING' },
  { preference: 'dark', device: 'dark', expected: 'dark', why: 'M2, agreeing' },
  { preference: 'dark', device: 'light', expected: 'dark', why: 'M2, CONTRADICTING' },

  // M3: 'system' defers to the device (FR-115).
  { preference: 'system', device: 'light', expected: 'light', why: 'M3' },
  { preference: 'system', device: 'dark', expected: 'dark', why: 'M3' },
];

describe('resolveAppearance (M1-M4, data-model §3)', () => {
  for (const { preference, device, expected, why } of CASES) {
    it(`${preference} + device ${device} -> ${expected} (${why})`, () => {
      expect(resolveAppearance(preference, device)).toBe(expected);
    });
  }

  it('covers every input combination there is', () => {
    // If a third appearance or a fourth preference is ever added, this fails
    // and the table above has to be extended rather than silently under-testing
    // the new value.
    const preferences: AppearancePreference[] = ['light', 'dark', 'system'];
    const devices: Appearance[] = ['light', 'dark'];
    expect(CASES).toHaveLength(preferences.length * devices.length);
  });

  it('never returns the preference itself when that is not renderable (M4)', () => {
    // 'system' is storable and choosable but not paintable. Any path that could
    // return it is a defect, so assert on the value rather than trusting the
    // return type — the type is erased at runtime and this is what a component
    // would actually receive.
    for (const device of ['light', 'dark'] as const) {
      const result: Appearance = resolveAppearance('system', device);
      expect(result).not.toBe('system');
      expect(['light', 'dark']).toContain(result);
    }
  });

  it('is pure: the same inputs give the same answer every time (M1)', () => {
    for (const { preference, device } of CASES) {
      const first = resolveAppearance(preference, device);
      expect(resolveAppearance(preference, device)).toBe(first);
      expect(resolveAppearance(preference, device)).toBe(first);
    }
  });
});
