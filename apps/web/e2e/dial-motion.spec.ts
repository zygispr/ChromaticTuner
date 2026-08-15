import { motion } from '@chromatic-tuner/tokens';
import { expect, test, type Page } from '@playwright/test';

import {
  audioArgs,
  expectNeedleAt,
  medianNeedleAngleDeg,
  useDial,
  waitForNeedleAngle,
  waitForNote,
} from './helpers';

test.use(audioArgs('d3-in-tune.wav'));

/**
 * V66 / FR-165 — Reduce Motion removes the sweep rather than shortening it.
 *
 * **`test.use({ reducedMotion: 'reduce' })` does not work in this repo, and it
 * was the obvious way to write this.** Measured under Playwright 1.62.1 with
 * the `Desktop Chrome` device: at file level and at `describe` level alike,
 * `window.matchMedia('(prefers-reduced-motion: reduce)').matches` reads
 * **false** inside the page, while `page.emulateMedia({ reducedMotion })` — the
 * idiom `a11y.spec.ts` already uses for `colorScheme` — reads **true**. So the
 * preference is emulated per test here, always BEFORE `goto`, because the
 * component reads the query once when it mounts.
 *
 * The pairing is the point. A negative on its own ("no transition") passes for
 * the emptiest possible reason on a build that never had one — the shape
 * `settings-animation.test.tsx` had to be rescued from — so each case asserts
 * the transition IS `markerMs` under the default preference and gone under
 * Reduce Motion: same element, same property, one preference apart.
 */

/**
 * The transition on an element, read TWICE — from the browser and from the
 * component.
 *
 * They are two different mechanisms and only measuring both says which one is
 * working. `main.tsx` carries the conventional global reset
 * (`transition-duration: 0.01ms !important` under the media query, FR-016),
 * and `!important` beats an inline style — so the composed duration comes back
 * as `1e-05s` even on a build where the dial itself never dropped anything.
 * That is why `seconds` alone cannot be the whole assertion: it passes on a
 * component that ignores the preference entirely.
 *
 * `inline` is the component's own decision, written from its `matchMedia` read,
 * and it is the half that has a mobile counterpart — `TuningDial.tsx` on the
 * phone has no stylesheet to fall back on.
 */
async function transitionOf(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return null;
    const style = getComputedStyle(el);
    // Both are comma-separated lists, positionally paired. The wrapper carries
    // TWO transitions — `transform` at `markerMs` and `opacity` at `colorMs` —
    // so a single "the duration" would be whichever the reader assumed.
    const properties = style.transitionProperty.split(',').map((part) => part.trim());
    const durations = style.transitionDuration
      .split(',')
      .map((part) => Number.parseFloat(part) || 0);

    return {
      properties,
      seconds: Object.fromEntries(properties.map((name, i) => [name, durations[i] ?? 0])),
      longestSeconds: Math.max(0, ...durations),
      inline: (el as HTMLElement).style.transition,
    };
  }, testId);
}

/** Below this, a transition is over before the next frame is presented. */
const IMPERCEPTIBLE_SECONDS = 0.001;

for (const preference of ['no-preference', 'reduce'] as const) {
  const reduced = preference === 'reduce';

  test(`the needle's transition is ${reduced ? 'dropped' : 'markerMs'} under ${preference} (FR-165, V66)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await useDial(page);
    await page.emulateMedia({ reducedMotion: preference });
    await page.goto('/');
    await waitForNote(page, 'D');
    // The needle is not drawn until something has been heard (FR-163), so the
    // wrapper does not exist to be read until an angle does.
    await waitForNeedleAngle(page);

    const transition = await transitionOf(page, 'dial-needle-wrapper');
    expect(transition, 'no needle wrapper to read a transition from').not.toBeNull();

    if (reduced) {
      // Removed, not shortened. `none` is what the component writes; the
      // composed duration is what the eye gets, and both are asserted because
      // the global reset can supply the second without the first.
      expect(
        transition!.inline,
        `the dial itself still asked for "${transition!.inline}" under Reduce Motion`
      ).toBe('none');
      expect(transition!.longestSeconds).toBeLessThan(IMPERCEPTIBLE_SECONDS);
    } else {
      expect(transition!.properties).toContain('transform');
      expect(transition!.inline).toContain(`${motion.markerMs}ms`);
      expect(transition!.seconds['transform']).toBeCloseTo(motion.markerMs / 1000, 5);
      // The fade is the other half of what this wrapper animates (G27), and it
      // runs over `colorMs` rather than `markerMs`.
      expect(transition!.seconds['opacity']).toBeCloseTo(motion.colorMs / 1000, 5);
    }

    // And the needle is still POINTED, which is what stops the reduced case
    // passing on a build that simply never writes the transform: no transition
    // and no rotation are indistinguishable to the assertions above.
    expectNeedleAt(await medianNeedleAngleDeg(page), 60);
  });

  test(`the line's marker transition is ${reduced ? 'dropped' : 'markerMs'} under ${preference} (FR-016)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: preference });
    await page.goto('/');
    await waitForNote(page, 'D');

    const transition = await transitionOf(page, 'tuning-track');
    expect(transition, 'no tuning track to read a transition from').not.toBeNull();

    if (reduced) {
      expect(transition!.inline).toBe('none');
      expect(transition!.longestSeconds).toBeLessThan(IMPERCEPTIBLE_SECONDS);
    } else {
      expect(transition!.properties).toContain('transform');
      expect(transition!.inline).toContain(`${motion.markerMs}ms`);
      expect(transition!.seconds['transform']).toBeCloseTo(motion.markerMs / 1000, 5);
    }
  });
}
