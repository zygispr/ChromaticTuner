import { expect, test } from '@playwright/test';

import { audioArgs, needleAccumulatedDeg, rgbOf, useDial, waitForNote } from './helpers';

test.use(audioArgs('e2-then-silence.wav'));

/**
 * FR-162 — a lapsed reading holds its angle and goes quiet.
 *
 * The exact opposite of `marker-rest.spec.ts`, deliberately: the line returns
 * to centre because centre means nothing on a line, while the dial's rest
 * position would be a real note. Holding is what stops the needle claiming
 * "C" the moment a string is damped.
 */
test('holds the last angle rather than snapping to a note (FR-162)', async ({ page }) => {
  test.setTimeout(90_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');

  const whileSounding = await needleAccumulatedDeg(page);
  expect(whileSounding, 'no needle while a note was sounding').not.toBeNull();

  // The fixture's silent stretch is 3 s, well past the filter chain's 400 ms
  // hold, so the readout blanking is the signal that the reading has lapsed.
  await expect(page.getByTestId('note-label')).toHaveText('–', { timeout: 20_000 });

  const whileSilent = await needleAccumulatedDeg(page);
  expect(whileSilent, 'the needle vanished on a lapse').not.toBeNull();
  expect(whileSilent).toBeCloseTo(whileSounding!, 5);
});

test('goes quiet by colour, not by dimming (FR-162, G22)', async ({ page }) => {
  test.setTimeout(90_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');
  await expect(page.getByTestId('note-label')).toHaveText('–', { timeout: 20_000 });

  const needle = page.getByTestId('dial-needle');
  const colour = await needle.evaluate((el) => getComputedStyle(el).backgroundColor);
  const noReading = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ct-no-reading').trim()
  );

  expect(noReading, 'the no-reading token is not defined').not.toBe('');
  expect(rgbOf(colour)).toBe(rgbOf(noReading));

  // No opacity multiplier. That mechanism has defeated the contrast floor twice
  // in this repo, and neither the palette test nor Axe can see it (G22).
  const opacity = await needle.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBe(1);
});
