import { expect, test } from '@playwright/test';

import { audioArgs, markerOffsetPx, waitForNote } from './helpers';

/**
 * User Story 2 (T020): the marker returns to rest when the signal dies.
 *
 * The fixture is 3 s of a string 20 cents flat followed by 3 s of silence, and
 * Chromium loops it — so a single page can be observed through displaced →
 * rested → displaced without any test-only hooks into the app.
 *
 * Measured from the rendered boxes via `markerOffsetPx`, never from the inline
 * style. `001` shipped a marker 144 px from where it belonged behind an
 * assertion that a transform merely existed; a rest test phrased the same way
 * would pass on a marker that had not moved at all.
 */
test.use(audioArgs('e2-then-silence.wav'));

/** Poll the real geometry until the predicate holds, or fail with the last value. */
async function waitForOffset(
  page: import('@playwright/test').Page,
  predicate: (offset: number) => boolean,
  what: string,
  timeoutMs = 15_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = Number.NaN;

  while (Date.now() < deadline) {
    last = await markerOffsetPx(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(50);
  }

  throw new Error(`timed out waiting for ${what}; last marker offset was ${last.toFixed(1)}px`);
}

test('the marker returns to rest when the note stops sounding (FR-043, SC-018)', async ({
  page,
}) => {
  await page.goto('/');

  // The startup position, before any audio has been analysed. FR-044 requires
  // the rest position after a lapse to be exactly this, so it is measured
  // rather than assumed to be zero.
  const restingAtStartup = await markerOffsetPx(page);

  await waitForNote(page, 'E');

  // 20 cents flat on a ±50 cent line is 40% of half the width — tens of pixels,
  // not a rounding artefact.
  const displaced = await waitForOffset(
    page,
    (offset) => Math.abs(offset - restingAtStartup) > 15,
    'the marker to be displaced by the flat tone'
  );
  expect(Math.abs(displaced - restingAtStartup)).toBeGreaterThan(15);

  // Then the fixture goes quiet. Before this story the marker stayed exactly
  // where it was, indefinitely, while the readout beside it cleared itself.
  const rested = await waitForOffset(
    page,
    (offset) => Math.abs(offset - restingAtStartup) < 3,
    'the marker to return to rest after the tone stopped'
  );

  expect(Math.abs(rested - restingAtStartup)).toBeLessThan(3);
});

test('the rest position is the startup position, not merely near it (FR-044)', async ({ page }) => {
  await page.goto('/');
  const restingAtStartup = await markerOffsetPx(page);

  await waitForNote(page, 'E');
  await waitForOffset(
    page,
    (offset) => Math.abs(offset - restingAtStartup) > 15,
    'the marker to be displaced'
  );

  const rested = await waitForOffset(
    page,
    (offset) => Math.abs(offset - restingAtStartup) < 3,
    'the marker to rest'
  );

  // A marker that rests 2px off centre but starts exactly on it is a defect
  // that only appears after the first note, and would otherwise reach
  // production looking correct on a cold load.
  expect(rested).toBeCloseTo(restingAtStartup, 0);
});

test('the marker tracks again when the string sounds once more (FR-047)', async ({ page }) => {
  await page.goto('/');
  const restingAtStartup = await markerOffsetPx(page);

  await waitForNote(page, 'E');
  await waitForOffset(page, (offset) => Math.abs(offset - restingAtStartup) > 15, 'displacement');
  await waitForOffset(page, (offset) => Math.abs(offset - restingAtStartup) < 3, 'rest');

  // The fixture loops, so the tone comes back. Resting must not be a terminal
  // state the marker cannot leave.
  const displacedAgain = await waitForOffset(
    page,
    (offset) => Math.abs(offset - restingAtStartup) > 15,
    'the marker to track the returning tone'
  );

  expect(Math.abs(displacedAgain - restingAtStartup)).toBeGreaterThan(15);
});
