import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  activeTestId,
  audioArgs,
  openSettings,
  useDial,
  waitForNeedleAngle,
  waitForNote,
} from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * V11 / SC-013 — WCAG 2.1 AA, automated half.
 *
 * Axe catches the mechanical failures: unlabelled controls, contrast, bad ARIA,
 * broken landmark structure. It cannot judge whether an announcement is
 * *useful*, so the announcer's wording is asserted directly further down and
 * the VoiceOver/TalkBack passes stay manual, as the quickstart says.
 *
 * The token palette already has its own contrast test in `packages/tokens`;
 * this checks the colours as they actually land on the page, which is a
 * different question — a token can be correct and still be applied to the wrong
 * background.
 */
async function analyze(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}

test('the tuner screen has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('the settings sheet has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('the permission explainer has no accessibility violations', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.permissions.query = async () =>
      ({
        state: 'prompt',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as PermissionStatus;
  });
  await page.goto('/');
  await expect(page.getByTestId('permission-prompt')).toBeVisible();

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('announces the reading as one sentence, not four fragments (FR-020)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const announcer = page.getByTestId('sr-announcer');
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  // aria-atomic matters: without it a screen reader may read only the changed
  // words, which turns "E 2, in tune." into "in tune" with no note attached.
  await expect(announcer).toHaveAttribute('aria-atomic', 'true');
  await expect(announcer).toContainText(/E 2, .*(in tune|cents)/);

  // Exactly one live region while reading. Two polite regions interrupt each
  // other, which is how the direction cue used to talk over the status banner.
  const liveRegions = await page.locator('[aria-live]:not([aria-hidden="true"])').count();
  expect(liveRegions).toBe(1);
});

test('does not announce the visual channels a second time', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Each of these is a redundant visual rendering of what the announcer says.
  for (const id of ['note-label', 'cents-readout', 'tuning-line', 'direction-cue']) {
    await expect(page.getByTestId(id)).toHaveAttribute('aria-hidden', 'true');
  }
});

/**
 * V70 / G24 / FR-164 — the dial says nothing to a screen reader.
 *
 * Three separate claims, because they fail separately:
 *
 * 1. Nothing inside the circle reaches the accessibility tree. Asserted by
 *    walking each mark's ANCESTORS for `aria-hidden`, not by reading the
 *    attribute off the mark — `aria-hidden` on a container hides its whole
 *    subtree, so a needle with no attribute of its own is correctly hidden and
 *    an assertion on the element alone would report the opposite.
 * 2. The announcer is unchanged. The dial replaces a visual channel, not a
 *    spoken one, so the sentence and the number of live regions must be exactly
 *    what the line produces.
 * 3. Axe finds nothing on the dial. The whole existing suite runs against the
 *    default display, so before this the dial had never been analysed at all.
 */
test('the dial is silent to assistive technology (V70, G24, FR-164)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');
  await waitForNeedleAngle(page);

  const exposure = await page.evaluate(() => {
    const hiddenByAnAncestor = (el: Element): boolean => {
      let node: Element | null = el;
      while (node) {
        if (node.getAttribute('aria-hidden') === 'true') return true;
        node = node.parentElement;
      }
      return false;
    };

    const marks = [
      ...document.querySelectorAll(
        '[data-testid="tuning-dial"], [data-testid="dial-rim"], [data-testid="dial-tick"], [data-testid="dial-target"], [data-testid="dial-label"], [data-testid="dial-needle"], [data-testid="dial-needle-wrapper"], [data-testid="dial-hub"]'
      ),
    ];

    return {
      total: marks.length,
      exposed: marks
        .filter((el) => !hiddenByAnAncestor(el))
        .map((el) => el.getAttribute('data-testid')),
      dialIsHidden:
        document.querySelector('[data-testid="tuning-dial"]')?.getAttribute('aria-hidden') ===
        'true',
    };
  });

  // The rim, twelve ticks, the target, twelve labels, the needle and its
  // wrapper, the hub and the dial itself. Counted so the filter below cannot
  // pass on an empty list — which is what a renamed test id would produce.
  expect(exposure.total, 'found none of the dial to check').toBeGreaterThanOrEqual(28);
  expect(exposure.exposed, 'part of the dial is reachable by assistive technology').toEqual([]);
  expect(exposure.dialIsHidden).toBe(true);

  // The announcer is untouched — same sentence, and still the only live region.
  const announcer = page.getByTestId('sr-announcer');
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  await expect(announcer).toHaveAttribute('aria-atomic', 'true');
  await expect(announcer).toContainText(/E 2, .*(in tune|cents)/);
  expect(await page.locator('[aria-live]:not([aria-hidden="true"])').count()).toBe(1);
});

