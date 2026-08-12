import { expect, test } from '@playwright/test';

import { audioArgs, useDial } from './helpers';

test.use(audioArgs('silence.wav'));

/**
 * FR-163 — no needle before the first reading of a session.
 *
 * Needs its own fixture: every other fixture starts sounding immediately and
 * Chromium loops them, so a reading has always already happened by the time an
 * assertion runs. "No angle yet" is a different state from "an angle of zero",
 * and drawing a needle straight up before anything has been heard would read as
 * "C detected".
 */
test('draws no needle at all until something has been heard (FR-163)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');

  await expect(page.getByTestId('tuning-dial')).toBeVisible();
  await expect(page.getByTestId('note-label')).toHaveText('–');
  expect(await page.getByTestId('dial-needle').count()).toBe(0);
});
