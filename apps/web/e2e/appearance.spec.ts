import AxeBuilder from '@axe-core/playwright';
import { PREFERENCES_STORAGE_KEY } from '@chromatic-tuner/core';
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
    // The sheet is a RAISED surface, so it has its own token — in dark it is
    // lighter than the screen behind it, which is the only thing that says so.
    expect(sheetBackground).toBe(toRgb(color.surface[scheme]));
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

/**
 * User Story 1 (T019, T020) — the in-app control, FR-118.
 *
 * Every test here emulates the appearance OPPOSITE to the one it chooses, and
 * that is not a stylistic choice. "Choose Dark, assert the page is dark" passes
 * on a build where the control does nothing at all, provided the device happens
 * to be dark — which is the single most likely way this feature ships broken.
 * Contradicting the device is what makes the assertion mean "the choice took
 * effect" rather than "something is dark".
 *
 * Persistence is deliberately NOT asserted here. US1 and US2 are different
 * claims, and a control that works for one session is the whole of US1.
 */
async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
}

for (const [device, chosen] of [
  ['light', 'dark'],
  ['dark', 'light'],
] as const) {
  test(`a device set to ${device} renders ${chosen} once ${chosen} is chosen (FR-118)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: device });
    await page.goto('/');
    await waitForNote(page, 'E');

    // The device is in charge until the user says otherwise.
    expect(await backgroundOf(page)).toBe(toRgb(color.background[device]));

    await openSettings(page);
    await page.getByTestId(`appearance-${chosen}`).click();

    // The whole app moved, not just the sheet — FR-118 is "every surface".
    await expect(page.getByTestId(`appearance-${chosen}`)).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page
        .getByTestId('settings-sheet')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    ).toBe(toRgb(color.surface[chosen]));

    await page.getByTestId('settings-close').click();
    expect(await backgroundOf(page)).toBe(toRgb(color.background[chosen]));

    // And the tuner underneath it, which is the surface the user came for.
    const noteColor = await page
      .getByTestId('note-label')
      .evaluate((el) => getComputedStyle(el).color);
    expect(noteColor).toBe(toRgb(color.inTune[chosen]));
  });
}

test('the three options are offered by their plain-language names (FR-124)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await openSettings(page);

  // "Match device", not "System" or "Auto" (research D8). Asserted rather than
  // reviewed, because the mobile screen has to say the same words and nothing
  // else checks that they still agree.
  await expect(page.getByTestId('appearance-system')).toHaveText('Match device');
  await expect(page.getByTestId('appearance-light')).toHaveText('Light');
  await expect(page.getByTestId('appearance-dark')).toHaveText('Dark');

  // System is the default, so it is the chosen one on a fresh profile.
  await expect(page.getByTestId('appearance-system')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('appearance-light')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'false');
});

test('changing appearance does not interrupt the reading or re-ask for the microphone (US1 AS4)', async ({
  page,
}) => {
  // Count real getUserMedia calls. A control that rebuilt the audio graph — by
  // remounting the tree, or by giving TunerProvider a new port identity — would
  // stop the stream and ask again, which on a real device is a permission
  // prompt in the middle of a performance.
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    (window as unknown as { __gumCalls: number }).__gumCalls = 0;
    media.getUserMedia = (constraints?: MediaStreamConstraints) => {
      (window as unknown as { __gumCalls: number }).__gumCalls += 1;
      return original(constraints);
    };
  });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await waitForNote(page, 'E');

  const callsBefore = await page.evaluate(
    () => (window as unknown as { __gumCalls: number }).__gumCalls
  );
  expect(callsBefore, 'the microphone was never opened, so this proves nothing').toBeGreaterThan(0);

  await openSettings(page);
  await page.getByTestId('appearance-dark').click();
  await page.getByTestId('settings-close').click();

  expect(await backgroundOf(page)).toBe(toRgb(color.background.dark));

  // The note is still being read, continuously, after the change — not merely
  // present, which a frozen last-value display would also satisfy.
  await expect(page.getByTestId('note-label')).toContainText('E');
  await expect(page.getByTestId('cents-readout')).toContainText(/-?\d/);
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('note-label')).toContainText('E');

  expect(
    await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls),
    'the microphone was re-requested when the appearance changed'
  ).toBe(callsBefore);
});

/**
 * User Story 2 (T031–T034) — the appearance is right BEFORE React exists.
 *
 * V43 is the scenario that catches the naive implementation. Every other
 * appearance assertion in this file runs after `waitForNote`, by which time a
 * build that flashed white for 400 ms looks identical to one that never did.
 * FR-120's binding word is **before**, so these navigate with
 * `waitUntil: 'commit'` and read the DOM while the app bundle has provably not
 * executed yet.
 *
 * The device is always emulated as the OPPOSITE of what is stored, so nothing
 * but the stored preference can produce the asserted result.
 */
async function seedPreference(page: Page, raw: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key!, value!);
      } catch {
        // Matches the app's own posture: storage may be unavailable, and that
        // must never stop the page loading.
      }
    },
    [PREFERENCES_STORAGE_KEY, raw]
  );
}

function record(appearance: string): string {
  return JSON.stringify({ a4Hz: 440, accidentalStyle: 'sharp', appearance, schemaVersion: 1 });
}

/** The attribute as it stands with the bundle not yet run. */
async function themeAttributeAtCommit(page: Page): Promise<string | null> {
  await page.goto('/', { waitUntil: 'commit' });
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

for (const [stored, device] of [
  ['dark', 'light'],
  ['light', 'dark'],
] as const) {
  test(`a stored ${stored} preference is in effect before the bundle runs (V43, M12, FR-120)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: device });
    await seedPreference(page, record(stored));

    // Read at `commit`: the document has arrived, the inline script in <head>
    // has run, and nothing else has. React setting this later would fail here
    // and pass everywhere else — which is precisely the flash.
    expect(
      await themeAttributeAtCommit(page),
      'data-theme was not set before the app bundle executed'
    ).toBe(stored);

    // T032: still correct once React has mounted and settled. A provider that
    // writes from its DEFAULT state on mount would revert the attribute here.
    await waitForNote(page, 'E');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
      stored
    );
    expect(await backgroundOf(page)).toBe(toRgb(color.background[stored]));
  });
}

