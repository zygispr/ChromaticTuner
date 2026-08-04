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

/**
 * FR-018: the tuning display is usable without scrolling.
 *
 * **Re-scoped by 003, not weakened.** This used to assert that the *document*
 * did not scroll vertically, which was a fair proxy while the tuner was the
 * only thing on the page. It is not what FR-018 says: the requirement is that
 * the *display* is fully visible and usable with no scrolling, tapping or
 * expanding — and FR-066 restates it as the tuner owning the first viewport
 * height. Neither has ever required the document itself to be unscrollable.
 *
 * Now that supporting content sits below the fold (FR-064), the old assertion
 * would fail while the requirement it cites still holds perfectly. Kept as a
 * proxy it would have to be deleted; stated as the requirement it can simply be
 * measured, which `fold.spec.ts` does properly at the smallest supported
 * viewport with real bounding boxes.
 *
 * The horizontal half is unchanged and still binding — nothing about this
 * feature makes sideways scrolling acceptable.
 */
test('does not scroll sideways, and starts at the tuner (FR-018, FR-067)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const state = await page.evaluate(() => ({
    scrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollY: window.scrollY,
  }));

  expect(state.scrollsSideways, 'the page scrolls horizontally').toBe(false);
  expect(state.scrollY, 'the page did not open at the tuner').toBe(0);
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
