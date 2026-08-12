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

/**
 * V69 / FR-018 — the whole tuner fits without scrolling.
 *
 * Reported against the built dial: the microphone control was pushed off the
 * bottom of the screen. FR-018 requires the primary display to be fully visible
 * without scrolling, tapping or expanding, because the player's hands are on
 * the instrument.
 *
 * The regression this pins: the dial sized itself from WIDTH alone
 * (`width: 100%; max-width: 320px; aspect-ratio: 1`), so its height was
 * unbounded by what was left. Measured, the column went 574px with the line to
 * 798px with the dial, and the control left the screen below a 846px viewport.
 *
 * 622px is the height at which the LINE's column stops fitting, so it is the
 * bar the dial has to clear: whatever the viewport, choosing the dial must
 * never cost a player a control the line would have left on screen.
 */
for (const height of [900, 800, 700, 640]) {
  test(`fits the viewport at ${height}px, control and all (FR-018)`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 900, height });
    await useDial(page);
    await page.goto('/');
    await waitForNote(page, 'D');

    const dial = await page.getByTestId('tuning-dial').boundingBox();
    expect(dial, 'the dial has no box').not.toBeNull();

    const toggleBottom = await page
      .getByTestId('microphone-toggle')
      .evaluate((el) => el.getBoundingClientRect().bottom);

    expect(
      Math.round(toggleBottom),
      `the microphone control ends ${Math.round(toggleBottom - height)}px below the fold`
    ).toBeLessThanOrEqual(height);

    // And the dial itself is not clipped at the top by the same overflow.
    expect(dial!.y).toBeGreaterThanOrEqual(0);
    // Still square, whatever it had to shrink to.
    expect(Math.abs(dial!.width - dial!.height)).toBeLessThan(2);
  });
}