test('a stored system preference sets no attribute at all (V43, M12)', async ({ page }) => {
  // The absence is the requirement, not an implementation detail. The tokens
  // emit a `prefers-color-scheme` media query as well as a `[data-theme]`
  // override; leaving the override off is what lets a "Match device" user
  // follow the OS with no JavaScript running at all.
  await page.emulateMedia({ colorScheme: 'dark' });
  await seedPreference(page, record('system'));

  expect(await themeAttributeAtCommit(page)).toBeNull();

  await waitForNote(page, 'E');
  expect(
    await page.evaluate(() => document.documentElement.getAttribute('data-theme')),
    'React pinned the override on for a user who asked to match the device'
  ).toBeNull();
  // The media query is still in charge, so the page is dark because the device is.
  expect(await backgroundOf(page)).toBe(toRgb(color.background.dark));
});

for (const [name, raw] of [
  ['unparseable JSON', 'not json'],
  ['a value outside the union', '{"appearance":"chartreuse"}'],
  ['a record with no appearance at all', '{"a4Hz":440}'],
] as const) {
  test(`${name} leaves the media query in charge, with no console error (V44, M12)`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.emulateMedia({ colorScheme: 'dark' });
    await seedPreference(page, raw);

    // Degrades to today's behaviour, never to the wrong appearance.
    expect(await themeAttributeAtCommit(page)).toBeNull();

    await waitForNote(page, 'E');
    expect(await backgroundOf(page)).toBe(toRgb(color.background.dark));
    expect(errors, `the fail-safe path logged: ${errors.join(' | ')}`).toEqual([]);
  });
}

test('nothing stored at all still leaves the media query in charge (V44)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/', { waitUntil: 'commit' });

  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
  await waitForNote(page, 'E');
  expect(await backgroundOf(page)).toBe(toRgb(color.background.dark));
});

/**
 * User Story 3 (T042, T043) — following the device, and provably not following.
 *
 * The pair is the point. "The app follows the device" passes for an app that
 * follows it *always*, which is FR-116's failure; "the app ignores the device"
 * passes for one that never follows it, which is FR-115's. Neither test means
 * anything without the other.
 */
test('a stored system preference follows the device live, with no reload (V47, FR-115)', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await seedPreference(page, record('system'));
  await page.goto('/');
  await waitForNote(page, 'E');

  expect(await backgroundOf(page)).toBe(toRgb(color.background.light));

  // Changed AFTER load, with no navigation. The page is still the one that
  // rendered a moment ago.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => backgroundOf(page)).toBe(toRgb(color.background.dark));

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => backgroundOf(page)).toBe(toRgb(color.background.light));
});

test('a stored explicit preference never follows the device (V47, FR-116)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await seedPreference(page, record('dark'));
  await page.goto('/');
  await waitForNote(page, 'E');

  expect(await backgroundOf(page)).toBe(toRgb(color.background.dark));

  // Both directions, after load. Without this, the live-follow test above is
  // satisfied by an app that ignores the stored preference entirely.
  for (const colorScheme of ['dark', 'light', 'dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      await backgroundOf(page),
      `the app moved when the device became ${colorScheme}, against an explicit choice`
    ).toBe(toRgb(color.background.dark));
  }
});

/**
 * The browser's own widgets follow the choice too (FR-118, FR-129).
 *
 * `index.html` declares `<meta name="color-scheme" content="light dark">`, which
 * tells the UA to style its built-in controls from the OS preference. That was
 * exactly right while the OS was the only thing with an opinion. With an in-app
 * override it is no longer enough: the settings sheet contains a real
 * `<input type="range">`, and on a light OS with Dark chosen the slider renders
 * in light UA chrome on a dark sheet.
 *
 * Asserted on the computed `color-scheme` of the root rather than on the
 * slider's pixels, because that property IS the mechanism — the UA decides its
 * widget rendering from it, and no component style can override that.
 */
