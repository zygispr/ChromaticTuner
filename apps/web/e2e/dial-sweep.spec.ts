import { expect, test } from '@playwright/test';

import { audioArgs, needleAccumulatedDeg, useDial, waitForNote } from './helpers';

test.use(audioArgs('b3-to-c4-sweep.wav'));

/**
 * V61 / G9 / G10 — crossing twelve o'clock takes the short way.
 *
 * Measured from the ACCUMULATED angle, never from where the needle came to
 * rest. Both a CSS transition and a Reanimated `withTiming` interpolate between
 * two numbers, so an un-unwrapped angle sweeps the needle 359 degrees backwards
 * to travel 0.6 forwards — and arrives at exactly the right place. Every
 * assertion about the resting angle passes on that build.
 *
 * B/C is the only boundary that can catch this. The other eleven are continuous
 * in the raw value: C +50 and C♯ -50 are both 15 degrees.
 */
async function worstBackwardStepDeg(page: import('@playwright/test').Page): Promise<{
  worst: number;
  span: number;
  samples: number;
}> {
  const samples: number[] = [];
  for (let i = 0; i < 120; i += 1) {
    const value = await needleAccumulatedDeg(page);
    if (value !== null) samples.push(value);
    await page.waitForTimeout(50);
  }

  expect(samples.length, 'never saw a needle at all').toBeGreaterThan(50);

  let worst = 0;
  for (let i = 1; i < samples.length; i += 1) {
    worst = Math.min(worst, samples[i]! - samples[i - 1]!);
  }

  return {
    worst,
    span: Math.max(...samples) - Math.min(...samples),
    samples: samples.length,
  };
}

test('never spins a full turn backwards at the B/C boundary (G10)', async ({ page }) => {
  test.setTimeout(120_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'B');

  const { worst, span } = await worstBackwardStepDeg(page);

  expect(
    worst,
    `largest backwards jump was ${worst.toFixed(1)}° — a full turn means the angle was never unwrapped`
  ).toBeGreaterThan(-180);

  // And the sweep really did move the needle, so this cannot pass vacuously on
  // a dial that never updated at all.
  expect(span).toBeGreaterThan(20);
});

/**
 * V66, step 4 — unwrapping is not an animation concern.
 *
 * The same boundary with the tween switched off. Worth its own case because the
 * two mechanisms are independent and it is easy to assume otherwise: unwrapping
 * exists BECAUSE an interpolator would take the long way, so an implementation
 * that folded it into the animation path — unwrap only when there is a
 * transition to unwrap — would leave the needle jumping the wrong way round the
 * dial for exactly the users who asked for less movement.
 */
test('still crosses the top by the short way under Reduce Motion (V66, G10)', async ({ page }) => {
  test.setTimeout(120_000);
  await useDial(page);
  // `page.emulateMedia`, not `test.use({ reducedMotion })` — the latter is
  // silently ineffective here, measured and recorded in `dial-motion.spec.ts`.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await waitForNote(page, 'B');

  const { worst, span } = await worstBackwardStepDeg(page);

  expect(
    worst,
    `largest backwards jump was ${worst.toFixed(1)}° under Reduce Motion`
  ).toBeGreaterThan(-180);
  expect(span).toBeGreaterThan(20);
});
