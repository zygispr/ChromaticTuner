import { type as typeTokens } from '@chromatic-tuner/tokens';
import { expect, test } from '@playwright/test';

import { audioArgs, hubGeometry, useDial, waitForNote } from './helpers';

test.use(audioArgs('d3-in-tune.wav'));

/**
 * FR-168 through FR-170 — the note name and the cents readout live in the hub,
 * and the circle takes back the room they used to occupy above it.
 *
 * Every assertion here is against RENDERED BOXES. The temptation is to read the
 * `clamp()` back off the computed style and check the arithmetic, and that
 * catches nothing: a clamp that computes exactly the intended font size and a
 * text block that overflows its circle are the same computed style. The failure
 * this file exists to catch is the note name colliding with the needle, which is
 * a fact about boxes (G26).
 *
 * The ratios below are the contract's (G25), written out rather than imported
 * from the component — a test that reads its expectations out of the code under
 * test asserts only that the code is self-consistent.
 */

/** G25: the hub owns the innermost 0.55 of the radius. */
const HUB_RADIUS_RATIO = 0.55;

/** The viewport heights the dial has to survive, tallest to shortest. */
const HEIGHTS = [900, 800, 700, 640, 560];

for (const height of HEIGHTS) {
  test(`the hub text fits clear of the needle at ${height}px (SC-073, G26)`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 900, height });
    await useDial(page);
    await page.goto('/');
    await waitForNote(page, 'D');

    const { radius, blockHalfDiagonal, labelInnerRadius, labelOuterRadius, needleInnerRadius } =
      await hubGeometry(page);

    // The constraint is the DIAGONAL, not the width. The needle sweeps every
    // angle, so a block that fits between the hub's left and right edges can
    // still have its corners outside the circle — and the corner is exactly
    // where a note name meets a needle pointing at C♯.
    expect(
      blockHalfDiagonal,
      `the note and cents block reaches ${blockHalfDiagonal.toFixed(1)}px from the centre, past the ${(radius * HUB_RADIUS_RATIO).toFixed(1)}px hub`
    ).toBeLessThanOrEqual(radius * HUB_RADIUS_RATIO);

    // Then the rings in order, each asserted against the NEXT one out rather
    // than against a ratio. This is the part that survives the constants being
    // retuned: whatever the budget, the text must not reach the labels and the
    // labels must not reach the needle (SC-073, G25).
    expect(
      labelInnerRadius,
      `the labels start ${labelInnerRadius.toFixed(1)}px out, inside the hub text at ${blockHalfDiagonal.toFixed(1)}px`
    ).toBeGreaterThan(blockHalfDiagonal);

    expect(
      needleInnerRadius,
      `the needle starts ${needleInnerRadius.toFixed(1)}px out, inside the labels at ${labelOuterRadius.toFixed(1)}px`
    ).toBeGreaterThan(labelOuterRadius);
  });
}

test('the note name never exceeds the size the line display draws it at (FR-169)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Deliberately enormous, so the dial is at its cap and the note at its own.
  await page.setViewportSize({ width: 1400, height: 1200 });
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  const fontSizePx = await page
    .getByTestId('note-label')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el.firstElementChild!).fontSize));

  expect(
    fontSizePx,
    `the note is ${fontSizePx}px, larger than the ${typeTokens.noteSize}px token`
  ).toBeLessThanOrEqual(typeTokens.noteSize);

  // The cap is derived from this: the largest dial is the smallest one whose hub
  // holds the note at its full token size, so at the cap the note is not merely
  // under the ceiling but ON it. A dial capped too small would silently draw a
  // permanently smaller note and pass the assertion above.
  expect(
    fontSizePx,
    `the note is ${fontSizePx}px at the dial's maximum size; the cap no longer earns the full ${typeTokens.noteSize}px`
  ).toBeCloseTo(typeTokens.noteSize, 0);
});

/**
 * FR-170 — the space freed by the hub belongs to the circle.
 *
 * 320 was the cap while the note name and cents readout sat above the dial and
 * `COLUMN_CHROME_PX` was 526. If this ever reads 320 again, the hub has been
 * built without the sizing being re-baselined, and the whole point of the
 * change — "the dial tuner is too small" — has been lost while every other
 * assertion here still passes.
 */
test('the dial is bigger than it was before the hub (FR-170)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 900, height: 900 });
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  const dial = (await page.getByTestId('tuning-dial').boundingBox())!;
  expect(dial.width, 'the dial is still at or below its old 320px cap').toBeGreaterThan(320);
});