for (const [stored, device] of [
  ['dark', 'light'],
  ['light', 'dark'],
] as const) {
  test(`an explicit ${stored} choice sets color-scheme for UA widgets too (FR-118)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: device });
    await seedPreference(page, record(stored));
    await page.goto('/');
    await waitForNote(page, 'E');

    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      'the UA still styles its own controls from the device, not the choice'
    ).toBe(stored);
  });
}

test('a system preference leaves both schemes on offer, as the meta tag intends', async ({
  page,
}) => {
  // Not `light` or `dark`: under "Match device" the UA should keep deciding for
  // itself, which is what `light dark` means. Pinning either one here would be
  // the same mistake as pinning `data-theme`.
  await page.emulateMedia({ colorScheme: 'dark' });
  await seedPreference(page, record('system'));
  await page.goto('/');
  await waitForNote(page, 'E');

  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'light dark'
  );
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
 * The chosen accidental is marked by a fill, not by a heavier border (FR-015).
 *
 * The original treatment gave both options a 2px border and changed only its
 * colour — `text` when selected, `line` when not. Two problems.
 *
 * The first is that a 2px `text` outline is the app's focus idiom, not its
 * selection idiom: `main.tsx` draws `:focus-visible` as a 3px `text` outline at
 * a 2px offset, so the resting selected state and the keyboard focus ring were
 * the same colour a pixel apart. Tabbing to the *unselected* option grew a ring
 * that looked like the thing meaning "chosen".
 *
 * The second is that greyscale separation by stroke colour alone is thin —
 * `text` against `line` is the only channel, over a 1-2px band. Filling the box
 * moves a whole surface instead.
 *
 * The fill is the `selected` tint, NOT `text`. This was built with `text`
 * first — the app's existing solid-button fill — and that overcorrected: it is
 * the primary-action treatment, so a passive preference became the loudest
 * thing in the sheet, louder than Done and Reset. The tint is what iOS and
 * Material use for a chosen segment, and it keeps the label as `text` rather
 * than inverting it.
 *
 * The tint is a smaller colour-free step than an inversion, which is why the
 * bold weight and the border are still here rather than being dropped as
 * redundant. `packages/tokens` bounds the step on both sides.
 *
 * Both borders stay the same width so the row cannot resize on toggle; the
 * geometry half of that is `layout-stability.spec.ts`.
 */
for (const scheme of ['light', 'dark'] as const) {
  test(`the chosen accidental is filled, not outlined, in ${scheme} (FR-015)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.getByTestId('reference-badge').click();
    await expect(page.getByTestId('settings-sheet')).toBeVisible();

    const read = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => {
        const own = getComputedStyle(el);
        return {
          background: own.backgroundColor,
          color: own.color,
          borderWidth: parseFloat(own.borderTopWidth),
          borderColor: own.borderTopColor,
        };
      });

    // Sharps is the default, so it is the selected one on a fresh profile.
    const selected = await read('accidental-sharp');
    const unselected = await read('accidental-flat');

    expect(selected.background, 'the chosen option is not filled with the `selected` tint').toBe(
      toRgb(color.selected[scheme])
    );
    // Not inverted. A tinted container keeps its label in `text`, which is what
    // stops the control from reading as a primary action.
    expect(selected.color, "the chosen option's label left `text`").toBe(toRgb(color.text[scheme]));
    expect(
      selected.background,
      'the chosen option is filled with the primary-action colour'
    ).not.toBe(toRgb(color.text[scheme]));

    // The unselected option stays a ghost control: transparent, 1px `line`.
    // FR-052 still holds — it carries a border at rest, so it reads as a
    // control before anything hovers it.
    expect(unselected.background, 'the unchosen option is filled').toMatch(
      /rgba\([^)]*,\s*0\)|transparent/
    );
    expect(unselected.borderColor, 'the unchosen option is not bordered in `line`').toBe(
      toRgb(color.line[scheme])
    );

    // What each box actually renders, not what it declares. A transparent
    // element computes to rgba(0,0,0,0), so comparing declared backgrounds
    // would report a difference between the two options even when both are
    // ghosts — which is exactly the state this replaced. Resolving through to
    // the first painted ancestor is what makes the assertion mean "these two
    // boxes look different", and it is the check that fails on a pair
    // distinguished by stroke colour alone.
    const rendered = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const own = getComputedStyle(node).backgroundColor;
          if (!/rgba\([^)]*,\s*0\)/.test(own)) return own;
        }
        return 'transparent';
      });

    expect(
      await rendered('accidental-flat'),
      'the unchosen option paints something other than the sheet beneath it'
    ).toBe(toRgb(color.surface[scheme]));
    expect(
      await rendered('accidental-sharp'),
      'the two options render the same surface, so only the stroke tells them apart'
    ).not.toBe(await rendered('accidental-flat'));

    // The selection cue must not be the focus idiom. The ring is 3px; anything
    // at rest has to sit clearly below it or the two read as the same signal.
    expect(selected.borderWidth, 'the resting border is as heavy as the focus ring').toBeLessThan(
      3
    );
    expect(
      selected.borderWidth,
      'the two options have different border widths, so the row resizes on toggle'
    ).toBe(unselected.borderWidth);
  });
}

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
