import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

/**
 * The tuner must not move vertically as its status changes.
 *
 * `StatusBanner` renders nothing while a note is being read and something while
 * listening, stopped, or failing — and the display is centre-justified, so the
 * banner appearing or vanishing re-centres the whole column. Measured before the
 * fix: everything above shifted **up 37 px** and the microphone control **down
 * 37 px**, every single time.
 *
 * That is not only a stop/start problem. The banner is absent while `reading`
 * and present while `listening`, so the display also jumped every time a note
 * was acquired or lost — which is what a tuner does constantly. It is the
 * signature element of the product moving under the player's eyes while they
 * are trying to read it from a metre away (FR-017, FR-021).
 */
test.use(audioArgs('e2-then-silence.wav'));

type Positions = Record<string, number>;

/** Top edge of each element that must not move, in viewport pixels. */
async function positions(page: import('@playwright/test').Page): Promise<Positions> {
  return page.evaluate(() => {
    const ids = ['reference-badge', 'note-label', 'cents-readout', 'tuning-line', 'direction-cue'];
    const out: Record<string, number> = {};
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (element) out[id] = Math.round(element.getBoundingClientRect().y);
    }
    return out;
  });
}

function expectUnmoved(before: Positions, after: Positions, what: string) {
  for (const [id, y] of Object.entries(before)) {
    expect(after[id], `${id} moved ${(after[id] ?? NaN) - y}px ${what}`).toBe(y);
  }
}

test('the tuner does not move when capture is stopped and restarted (FR-021)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.waitForTimeout(300);

  const reading = await positions(page);
  expect(Object.keys(reading).length).toBeGreaterThan(3);

  await page.getByTestId('microphone-toggle').click();
  await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);
  expectUnmoved(reading, await positions(page), 'when capture stopped');

  await page.getByTestId('microphone-toggle').click();
  await waitForNote(page, 'E');
  await page.waitForTimeout(300);
  expectUnmoved(reading, await positions(page), 'when capture restarted');
});

/**
 * The settings sheet must not resize when a setting changes.
 *
 * It did, in Safari only: the two groups were `<fieldset>`s, and a `<legend>` is
 * laid out inside its fieldset's border box — a special case Safari gets wrong
 * on first layout, making each group one legend line-height too tall. The first
 * interaction with any control re-laid it out correctly and the sheet collapsed
 * 36 px, moving every control away from the finger that was reaching for it.
 *
 * Two assertions, because neither is sufficient alone. The height check is what
 * the user actually experiences, but it cannot fail here: both Chromium and the
 * Playwright WebKit build lay fieldsets out correctly, so the bug is invisible
 * to every engine this suite can drive. The structure check is what fails on the
 * unfixed code, and it is the thing that stops the construct coming back.
 */
test('the settings sheet does not resize when a setting changes (FR-021)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();

  const sheet = page.getByTestId('settings-sheet');
  await expect(sheet).toBeVisible();
  const heightOf = async () => Math.round((await sheet.boundingBox())!.height);

  const opened = await heightOf();

  await page.getByTestId('a4-slider').fill('432');
  await expect(page.getByTestId('a4-value')).toHaveText('432');
  expect(await heightOf(), 'the sheet resized when the reference pitch changed').toBe(opened);

  await page.getByTestId('accidental-flat').click();
  await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true');
  expect(await heightOf(), 'the sheet resized when the accidental style changed').toBe(opened);

  // The appearance group is three members rather than two, so it is the one
  // most likely to reflow: a label as long as "Match device" beside two short
  // ones will wrap if the options are not equal-width.
  for (const value of ['light', 'dark', 'system'] as const) {
    await page.getByTestId(`appearance-${value}`).click();
    await expect(page.getByTestId(`appearance-${value}`)).toHaveAttribute('aria-pressed', 'true');
    expect(await heightOf(), `the sheet resized when the appearance became ${value}`).toBe(opened);
  }

  await page.getByTestId('settings-reset').click();
  await expect(page.getByTestId('a4-value')).toHaveText('440');
  expect(await heightOf(), 'the sheet resized when the settings were reset').toBe(opened);
});

test('the settings groups are labelled without fieldset/legend layout (FR-021)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();

  const sheet = page.getByTestId('settings-sheet');
  await expect(sheet).toBeVisible();
  await expect(
    sheet.locator('fieldset'),
    'a fieldset is back; Safari mis-sizes it on first layout'
  ).toHaveCount(0);

  // Still grouped and still labelled — the point is the layout path, not the
  // semantics, which assistive technology reads identically either way (FR-020).
  //
  // Four since 007. The order is asserted as well as the count, because it is
  // the sheet's reading order: what the tuner listens for, how it names notes,
  // how it draws them, how the app looks.
  const groups = sheet.getByRole('group');
  await expect(groups).toHaveCount(4);
  await expect(groups.nth(0)).toHaveAccessibleName('Reference pitch');
  await expect(groups.nth(1)).toHaveAccessibleName('Accidentals');
  await expect(groups.nth(2)).toHaveAccessibleName('Tuning display');
  await expect(groups.nth(3)).toHaveAccessibleName('Appearance');
});

