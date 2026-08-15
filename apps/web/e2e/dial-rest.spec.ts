import { expect, test } from '@playwright/test';

import {
  audioArgs,
  needleAccumulatedDeg,
  needleEffectiveOpacity,
  useDial,
  waitForNeedleAngle,
  waitForNeedleOpacity,
  waitForNote,
} from './helpers';

test.use(audioArgs('e2-then-silence.wav'));

/**
 * Track the needle until the readout blanks, and return the last angle it held
 * while a note was still being named.
 *
 * The readout is the lapse signal available to a test — it clears on the same
 * edge the needle fades on — so sampling up to the moment it blanks is as close
 * to "the angle at the lapse" as an observer outside the app can get.
 */
async function lastAngleBeforeLapse(
  page: import('@playwright/test').Page,
  timeoutMs = 20_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = Number.NaN;

  while (Date.now() < deadline) {
    const blank = (await page.getByTestId('note-label').textContent())?.trim() === '–';
    if (blank) {
      expect(last, 'the readout blanked before the needle ever had an angle').not.toBeNaN();
      return last;
    }

    const angle = await needleAccumulatedDeg(page);
    if (angle !== null) last = angle;
    await page.waitForTimeout(50);
  }

  throw new Error(`timed out waiting for the reading to lapse; last angle was ${last}`);
}

/**
 * FR-162 — a lapsed reading holds its angle and goes quiet.
 *
 * The exact opposite of `marker-rest.spec.ts`, deliberately: the line returns
 * to centre because centre means nothing on a line, while the dial's rest
 * position would be a real note. Holding is what stops the needle claiming
 * "C" the moment a string is damped.
 */
