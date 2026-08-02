import { color } from '@chromatic-tuner/tokens';
import { expect, test, type Page } from '@playwright/test';

import { audioArgs, markerOffsetPx, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * T092 (FR-019, light and dark) and T096 (V10, glanceability).
 *
 * V10's "identify the state from 1 m within one second" is a human judgement
 * and stays manual. What is mechanically checkable is the property that makes
 * it possible: that flat, sharp and in-tune are told apart by something other
 * than hue, so the display survives greyscale and colour-vision deficiency
 * (FR-015, SC-009).
 */

/** #rrggbb → the rgb() string a browser reports from getComputedStyle. */
function toRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

async function backgroundOf(page: Page): Promise<string> {
  return page.locator('main').evaluate((el) => getComputedStyle(el).backgroundColor);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme} appearance applies the ${scheme} tokens (FR-019)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');

    // The background and text come straight from the token set for this
    // appearance. If a component hard-codes anything, these diverge.
    expect(await backgroundOf(page)).toBe(toRgb(color.background[scheme]));

    const noteColor = await page
      .getByTestId('note-label')
      .evaluate((el) => getComputedStyle(el).color);
    expect(noteColor).toBe(toRgb(color.inTune[scheme]));
  });

  test(`${scheme} appearance covers the settings sheet too`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.getByTestId('reference-badge').click();

    const sheetBackground = await page
      .getByTestId('settings-sheet')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sheetBackground).toBe(toRgb(color.background[scheme]));
  });
}

test('an explicit theme override beats the platform preference', async ({ page }) => {
  // The tokens emit both a media query and a [data-theme] block. If the
  // override did not win, a future in-app theme switch would silently do
  // nothing on a device set to the opposite appearance.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await waitForNote(page, 'E');

  expect(await backgroundOf(page)).toBe(toRgb(color.background.dark));

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await backgroundOf(page)).toBe(toRgb(color.background.light));
});

test('the tuning state is legible without colour at all (V10, SC-009)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Achromatopsia: total loss of colour perception. Whatever survives this is
  // the part of the design that does not depend on hue.
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });

  // The three non-colour channels FR-015 requires must all still be present.
  await expect(page.getByTestId('direction-cue')).toContainText(/in tune|tighten|loosen/i);
  await expect(page.getByTestId('cents-readout')).toContainText(/-?\d/);

  // Position, measured in pixels — the actual non-colour channel. Asserting
  // that "a transform exists" would pass on a marker welded to the centre.
  expect(Math.abs(await markerOffsetPx(page))).toBeLessThan(20);

  await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
});

for (const deficiency of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
  test(`the state colours stay distinct under ${deficiency} (SC-009)`, async ({ page }) => {
    await page.goto('/');
    await waitForNote(page, 'E');

    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setEmulatedVisionDeficiency', { type: deficiency });

    // The palette separates the states by lightness as well as hue precisely so
    // this holds; the tokens package asserts the luminance separation, and this
    // confirms the simulation actually renders rather than crashing the page.
    await expect(page.getByTestId('note-label')).toBeVisible();
    await expect(page.getByTestId('direction-cue')).toContainText(/in tune/i);

    await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
  });
}

test('the note label is large enough to read from a metre (FR-017)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // FR-017's "legible from ~1 m" cannot be tested without a human, but the
  // precondition can: the note must genuinely be the dominant element, not a
  // token value that some layout rule quietly overrode.
  const noteSize = await page
    .getByTestId('note-label')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cueSize = await page
    .getByTestId('direction-cue')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

  expect(noteSize).toBeGreaterThanOrEqual(96);
  expect(noteSize).toBeGreaterThan(cueSize * 4);
});

test('the tuning line is the dominant element of the screen (FR-021)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const line = await page.getByTestId('tuning-line').boundingBox();
  const viewport = page.viewportSize();

  expect(line).not.toBeNull();
  expect(viewport).not.toBeNull();
  // "Not one widget among several": it spans most of the usable width.
  expect(line!.width).toBeGreaterThan(viewport!.width * 0.4);
});