test('the tuner screen with the dial has no accessibility violations', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('every interactive control is labelled and meets the touch target floor', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();

  const controls = page.locator(
    'button:visible, input:visible, [role="button"]:visible, [role="slider"]:visible'
  );
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const name = await control.evaluate((el) => {
      const label = el.getAttribute('aria-label');
      return label ?? el.textContent?.trim() ?? '';
    });
    expect(name, `control ${i} has no accessible name`).not.toBe('');

    // Principle IV: 44x44 minimum. Measured on the rendered box, because a
    // token value that never reaches the element proves nothing.
    const box = await control.boundingBox();
    expect(box, `control "${name}" has no box`).not.toBeNull();
    expect(box!.height, `control "${name}" is only ${box!.height}px tall`).toBeGreaterThanOrEqual(
      44
    );
  }
});

test('is fully operable from the keyboard (SC-013)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Tab must reach the only control on the tuner screen, and it must show a
  // focus ring — Principle IV requires visible focus, and these controls
  // override the browser default styling.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('reference-badge')).toBeFocused();

  const outline = await page
    .getByTestId('reference-badge')
    .evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(outline).not.toBe('0px');

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-sheet')).toHaveCount(0);
});

/**
 * User Story 4 (T035): the reference-pitch control must read as a control.
 *
 * Checks the COMPOSITED result, not the palette. `001` shipped a correct colour
 * token at `opacity: 0.55` that measured 3.9:1 against the background — the
 * tokens package's own contrast test could not see it, because it checks the
 * palette and Axe checks what lands on the page. Both are needed, and this is
 * the case that proves it.
 */
async function badgeStyles(page: Page) {
  return page.evaluate(() => {
    const node = document.querySelector('[data-testid="reference-badge"]')!;
    const style = getComputedStyle(node);

    // Walk up for the first non-transparent background, which is what the
    // border and text are actually composited against.
    let backdrop: Element | null = node;
    let background = 'rgba(0, 0, 0, 0)';
    while (backdrop) {
      const value = getComputedStyle(backdrop).backgroundColor;
      if (value && !/rgba\(0, 0, 0, 0\)|transparent/.test(value)) {
        background = value;
        break;
      }
      backdrop = backdrop.parentElement;
    }

    return {
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      color: style.color,
      opacity: style.opacity,
      fontWeight: style.fontWeight,
      background,
    };
  });
}

/** Relative luminance contrast, the same ratio WCAG defines. */
function contrast(a: string, b: string): number {
  const parse = (value: string) => {
    const [r, g, b2] = value.match(/[\d.]+/g)!.map(Number) as [number, number, number];
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b2);
  };
  const [light, dark] = [parse(a), parse(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`the reference control is visibly interactive at 440 in ${scheme} (FR-052, FR-054)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');

    const styles = await badgeStyles(page);

    // Before the fix: `border: 1px solid transparent`, so this is zero alpha.
    expect(styles.borderColor, 'the standard state needs a visible border').not.toMatch(
      /rgba\([^)]*,\s*0\)/
    );
    expect(parseFloat(styles.borderWidth)).toBeGreaterThan(0);

    // 3:1 is the AA floor for a meaningful graphic, which is what a border
    // carrying "this is pressable" is.
    expect(
      contrast(styles.borderColor, styles.background),
      `border ${styles.borderColor} on ${styles.background}`
    ).toBeGreaterThanOrEqual(3);

    // Before the fix the text sat at opacity 0.6, which is the mechanism that
    // defeated a correct token in `001`.
    expect(parseFloat(styles.opacity)).toBe(1);
    expect(contrast(styles.color, styles.background)).toBeGreaterThanOrEqual(4.5);
  });

  test(`Axe is clean with a non-standard reference in ${scheme} (FR-054)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');

    await page.getByTestId('reference-badge').click();
    await page.getByTestId('a4-slider').fill('432');
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('reference-badge')).toHaveAttribute('data-non-standard', 'true');

    const results = await analyze(page);
    expect(
      results.violations,
      results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
    ).toEqual([]);
  });
}