test('holds the last angle rather than snapping to a note (FR-162)', async ({ page }) => {
  test.setTimeout(90_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');

  await waitForNeedleAngle(page);

  // The LAST angle held while a note was still named, not the first one seen.
  //
  // The fixture's silent stretch is 3 s, well past the filter chain's 400 ms
  // hold, so the readout blanking is the signal that the reading has lapsed —
  // but the needle tracks the live signal for the whole three seconds before
  // it, so an angle sampled at the start is not the angle the lapse is supposed
  // to preserve. This test compared the two at five decimal places and passed
  // only because the fixture is steady enough that they were usually identical;
  // under load a final reading landed in between and moved the needle 0.03°.
  const whileSounding = await lastAngleBeforeLapse(page);

  const whileSilent = await needleAccumulatedDeg(page);
  expect(whileSilent, 'the needle vanished on a lapse').not.toBeNull();

  // A degree is ~3 cents, and the defect this exists to catch — snapping to a
  // rest position that names a note — moves the needle by tens of degrees. The
  // tolerance covers the ≤1 analysis hop between the last sample and the lapse
  // without coming close to admitting the failure.
  expect(Math.abs(whileSilent! - whileSounding), 'the needle moved across the lapse').toBeLessThan(
    1
  );
});

/**
 * FR-162, second half — and the case that used to assert the defect.
 *
 * This test read `expect(Number(opacity)).toBe(1)` after a lapse, taking G22's
 * "the lapsed needle changes colour to noReading; it is not dimmed" literally.
 * FR-162 has always said "hold its last angle AND VISIBLY FADE"; only the hold
 * was built, and this case pinned the half. A player who damps a string was left
 * with a grey needle aimed at a note that had stopped sounding.
 *
 * Rewritten rather than deleted: the requirement it was guarding is the same
 * one, and the assertion is now the other half of it. G22 has been reworded to
 * forbid steady-state alpha while permitting exactly this fade to zero — nothing
 * remains on screen to fail a contrast ratio, which is what separates it from
 * the dimming that has defeated the floor twice here.
 */
test('fades out of sight entirely when the note stops (FR-162, SC-072, G22)', async ({ page }) => {
  test.setTimeout(90_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');

  // Fully opaque while the string sounds — the fade must be the lapse, not a
  // dimming that happens to be running all the time.
  //
  // The poll bound and the assertion are the SAME bound, deliberately. Polling
  // for `> 0.99` and then asserting `toBeCloseTo(1, 2)` failed on correct code
  // at 0.9935: the poll returned mid-fade and the tighter assertion rejected
  // what the looser poll had accepted. `marker-rest.spec.ts` records the same
  // lesson for the marker's travel, and this file re-learned it.
  const sounding = await waitForNeedleOpacity(
    page,
    (opacity) => opacity === 1,
    'the needle to be fully drawn while the tone sounds'
  );
  expect(sounding).toBe(1);

  // The fixture's silent stretch is 3 s, well past the filter chain's 400 ms
  // hold, so the readout blanking is the signal that the reading has lapsed.
  await expect(page.getByTestId('note-label')).toHaveText('–', { timeout: 20_000 });

  const faded = await waitForNeedleOpacity(
    page,
    (opacity) => opacity === 0,
    'the needle to fade out after the tone stopped'
  );
  expect(faded, 'the needle is still visible after the reading lapsed').toBe(0);
});

/**
 * FR-162b — and the reason the angle is held rather than reset.
 *
 * Fading is not a terminal state, and the needle must come back where it left:
 * an implementation that unmounted the needle and remounted it would pass the
 * fade case above and then sweep from zero on the next pluck, which is the
 * `hasReading` reset spelled differently.
 */
test('fades back in at the angle it left, when the string sounds again (FR-162b)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');
  await waitForNeedleOpacity(page, (opacity) => opacity === 1, 'the needle to be drawn');

  await expect(page.getByTestId('note-label')).toHaveText('–', { timeout: 20_000 });
  await waitForNeedleOpacity(page, (opacity) => opacity === 0, 'the needle to fade out');

  // Read AFTER the fade completes: the angle must survive the invisible stretch,
  // not merely survive up to the moment it starts.
  const whileFaded = await needleAccumulatedDeg(page);
  expect(whileFaded, 'the needle was unmounted rather than faded').not.toBeNull();

  // The fixture loops, so the tone returns.
  const returned = await waitForNeedleOpacity(
    page,
    (opacity) => opacity === 1,
    'the needle to fade back in when the tone returned'
  );
  expect(returned).toBe(1);

  // Same note, so the same angle — within the detector's own jitter on the
  // first frames after a fresh attack. A needle that had been reset would read
  // a whole turn away, or start from 0.
  const resumed = await needleAccumulatedDeg(page);
  expect(resumed).not.toBeNull();
  expect(Math.abs(resumed! - whileFaded!), 'the needle resumed from somewhere else').toBeLessThan(
    15
  );
});

/**
 * The other half of G22: no alpha in the steady state.
 *
 * The fade is permitted to pass through intermediate values; nothing is allowed
 * to REST at one. A needle sitting at 0.4 would read as a legitimate design
 * choice in a screenshot and be invisible to both the palette test (which checks
 * tokens, not call sites) and Axe (whose contrast rule covers text only) — the
 * exact mechanism that has defeated the 3:1 floor twice in this repo.
 */
test('rests at full strength or at nothing, never in between (G22)', async ({ page }) => {
  test.setTimeout(90_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');

  // Sampled across several seconds so both the sounding and the silent stretch
  // of the fixture are covered, plus the transitions between them.
  const settled: number[] = [];
  for (let i = 0; i < 40; i += 1) {
    const opacity = await needleEffectiveOpacity(page);
    if (opacity !== null) settled.push(opacity);
    await page.waitForTimeout(150);
  }

  expect(settled.length, 'the needle was never drawn').toBeGreaterThan(20);

  // `motion.colorMs` is 180ms against a 150ms sample interval, so at most a
  // handful of samples can legitimately land mid-fade.
  const midway = settled.filter((opacity) => opacity > 0.02 && opacity < 0.98);
  expect(
    midway.length,
    `${midway.length} of ${settled.length} samples caught a partly-dimmed needle: ${midway
      .map((o) => o.toFixed(2))
      .join(', ')}`
  ).toBeLessThan(settled.length / 4);
});
