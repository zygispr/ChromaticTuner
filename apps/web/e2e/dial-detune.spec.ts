import { expect, test } from '@playwright/test';

import {
  audioArgs,
  expectNeedleAt,
  expectOneEmphasisedLabel,
  greyscaleChannels,
  medianNeedleAngleDeg,
  useDial,
  waitForNote,
  withoutColour,
} from './helpers';

test.use(audioArgs('d3-sharp-25.wav'));

/**
 * Cents reach the needle, with the right sign (007 G4).
 *
 * The 0.3-degrees-per-cent law is proved exhaustively and exactly in
 * `packages/core/tests/dial.test.ts`; what only a browser can prove is that the
 * COMPONENT passes the deviation through at all. A dial rendering
 * `dialAngleDegrees(midi, 0)` — ignoring cents entirely — satisfies every
 * in-tune fixture in this suite and is wrong by up to half a segment whenever
 * the player is actually tuning.
 */
test('displaces the needle clockwise for a sharp string (G4)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  // D at 60 degrees, plus 25 cents at 0.3 degrees each.
  expectNeedleAt(await medianNeedleAngleDeg(page), 67.5);
});

/**
 * V68 / SC-070 — the same string, with the colour taken away.
 *
 * The flat half and the shared helpers live in `dial-greyscale.spec.ts`; this
 * is the sharp one, here because the fixture decides the worker. Together they
 * are what says the sign is carried by geometry rather than by hue — a single
 * side asserted on its own is satisfied by a needle that never moves.
 */
test('a sharp string is readable with no colour at all (V68, SC-070)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await withoutColour(page);
  await waitForNote(page, 'D');

  const { offset, weights, cue } = await greyscaleChannels(page);

  // 25 cents sharp is 7.5 degrees CLOCKWISE of the segment's centre.
  expect(offset, `the needle is ${offset.toFixed(1)}° from the target mark`).toBeGreaterThan(3);
  expectOneEmphasisedLabel(weights);
  expect(cue).toMatch(/LOOSEN/i);
});