/**
 * FR-070 / FR-071: the supporting content is as accessible as the tuner.
 *
 * The content section is markup in the served document rather than a React
 * component, which makes it easy to forget it is subject to the same
 * obligations as everything else — Axe over the whole page catches it because
 * it does not care where the markup came from.
 */
test('the supporting content has no accessibility violations (FR-070)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('site-content').scrollIntoViewIfNeeded();

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

/**
 * The document outline is `h1` then `h2`s, with no level skipped.
 *
 * Axe's `heading-order` rule covers this, but only as one violation among
 * dozens; asserting the sequence directly means a broken outline reports the
 * actual sequence rather than a rule id.
 */
test('the heading outline descends without skipping a level (P3)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const levels = await page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((node) =>
      Number(node.tagName.slice(1))
    )
  );

  expect(levels[0], `the first heading is an h${levels[0]}, not an h1`).toBe(1);

  const skips = levels
    .map((level, index) => ({ level, previous: levels[index - 1] ?? level }))
    .filter(({ level, previous }) => level - previous > 1)
    .map(({ level, previous }) => `h${previous} → h${level}`);

  expect(skips, `the outline skips heading levels: ${skips.join(', ')}`).toEqual([]);
});

/**
 * FR-071: the content is reachable from the keyboard, and skippable.
 *
 * The requirement has two halves that pull against each other — the content
 * must be reachable *after* the tuner, and a keyboard user must not have to
 * traverse it to get back to the controls. Both hold here for a structural
 * reason worth asserting rather than assuming: the content contains **no**
 * focusable elements at all, so tab order is unchanged from before this feature
 * and there is nothing to traverse.
 *
 * If a link is ever added to the copy, this fails — correctly. That is the
 * moment to think about skip links, not before.
 */
test('the supporting content adds nothing to the tab order (FR-071)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const focusableInContent = await page.evaluate(
    () =>
      document.querySelectorAll(
        '#site-content a[href], #site-content button, #site-content input, #site-content select, #site-content textarea, #site-content [tabindex]:not([tabindex="-1"])'
      ).length
  );

  expect(
    focusableInContent,
    'the content section now has focusable elements — keyboard users must still be able to reach the tuner controls without traversing the prose (FR-071)'
  ).toBe(0);

  // The scroll cue must not be focusable either: `a11y.spec.ts` above asserts
  // the first Tab lands on the reference control, and the cue precedes it in
  // nothing but visual order.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('reference-badge')).toBeFocused();
});

/**
 * T050 / T052 — the appearance group, at the two places option groups fail.
 *
 * Both are regression tests for defects this repo has already paid for once, on
 * the accidentals group the appearance group deliberately copies (research D8).
 * Reuse inherits the fix; it does not prove the fix still holds, which is what
 * these do.
 */
const APPEARANCE_OPTIONS = ['system', 'light', 'dark'] as const;

async function optionBox(page: Page, value: string) {
  return page.getByTestId(`appearance-${value}`).evaluate((el) => {
    const own = getComputedStyle(el);
    return {
      background: own.backgroundColor,
      borderWidth: parseFloat(own.borderTopWidth),
      fontWeight: Number(own.fontWeight),
      outlineWidth: parseFloat(own.outlineWidth),
    };
  });
}

