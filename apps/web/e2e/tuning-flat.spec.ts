import { expect, test } from '@playwright/test';

import { audioArgs, expectMarkerAtCents, markerOffsetPx, readCents, waitForNote } from './helpers';

test.use(audioArgs('e2-flat-20.wav'));

test('a string 20 cents flat reads negative and says tighten', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const cents = await readCents(page);
  expect(cents).toBeLessThan(-10);
  expect(cents).toBeGreaterThan(-30);

  await expect(page.getByTestId('direction-cue')).toContainText(/tighten/i);
});

test('puts the marker where the reading says it is (FR-005, FR-006)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Measured in pixels against the line, not asserted as "a transform exists".
  // The earlier version of this test checked `transform !== 'none'`, which is
  // satisfied by the constant centring transform — so a marker that never moved
  // at all passed it for seven phases. See markerOffsetPx in ./helpers.
  await expectMarkerAtCents(page);

  // And it is genuinely on the flat side, not merely near the right number.
  expect(await markerOffsetPx(page)).toBeLessThan(-20);
});
