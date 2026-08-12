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
test('never spins a full turn backwards at the B/C boundary (G10)', async ({ page }) => {
  test.setTimeout(120_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'B');

  const samples: number[] = [];
  for (let i = 0; i < 120; i += 1) {
    const value = await needleAccumulatedDeg(page);
    if (value !== null) samples.push(value);
    await page.waitForTimeout(50);
  }

  expect(samples.length, 'never saw a needle at all').toBeGreaterThan(50);

  let worstBackwardStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    worstBackwardStep = Math.min(worstBackwardStep, samples[i]! - samples[i - 1]!);
  }

  expect(
    worstBackwardStep,
    `largest backwards jump was ${worstBackwardStep.toFixed(1)}° — a full turn means the angle was never unwrapped`
  ).toBeGreaterThan(-180);

  // And the sweep really did move the needle, so this cannot pass vacuously on
  // a dial that never updated at all.
  expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(20);
});