test('a focused but unchosen option never reads as the chosen one (T050, FR-126)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  // 'system' is the default, so 'dark' is unchosen. Focus it with the keyboard,
  // which is the only way to get :focus-visible.
  await page.getByTestId('appearance-dark').focus();
  await expect(page.getByTestId('appearance-dark')).toBeFocused();

  const focusedUnchosen = await optionBox(page, 'dark');
  const chosen = await optionBox(page, 'system');

  // The exact defect `500dfb5` fixed: the focus ring WAS the selection idiom, so
  // tabbing to an option made it look chosen. The ring may exist — it must, for
  // Principle IV — but the two states must still be told apart by the fill.
  expect(focusedUnchosen.outlineWidth, 'the focused option has no visible ring').toBeGreaterThan(0);
  expect(
    focusedUnchosen.background,
    'a focused but unchosen option is filled like the chosen one'
  ).not.toBe(chosen.background);
  expect(
    focusedUnchosen.fontWeight,
    'a focused but unchosen option carries the chosen weight'
  ).toBeLessThan(chosen.fontWeight);

  // And the resting selection cue must sit clearly below the ring, or the two
  // read as one signal.
  expect(chosen.borderWidth).toBeLessThan(3);
  expect(chosen.borderWidth).toBe(focusedUnchosen.borderWidth);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the chosen option survives greyscale in ${scheme} (T052, FR-126, SC-052)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.getByTestId('reference-badge').click();

    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });

    // Two non-hue channels, either of which alone would be thin: a filled
    // surface and a heavier label. Asserted under total colour loss, which is
    // what "identifiable without hue" actually means.
    const chosen = await optionBox(page, 'system');
    for (const other of ['light', 'dark'] as const) {
      const unchosen = await optionBox(page, other);
      expect(chosen.background, `${other} is filled like the chosen option`).not.toBe(
        unchosen.background
      );
      expect(chosen.fontWeight).toBeGreaterThan(unchosen.fontWeight);
    }

    await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
  });

  test(`every appearance option meets AA in ${scheme}, chosen or not (T052, FR-127)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');
    await page.getByTestId('reference-badge').click();

    // Each option is checked while it is the chosen one, because the `selected`
    // tint changes what its label is composited against — the state Axe would
    // never see if only the default selection were analysed.
    for (const value of APPEARANCE_OPTIONS) {
      await page.getByTestId(`appearance-${value}`).click();
      await expect(page.getByTestId(`appearance-${value}`)).toHaveAttribute('aria-pressed', 'true');

      const results = await new AxeBuilder({ page })
        .include('[data-testid="settings-sheet"]')
        .withRules(['color-contrast'])
        .analyze();

      expect(
        results.violations,
        `${value} chosen, ${scheme}: ${results.violations
          .flatMap((v) => v.nodes.map((n) => n.failureSummary ?? ''))
          .join('\n')}`
      ).toEqual([]);
    }
  });
}

/**
 * The way into settings has to look like the way into settings.
 *
 * The reference badge is the tuner screen's only control and it opens the
 * settings sheet — but its visible label is a reference pitch, so nothing about
 * it said "settings" to a sighted user. Assistive technology was already told:
 * the accessible name has begun with "Settings." since `001`. This closes the
 * gap the other way round.
 *
 * The gear is decoration, so it must be hidden from assistive technology —
 * otherwise the name gains a stray glyph and the one channel that was already
 * correct gets worse.
 */
test('the settings entry point carries a gear, hidden from assistive technology', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const badge = page.getByTestId('reference-badge');

  // Visible to the eye...
  await expect(badge).toContainText('⚙');

  // ...and absent from the name a screen reader reads, which still leads with
  // the word that matters.
  const name = await badge.evaluate((el) => el.getAttribute('aria-label'));
  expect(name).toMatch(/^Settings\./);
  expect(name, 'the gear leaked into the accessible name').not.toContain('⚙');

  // The pitch is still the thing being read out, and the gear trails it.
  const text = (await badge.textContent()) ?? '';
  expect(text).toMatch(/A4\s*440 Hz\s*⚙/);
});

/**
 * The ruler itself must clear the 3:1 non-text contrast floor (WCAG 2.1 1.4.11).
 *
 * Nothing could see this before. The tokens package asserts `line` at 3.8:1, but
 * it checks the PALETTE — it cannot see an `opacity` multiplier applied at the
 * call site. Axe measures the composite, but its `color-contrast` rule covers
 * text only, so a dimmed `<div>` rule is invisible to it. The `FLAT`/`SHARP`
 * labels a few lines away in `TuningLine.tsx` carry a comment about exactly this
 * class of bug being found in their own opacity — and the graphics beside them
 * kept theirs.
 *
 * So this composites by hand, which is the only way to check a graphic: take the
 * element's own colour and opacity, blend it over what it actually sits on, and
 * measure that.
 */
function luminanceOf([r, g, b]: number[]): number {
  const channel = (v: number) => {
    const c = v! / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrastOfRgb(a: number[], b: number[]): number {
  const [hi, lo] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`the tuning line and its ticks meet 3:1 in ${scheme} (FR-017, FR-021)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');

    const measured = await page.evaluate(() => {
      const parse = (c: string) => c.match(/\d+(\.\d+)?/g)!.map(Number);
      const backdrop = parse(getComputedStyle(document.querySelector('main')!).backgroundColor);

      const read = (el: Element) => {
        const style = getComputedStyle(el);
        const own = parse(style.backgroundColor);
        const alpha = Number(style.opacity);
        // What the eye receives: the element's colour blended over the surface
        // beneath it by its own opacity.
        return {
          composited: own.slice(0, 3).map((c, i) => c * alpha + backdrop[i]! * (1 - alpha)),
          backdrop,
        };
      };

      const rule = read(document.querySelector('[data-testid="tuning-rule"]')!);
      const ticks = [...document.querySelectorAll('[data-testid="tuning-tick"]')].map((t) => ({
        major: t.getAttribute('data-major') === 'true',
        ...read(t),
      }));
      return { rule, ticks };
    });

    expect(
      contrastOfRgb(measured.rule.composited, measured.rule.backdrop),
      'the horizontal rule is under the 3:1 graphic floor'
    ).toBeGreaterThanOrEqual(3);

    expect(measured.ticks.length).toBeGreaterThan(4);
    for (const tick of measured.ticks) {
      expect(
        contrastOfRgb(tick.composited, tick.backdrop),
        `a ${tick.major ? 'major' : 'minor'} tick is under the 3:1 graphic floor`
      ).toBeGreaterThanOrEqual(3);
    }
  });
}