/**
 * The three appearance options are one width (research D8, FR-118).
 *
 * Separate from the sheet-height check above, which cannot see this: the row
 * keeps its height whether the options are equal or not. What resizes is the
 * options themselves — "Match device" is more than twice as long as "Dark", so
 * options sized to their content put the boxes at three different widths and
 * move them under the finger as the selection's bold weight shifts.
 */
test('the appearance options are equal width and stay that way (FR-118)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  const widths = async () =>
    Promise.all(
      (['system', 'light', 'dark'] as const).map(async (value) => {
        const box = await page.getByTestId(`appearance-${value}`).boundingBox();
        expect(box, `appearance-${value} has no box`).not.toBeNull();
        return Math.round(box!.width);
      })
    );

  const atRest = await widths();
  expect(new Set(atRest).size, `the options are ${atRest.join('/')}px wide`).toBe(1);

  // Selecting bolds a label, which is exactly when a content-sized box grows.
  for (const value of ['light', 'dark', 'system'] as const) {
    await page.getByTestId(`appearance-${value}`).click();
    const after = await widths();
    expect(after, `choosing ${value} resized the options`).toEqual(atRest);
  }
});

test('the tuner does not move when a note is lost and re-acquired (FR-021)', async ({ page }) => {
  await page.goto('/');

  // The fixture is 3 s of tone then 3 s of silence, on a loop, so both states
  // arrive on their own without touching any control.
  await waitForNote(page, 'E');
  await page.waitForTimeout(300);
  const reading = await positions(page);

  await expect(page.getByTestId('tuner-status')).toContainText(/listening/i, { timeout: 15_000 });
  expectUnmoved(reading, await positions(page), 'when the note was lost');

  await waitForNote(page, 'E');
  await page.waitForTimeout(300);
  expectUnmoved(reading, await positions(page), 'when the note was re-acquired');
});

/**
 * The same guarantee at phone width, where it actually broke.
 *
 * The test above runs at the default desktop viewport, and that is why it stayed
 * green through a real defect: the banner's container is `maxWidth: 420`, so at
 * 1280px the stopped state's recovery line — "Choose Start listening when you
 * want to tune again." — fits on ONE line and the banner comes to ~51px, inside
 * the reserved slot. Narrow the viewport and it wraps to two, the banner
 * measures 74px against a 64px slot, and the centred column absorbs the
 * difference by moving everything 5px.
 *
 * Reported on the mobile app, where the width is always narrow. It was never a
 * mobile bug — it was a narrow-viewport bug that mobile is simply always in.
 */
test.describe('at phone width', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('the tuner does not move when capture is stopped and restarted (FR-021)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.waitForTimeout(300);

    const reading = await positions(page);
    expect(Object.keys(reading).length).toBeGreaterThan(3);

    await page.getByTestId('microphone-toggle').click();
    await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);
    expectUnmoved(reading, await positions(page), 'when capture stopped at phone width');

    await page.getByTestId('microphone-toggle').click();
    await waitForNote(page, 'E');
    await page.waitForTimeout(300);
    expectUnmoved(reading, await positions(page), 'when capture restarted at phone width');
  });

  /**
   * The stopped banner must FIT the slot reserved for it, not merely happen to.
   *
   * The test above only catches a jump once the copy is long enough to cause
   * one. This catches the cause directly, so an edit to the recovery sentence
   * that pushes it onto a second line fails here — with an obvious reason —
   * rather than reintroducing a 5px shift nobody looks for.
   *
   * Reserving more is not the escape hatch: the tuner column has about ten
   * pixels of slack in the smallest viewport, and `fold.spec.ts` fails when the
   * microphone control is pushed into the scroll cue. The banner has to fit.
   */
  test('the stopped banner fits its reserved slot at phone width (FR-021)', async ({ page }) => {
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.getByTestId('microphone-toggle').click();
    await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);

    const { banner, slot } = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="status-banner"]')!;
      return {
        banner: Math.ceil(b.getBoundingClientRect().height),
        slot: Math.round(parseFloat(getComputedStyle(b.parentElement!).minHeight)),
      };
    });

    expect(slot, 'the reserved slot is gone or no longer a fixed height').toBeGreaterThan(0);
    expect(
      banner,
      `the stopped banner is ${banner}px in a ${slot}px slot — it will shift the column by ${Math.ceil((banner - slot) / 2)}px`
    ).toBeLessThanOrEqual(slot);
  });
});
