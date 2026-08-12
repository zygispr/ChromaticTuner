import { expect, test } from '@playwright/test';

import { audioArgs, expectNeedleAt, medianNeedleAngleDeg, useDial, waitForNote } from './helpers';

test.use(audioArgs('d3-in-tune.wav'));

/**
 * User Story 1 — the circular display (007, V60 and V63).
 *
 * One fixture per spec file: `launchOptions` cannot be set per `describe`
 * because Playwright forces a new worker for it, which is why the dial's angle
 * table is spread across `dial-*.spec.ts` rather than parameterised here.
 *
 * Read the hazard table in this feature's tasks.md before adding assertions.
 * The needle's angle is measured from RENDERED BOXES throughout, never from its
 * transform: putting the rotation on the needle instead of its wrapper writes a
 * perfectly correct matrix and draws the needle in the wrong place (D5, G21).
 */

test('points the needle at the segment of the note it is naming (G2, G21)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  // D is pitch class 2, so 60 degrees clockwise from the top.
  expectNeedleAt(await medianNeedleAngleDeg(page), 60);
});

test('labels all twelve segments, C at the top, ascending clockwise (FR-155)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  const labels = await page.getByTestId('dial-label').allTextContents();
  expect(labels).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);

  // Order alone is not placement: a list rendered in the right sequence but
  // laid out anticlockwise passes the assertion above and is a mirrored dial.
  const dial = (await page.getByTestId('tuning-dial').boundingBox())!;
  const centreX = dial.x + dial.width / 2;
  const centreY = dial.y + dial.height / 2;

  const boxes = await page.getByTestId('dial-label').all();
  const c = (await boxes[0]!.boundingBox())!;
  const dSharp = (await boxes[3]!.boundingBox())!;

  expect(c.y + c.height / 2, 'C is not above the centre').toBeLessThan(centreY);
  expect(Math.abs(c.x + c.width / 2 - centreX)).toBeLessThan(dial.width * 0.06);
  // D♯ is a quarter turn on, so clockwise puts it to the RIGHT. This is the
  // assertion that says which way round the dial runs.
  expect(dSharp.x + dSharp.width / 2, 'D♯ is not clockwise of C').toBeGreaterThan(centreX);
});

test('respells the five accidentals with flats, naturals untouched (FR-156)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page, { accidentalStyle: 'flat' });
  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  expect(await page.getByTestId('dial-label').allTextContents()).toEqual([
    'C',
    'D♭',
    'D',
    'E♭',
    'E',
    'F',
    'G♭',
    'G',
    'A♭',
    'A',
    'B♭',
    'B',
  ]);
});

test('draws a boundary tick between every pair of segments (FR-154)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  expect(await page.getByTestId('dial-tick').count()).toBe(12);
});