/**
 * V67 / G22 / FR-167 — the dial's marks, composited, in both appearances.
 *
 * The dial is the ruler's problem again and worse. Nothing else can see it:
 *
 * - the tokens test checks the PALETTE, so an `opacity` applied at a call site
 *   is invisible to it — the exact hole that shipped the FLAT/SHARP labels at
 *   0.55 and the ruler and its ticks at 0.6/0.5;
 * - Axe's `color-contrast` rule covers TEXT only, so a dimmed graphic passes;
 * - and the dial is `aria-hidden` (G24), so Axe skips its twelve labels
 *   entirely. Text that would normally be Axe's own business is not.
 *
 * So every mark is composited by hand, as the ruler's are. Two things this does
 * that the ruler's version does not, both because of how the dial is built:
 *
 * 1. The alpha is accumulated up the ANCESTOR CHAIN rather than read off the
 *    element. Every mark here sits inside at least one wrapper — the rotation
 *    has to go on a dial-sized concentric element (G21) — and the needle's fade
 *    lives on its wrapper while its colour lives on itself. An opacity on any
 *    ancestor dims the mark exactly as one on the mark would, and reading the
 *    element alone would not see it.
 * 2. It asserts that the accumulated alpha is exactly 1. That is G22 stated as
 *    behaviour rather than as a source grep: a steady-state multiplier is
 *    forbidden outright, so a mark that still clears its floor at 0.8 is a
 *    failure of the rule even though it is not yet a failure of contrast. The
 *    lapsed needle's fade to zero is the single exception, and it is not in the
 *    steady state this test measures.
 */
