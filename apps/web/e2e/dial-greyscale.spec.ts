import { expect, test } from '@playwright/test';

import {
  audioArgs,
  expectOneEmphasisedLabel,
  greyscaleChannels,
  useDial,
  waitForNote,
  withoutColour,
} from './helpers';

test.use(audioArgs('d3-flat-25.wav'));

/**
 * V68 / SC-070 — sharp, flat and in tune are each identifiable with the colour
 * taken away.
 *
 * Colour is this app's fastest signal and Principle IV forbids it being the
 * only one. On the horizontal display the non-hue channels are the marker's
 * side of centre and the FLAT/SHARP labels either end; on the dial they are the
 * needle's side of the segment's target mark, the active label's weight, and
 * the direction cue — and none of those had a test, because every existing dial
 * assertion is about position under full colour.
 *
 * What the emulation does and does not do is worth stating, since it looks like
 * it should be doing more. `Emulation.setEmulatedVisionDeficiency` changes what
 * is PAINTED and nothing about the DOM, so no assertion below reads a colour:
 * measuring one under achromatopsia returns exactly the value measured without
 * it. The emulation is here so the trace and any screenshot taken from a
 * failure show what the player would see, while the assertions are made against
 * the three channels that carry no hue in the first place.
 *
 * The luminance half of the question is not repeated here — a WCAG contrast
 * ratio is computed from relative luminance alone, so `a11y.spec.ts`'s
 * composited floors are already greyscale measurements, and the tokens package
 * separately pins flat, sharp and in-tune to distinct luminances.
 */
test('a flat string is readable with no colour at all (V68, SC-070)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await withoutColour(page);
  await waitForNote(page, 'D');

  const { offset, weights, cue } = await greyscaleChannels(page);

  // 25 cents flat is 7.5 degrees ANTICLOCKWISE of the segment's centre. The
  // tolerance is loose for the same reason `expectNeedleAt`'s is: the sign is
  // the channel, and it is 7.5 degrees from zero rather than a hair from it.
  expect(offset, `the needle is ${offset.toFixed(1)}° from the target mark`).toBeLessThan(-3);
  expectOneEmphasisedLabel(weights);
  expect(cue).toMatch(/TIGHTEN/i);
});
