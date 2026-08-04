import AxeBuilder from '@axe-core/playwright';
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

/**
 * User Story 4 (T036): the reference control survives greyscale, and the
 * non-standard state stays louder than the standard one.
 *
 * The second half is the constraint that makes this story awkward. FR-052 wants
 * the standard state to look pressable; FR-053 requires the non-standard state
 * to stay *more* prominent, because a reference pitch someone else left at 432
 * must never be a silent surprise (FR-022). Promoting the quiet state without
 * flattening the loud one is the whole design problem.
 */
async function referenceStyles(page: Page, nonStandard: boolean) {
  if (nonStandard) {
    await page.getByTestId('reference-badge').click();
    await page.getByTestId('a4-slider').fill('432');
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('reference-badge')).toHaveAttribute('data-non-standard', 'true');
  }

  return page.getByTestId('reference-badge').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      borderColor: style.borderTopColor,
      color: style.color,
      fontWeight: Number(style.fontWeight),
    };
  });
}

test('the reference control reads as interactive under achromatopsia (FR-052, FR-015)', async ({
  page,
}) => {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });

  await page.goto('/');
  await waitForNote(page, 'E');

  const badge = page.getByTestId('reference-badge');
  await expect(badge).toBeVisible();

  // A border is a shape, not a hue, so it is the channel that survives here —
  // which is why the fix is a border rather than a brighter colour.
  const border = await badge.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.borderTopColor, width: parseFloat(style.borderTopWidth) };
  });

  expect(border.width).toBeGreaterThan(0);
  expect(border.color).not.toMatch(/rgba\([^)]*,\s*0\)/);
});

test('a non-standard reference stays louder than the standard one (FR-053, FR-022)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const standard = await referenceStyles(page, false);
  const nonStandard = await referenceStyles(page, true);

  // Two channels, so the distinction survives greyscale on weight alone: the
  // attention colour AND a heavier weight. Giving the standard state a border
  // must not collapse either of them.
  expect(nonStandard.fontWeight).toBeGreaterThan(standard.fontWeight);
  expect(nonStandard.color).not.toBe(standard.color);
});

/**
 * FR-070: the supporting content is themed and legible in both appearances.
 *
 * The content section is markup in the served document, styled by a stylesheet
 * the build emits rather than by a component — so nothing about the React tree
 * covers it, and it is the part of this page most easily left on the browser's
 * default colours. Before 003 the background was painted by `<main>`, which
 * covers only the fold; below it the canvas would have been white in dark mode.
 *
 * Contrast is asserted with Axe rather than a second copy of the WCAG
 * luminance formula. Axe measures the **composited** result, which is the
 * distinction that matters here: `001` shipped a correct colour token at
 * `opacity: 0.55` measuring 3.9:1 against its background, and the tokens
 * package's own contrast test could not see it because it checks the palette
 * rather than what lands on the page.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`the supporting content is themed in ${scheme} (FR-070)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');

    const styles = await page.getByTestId('site-content').evaluate((el) => {
      const own = getComputedStyle(el);
      return { color: own.color, background: getComputedStyle(document.body).backgroundColor };
    });

    expect(styles.background, `the page canvas is not the ${scheme} background token`).toBe(
      toRgb(color.background[scheme])
    );
    expect(styles.color, `the content text is not the ${scheme} text token`).toBe(
      toRgb(color.text[scheme])
    );
  });

  test(`the supporting content meets AA contrast in ${scheme} (FR-070)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.getByTestId('site-content').scrollIntoViewIfNeeded();

    const results = await new AxeBuilder({ page })
      .include('#site-content')
      .withRules(['color-contrast'])
      .analyze();

    expect(
      results.violations,
      results.violations
        .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.failureSummary ?? ''}`))
        .join('\n')
    ).toEqual([]);
  });
}