async function dialMarkContrast(page: Page) {
  const measured = await page.evaluate(() => {
    const parse = (c: string) => c.match(/\d+(\.\d+)?/g)!.map(Number);
    const backdrop = parse(getComputedStyle(document.querySelector('main')!).backgroundColor);

    /**
     * Every opacity between this element and the document, multiplied.
     *
     * A group's opacity applies to the group as a whole, so a mark inside three
     * wrappers is dimmed by all of them. Walking the chain is what makes this
     * measure what the eye receives rather than what one element declares.
     */
    const effectiveAlpha = (el: Element): number => {
      let alpha = 1;
      let node: Element | null = el;
      while (node) {
        alpha *= Number(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      return alpha;
    };

    const read = (el: Element, channel: 'background' | 'border' | 'text') => {
      const style = getComputedStyle(el);
      const own = parse(
        channel === 'background'
          ? style.backgroundColor
          : channel === 'border'
            ? style.borderTopColor
            : style.color
      );
      // A colour's own fourth channel dims it exactly as an `opacity` does, and
      // is a second way to write the same defect.
      const alpha = effectiveAlpha(el) * (own.length > 3 ? own[3]! : 1);
      return {
        composited: own.slice(0, 3).map((c, i) => c * alpha + backdrop[i]! * (1 - alpha)),
        alpha,
      };
    };

    const all = (selector: string) => [...document.querySelectorAll(selector)];

    return {
      backdrop,
      rim: read(document.querySelector('[data-testid="dial-rim"]')!, 'border'),
      // The coloured bar inside each rotated wrapper, not the wrapper itself —
      // the wrapper is a transparent square the size of the whole dial.
      ticks: all('[data-testid="dial-tick"] > *').map((el) => read(el, 'background')),
      target: read(document.querySelector('[data-testid="dial-target"] > *')!, 'background'),
      needle: read(document.querySelector('[data-testid="dial-needle"]')!, 'background'),
      labels: all('[data-testid="dial-label"]').map((el) => read(el, 'text')),
    };
  });

  return measured;
}

for (const scheme of ['light', 'dark'] as const) {
  test(`the dial's marks meet their contrast floors in ${scheme} (V67, G22, FR-167)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await useDial(page);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await waitForNote(page, 'E');
    // The needle is not drawn until something has been heard (FR-163), so this
    // waits for an angle rather than for the note alone — otherwise the read
    // below lands in the window where there is no needle to measure.
    await waitForNeedleAngle(page);

    const measured = await dialMarkContrast(page);

    // Vacuity guards. Every assertion below is a `for` over a list, and an
    // empty list passes all of them.
    expect(measured.ticks, 'the dial drew no boundary ticks').toHaveLength(12);
    expect(measured.labels, 'the dial drew no segment labels').toHaveLength(12);

    const graphics = [
      ['the rim', measured.rim] as const,
      ['the needle', measured.needle] as const,
      ['the target mark', measured.target] as const,
      ...measured.ticks.map((tick, i) => [`boundary tick ${i}`, tick] as const),
    ];

    for (const [name, mark] of graphics) {
      expect(
        contrastOfRgb(mark.composited, measured.backdrop),
        `${name} is under the 3:1 graphic floor in ${scheme}`
      ).toBeGreaterThanOrEqual(3);
      expect(mark.alpha, `${name} is drawn at ${mark.alpha}, and G22 forbids any`).toBe(1);
    }

    for (const [i, label] of measured.labels.entries()) {
      expect(
        contrastOfRgb(label.composited, measured.backdrop),
        `segment label ${i} is under the 4.5:1 text floor in ${scheme}`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        label.alpha,
        `segment label ${i} is drawn at ${label.alpha}, and G22 forbids any`
      ).toBe(1);
    }
  });
}

/**
 * V52–V53 (006, US2) — the sheet claims `aria-modal` and must earn it (K4–K7).
 *
 * Reported defect 1. `aria-modal="true"` contains assistive technology and the
 * full-viewport scrim contains the pointer, but nothing owned the keyboard: Tab
 * walked straight out onto the controls behind the scrim.
 *
 * The control list is read from the DOM on every use rather than hard-coded at
 * eight, which is K5 applied to the test itself — the assertion keeps its
 * meaning if the sheet ever gains or loses a control.
 */
const FOCUSABLE_SELECTOR =
  'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

async function sheetControls(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const sheet = document.querySelector('[data-testid="settings-sheet"]');
    if (!sheet) return [];
    return [...sheet.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => !el.hasAttribute('disabled'))
      .map((el) => el.getAttribute('data-testid') ?? el.tagName);
  }, FOCUSABLE_SELECTOR);
}

/**
 * Structural containment, asked of the DOM rather than of a name.
 *
 * `activeTestId` says WHICH element holds focus, which is what makes a failure
 * readable; this says whether it is inside the sheet at all. Both are asserted
 * because they fail differently — a trap that wraps to the wrong control passes
 * this one, and focus resting on an unnamed element passes the other.
 */
async function activeIsInSheet(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="settings-sheet"]');
    return Boolean(sheet && document.activeElement && sheet.contains(document.activeElement));
  });
}

test('V52 — Tab cannot leave the open sheet, and wraps in one press (FR-135, FR-136, K4, K6, SC-058)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await openSettings(page);

  const controls = await sheetControls(page);
  expect(controls.length, 'the sheet reported no focusable controls').toBeGreaterThan(2);

  const first = controls[0]!;
  const last = controls[controls.length - 1]!;

  // In ONE press. A native modal `<dialog>` lands on BODY first and only then
  // returns, which is why it does not satisfy K6 (research D2, measured).
  await page.getByTestId(last).focus();
  await page.keyboard.press('Tab');
  expect(await activeTestId(page), 'Tab from the last control did not wrap to the first').toBe(
    first
  );

  await page.getByTestId(first).focus();
  await page.keyboard.press('Shift+Tab');
  expect(
    await activeTestId(page),
    'Shift+Tab from the first control did not wrap to the last'
  ).toBe(last);

  // The over-eager-`preventDefault` guard: a handler that cancels every Tab
  // contains focus perfectly and makes the sheet untraversable. Only a press in
  // the MIDDLE can tell the two apart — at either end both behave alike.
  const middle = Math.floor(controls.length / 2);
  expect(middle, 'the sheet needs three controls for a middle').toBeLessThan(controls.length - 1);
  await page.getByTestId(controls[middle]!).focus();
  await page.keyboard.press('Tab');
  expect(
    await activeTestId(page),
    `Tab in the middle of the sheet did not advance one control from ${controls[middle]}`
  ).toBe(controls[middle + 1]!);

  // A lap and a half, asserting EVERY intermediate stop. A count equal to the
  // control count would pass on an implementation that happens to land back
  // inside on the last press.
  await page.getByTestId(first).focus();
  for (let press = 1; press <= controls.length * 2; press += 1) {
    await page.keyboard.press('Tab');
    const landed = await activeTestId(page);
    expect(controls, `press ${press} landed on ${landed}, which is not a sheet control`).toContain(
      landed
    );
    expect(await activeIsInSheet(page), `press ${press} left the sheet, landing on ${landed}`).toBe(
      true
    );
  }
});

const CLOSERS = [
  { name: 'Done', close: (page: Page) => page.getByTestId('settings-close').click() },
  { name: 'Escape', close: (page: Page) => page.keyboard.press('Escape') },
  {
    name: 'a backdrop press',
    close: async (page: Page) => {
      await page.mouse.move(20, 20);
      await page.mouse.down();
      await page.mouse.up();
    },
  },
] as const;

for (const { name, close } of CLOSERS) {
  test(`V53 — closing with ${name} returns focus to the opener (FR-138, K7)`, async ({ page }) => {
    await page.goto('/');
    await waitForNote(page, 'E');

    // Focus the opener FIRST. Reading `activeTestId` on a freshly loaded page
    // returns BODY — nothing is focused yet — and a V53 that captured BODY
    // would assert exactly what the unfixed build already does, and pass.
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('reference-badge')).toBeFocused();

    // Read what is focused rather than naming it. There is only one opener
    // today, so an implementation that hard-codes `reference-badge` cannot be
    // distinguished by any assertion that also hard-codes it.
    const opener = await activeTestId(page);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('settings-sheet')).toBeVisible();
    await expect(page.getByTestId('settings-close')).toBeFocused();

    await close(page);
    await expect(page.getByTestId('settings-sheet')).toHaveCount(0);

    expect(await activeTestId(page), `closing with ${name} discarded focus`).toBe(opener);
  });
}

/**
 * The automatable half of K8 — a non-regression pin, not a regression test.
 *
 * These two channels are the ones this feature does NOT implement: `aria-modal`
 * contains assistive technology and the scrim contains the pointer, and both
 * predate `006`. They pass on today's code, which is the point — FR-144 says
 * the fix must not cost what already worked, and the trap and the scroll lock
 * both land on the elements these assert.
 *
 * Whether a screen reader HONOURS `aria-modal` is not observable here. Axe
 * checks the attribute is present, not that a cursor obeys it, which is why
 * V57 stays a manual gate (SC-060).
 */
test('the sheet declares itself modal and the scrim covers the viewport (FR-136, FR-144, K8)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await openSettings(page);

  const sheet = page.getByTestId('settings-sheet');
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'true');

  const backdrop = await page.getByTestId('settings-backdrop').boundingBox();
  expect(backdrop, 'the backdrop has no box').not.toBeNull();

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  // Covering, not merely present: a scrim that stops short of an edge leaves a
  // strip of live controls behind it.
  expect(backdrop!.x).toBeLessThanOrEqual(0);
  expect(backdrop!.y).toBeLessThanOrEqual(0);
  expect(backdrop!.width).toBeGreaterThanOrEqual(viewport.width);
  expect(backdrop!.height).toBeGreaterThanOrEqual(viewport.height);
});

/**
 * V54–V55 (006, US3) — the page behind the sheet does not move (K9–K11).
 *
 * Reported defect 2. Nothing locked the document, and there has been content
 * below the fold since `003` — so the tuner and the sheet scrolled away
 * together while the user was reading the settings.
 *
 * A native modal `<dialog>` does not provide this either: measured, the page
 * scrolled on both wheel and `End` in Chromium and WebKit (**D2**).
 */
async function documentScrollState(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      scrollTop: document.documentElement.scrollTop,
      overflow: style.overflow,
      paddingRight: parseFloat(style.paddingRight),
      overscrollBehavior: style.overscrollBehavior,
    };
  });
}

test('V54 — the document does not scroll behind the open sheet (FR-139, K9, SC-059)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // FIRST, before anything else: a page with nothing to scroll would pass every
  // assertion below without the lock existing at all.
  const scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight
  );
  expect(scrollable, 'the document is not scrollable at this viewport, so V54 proves nothing').toBe(
    true
  );

  await openSettings(page);
  const before = (await documentScrollState(page)).scrollTop;

  // Focus is on Done — inside the sheet, and not the slider, whose own arrow
  // handling would mask what ArrowDown does to the page.
  const attempts: Array<[string, () => Promise<void>]> = [
    [
      'a wheel over the scrim',
      async () => {
        await page.mouse.move(20, 20);
        await page.mouse.wheel(0, 600);
      },
    ],
    ['End', async () => page.keyboard.press('End')],
    ['PageDown', async () => page.keyboard.press('PageDown')],
    ['ArrowDown', async () => page.keyboard.press('ArrowDown')],
  ];

  for (const [name, attempt] of attempts) {
    await attempt();
    // A settled read, not a raced one: scrolling is asynchronous, so asserting
    // immediately could pass against a page that is still moving.
    await page.waitForTimeout(150);
    const { scrollTop } = await documentScrollState(page);
    expect(scrollTop, `${name} scrolled the page behind the sheet`).toBe(before);
  }
});

test('V55 — the lock costs no width and unlocks exactly (FR-140, FR-141, K10, K11)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // The gutter is 0 on macOS overlay scrollbars and non-zero on CI's Ubuntu
  // runners, so this is asserted as ARITHMETIC and never as an observed width —
  // a before/after width comparison passes locally against an implementation
  // with no compensation at all, and fails only in CI (D4, measured at T003).
  const gutter = await page.evaluate(
    () => window.innerWidth - document.documentElement.clientWidth
  );

  // A non-zero offset, so "the position was preserved" is a claim with
  // something behind it — but a SMALL one, and that is not a detail.
  // `openSettings` clicks the reference badge, and Playwright scrolls a click
  // target into view; the badge sits at the top of the tuner, so a large offset
  // scrolls the page back to 0 before the sheet has even opened. That is a
  // property of the fixture, not of the lock, and it cost an hour of blaming
  // the implementation for it.
  await page.evaluate(() => window.scrollTo(0, 50));
  await page.waitForTimeout(100);
  const closed = await documentScrollState(page);

  await openSettings(page);
  const open = await documentScrollState(page);

  // Read the offset AT OPEN rather than trusting the pre-open number: K11 is
  // about the position the page had when the sheet OPENED. Asserting it is
  // non-zero is what stops this whole test passing vacuously if the opener ever
  // moves below the fold and opening scrolls the page to the top again.
  expect(open.scrollTop, 'the page was at the top when the sheet opened').toBeGreaterThan(0);

  // The lock is REAL. Without this the restore assertions below are vacuous:
  // an implementation that never locked anything restores perfectly.
  expect(open.overflow, 'the document element was never locked').toBe('hidden');
  expect(open.overscrollBehavior, 'scroll chaining was never disabled').toBe('none');

  // Exactly the freed gutter is given back — including when it is 0, where the
  // assertion is that nothing was added.
  expect(
    open.paddingRight - closed.paddingRight,
    `padding-right moved by ${open.paddingRight - closed.paddingRight}px against a ${gutter}px gutter`
  ).toBe(gutter);

  // D5, pinned so it cannot be "simplified" later: `touch-action: none` on the
  // backdrop would stop a rubber-band and INHERIT onto the range input, whose
  // thumb is dragged with exactly the gesture that property cancels. Fixing
  // scroll chaining by breaking the reference pitch on every phone is the trap.
  const touchAction = await page
    .getByTestId('a4-slider')
    .evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction, 'the slider can no longer be dragged on a touch screen').not.toBe('none');

  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('settings-sheet')).toHaveCount(0);

  const after = await documentScrollState(page);
  // `overflow: hidden` preserves scrollTop by construction, which is why the
  // document element was locked rather than the body being fixed (D4).
  expect(after.scrollTop, 'the page moved while the sheet was open').toBe(open.scrollTop);
  expect(after.overflow).toBe(closed.overflow);
  expect(after.paddingRight).toBe(closed.paddingRight);
  expect(after.overscrollBehavior).toBe(closed.overscrollBehavior);
});
