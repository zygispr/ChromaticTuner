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
 * The dial takes no pointer events, anywhere, ever.
 *
 * **Reported by the maintainer**: with the dial selected, the settings badge was
 * clickable only at its two extreme ends.
 *
 * The cause is geometric and worth stating, because nothing about the dial's
 * appearance suggests it. The ticks, the target and the needle are each drawn by
 * an `inset: 0` wrapper — a square the full size of the dial — which is then
 * rotated (G21: the transform must go on a dial-sized concentric element, never
 * on the mark itself). A rotated square hit-tests over its rotated area, which
 * pokes out of the dial's own box by up to `((√2 − 1) / 2) × size` — 101px on a
 * 489px dial, at the 45° ticks. Those corners are transparent and paint nothing,
 * so the overhang is invisible; it is only detectable by asking what is on top.
 *
 * It was latent in Phase 3 and Phase 7 exposed it: at a 320px dial the overhang
 * was 66px and the note name and cents readout sat between the badge and the
 * dial, absorbing all of it. Moving them into the hub (FR-168) put the badge
 * 24px from the dial's edge.
 *
 * Asserted by hit-testing rather than only by clicking, so a failure says which
 * element is on top instead of "click timed out".
 */
for (const control of ['reference-badge', 'microphone-toggle']) {
  test(`the dial does not swallow clicks meant for the ${control}`, async ({ page }) => {
    test.setTimeout(60_000);
    await useDial(page);
    await page.goto('/');
    await waitForNote(page, 'D');

    const blockers = await page.evaluate((testId) => {
      const target = document.querySelector(`[data-testid="${testId}"]`);
      if (!target) return ['the control is not on the page'];

      const rect = target.getBoundingClientRect();
      const found = new Set<string>();

      // A grid across the whole control, not just its centre: the reported
      // symptom was that the MIDDLE was dead while the ends still worked.
      for (let i = 1; i < 10; i += 1) {
        for (let j = 1; j < 4; j += 1) {
          const hit = document.elementFromPoint(
            rect.left + (rect.width * i) / 10,
            rect.top + (rect.height * j) / 4
          );
          if (!hit || !target.contains(hit)) {
            found.add(hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing');
          }
        }
      }

      return [...found];
    }, control);

    expect(blockers, `${control} is covered by ${blockers.join(', ')}`).toEqual([]);
  });
}

test('the settings sheet opens from the badge with the dial selected (FR-022)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  // The symptom as a player meets it. Playwright's actionability check makes
  // this fail with an interception message rather than a silent no-op.
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
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
 *
 * **Re-baselined in Phase 7.** The note name and the cents readout moved into
 * the hub, so the chrome these cases are measured against fell from 526px to
 * 318px and the dial's cap rose. The heights are unchanged and 560 was added:
 * the fit is the requirement, and it has to hold across a bigger dial rather
 * than because of a smaller one.
 */
for (const height of [900, 800, 700, 640, 560]) {
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
