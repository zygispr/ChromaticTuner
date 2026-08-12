import { test } from '@playwright/test';

import { audioArgs, expectNeedleAt, medianNeedleAngleDeg, useDial, waitForNote } from './helpers';

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
