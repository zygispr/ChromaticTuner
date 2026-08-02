import { expect, test } from '@playwright/test';

import { audioArgs, readCents, waitForNote } from './helpers';

test.use(audioArgs('e2-sharp-20.wav'));

test('a string 20 cents sharp reads positive and says loosen', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const cents = await readCents(page);
  expect(cents).toBeGreaterThan(10);
  expect(cents).toBeLessThan(30);

  await expect(page.getByTestId('direction-cue')).toContainText(/loosen/i);
});
