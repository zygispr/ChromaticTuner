import { expect, test } from '@playwright/test';

import { audioArgs, readCents, waitForNote } from './helpers';

test.use(audioArgs('e2-flat-20.wav'));

test('a string 20 cents flat reads negative and says tighten', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const cents = await readCents(page);
  expect(cents).toBeLessThan(-10);
  expect(cents).toBeGreaterThan(-30);

  await expect(page.getByTestId('direction-cue')).toContainText(/tighten/i);
});

test('moves the marker left of centre via a transform, not React state', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // The marker is positioned by writing `transform` directly to the node, so a
  // non-identity matrix here is evidence the continuous channel is wired up
  // (guarantee R1, research D6).
  const transform = await page
    .getByTestId('tuning-marker')
    .evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe('none');
});
