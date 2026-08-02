import { expect, test } from '@playwright/test';

import { audioArgs, readCents, waitForNote, expectMarkerAtCents } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

test('names the note and octave of a string that is already in tune', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Octave is shown alongside the note (FR-003).
  await expect(page.getByTestId('note-label')).toContainText('2');
  expect(Math.abs(await readCents(page))).toBeLessThanOrEqual(5);
  await expect(page.getByTestId('direction-cue')).toContainText(/in tune/i);
});

test('shows the horizontal line and its in-tune zone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tuning-line')).toBeVisible();
  await expect(page.getByTestId('in-tune-zone')).toBeVisible();
  await expect(page.getByTestId('tuning-marker')).toBeVisible();
});

test('is fully visible without scrolling (FR-018)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const scrolls = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
  }));
  expect(scrolls.x).toBe(false);
  expect(scrolls.y).toBe(false);
});

test('communicates tuning state through text as well as colour (FR-015)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Both non-colour channels must carry the state. If either is empty, the
  // display is colour-dependent and fails SC-009 in greyscale.
  await expect(page.getByTestId('cents-readout')).not.toBeEmpty();
  await expect(page.getByTestId('direction-cue')).not.toBeEmpty();
});

test('centres the marker when the string is in tune', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // The complement of the flat and sharp cases: at ~0 cents the marker must sit
  // on the centre line, which is the one position a broken implementation also
  // produces — so it is asserted alongside them, never alone.
  //
  // 15px is about 2 cents at this width. Tighter than that and the test chases
  // the reading's own jitter; the failure it exists to catch is off by 144px.
  await expectMarkerAtCents(page);
});
