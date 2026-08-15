import { test } from '@playwright/test';

import { audioArgs, expectNeedleAt, medianNeedleAngleDeg, useDial, waitForNote } from './helpers';

test.use(audioArgs('a4-in-tune.wav'));

/**
 * The single assertion that catches a mirrored dial (007 G2).
 *
 * Its own file because the fixture decides the worker. A is pitch class 9, so
 * 270 degrees — pointing LEFT. An anticlockwise dial puts it at 90, pointing
 * right, and agrees with a correct one at C, at the octave, and on every
 * assertion about label order. Nothing else here can tell the two apart.
 */
test('puts A three-quarters of the way round, not one quarter (G2)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'A');

  expectNeedleAt(await medianNeedleAngleDeg(page), 270);
});
