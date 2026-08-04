import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

/**
 * The tuner owns the first viewport height, and the document may scroll past it
 * (FR-066, FR-067, D3).
 *
 * Before 003 three rules conspired to make the document unscrollable —
 * `height: 100%` on `html, body, #root` and `overflow: hidden` on `<main>`.
 * That was invisible while the tuner was the only thing on the page. It stops
 * being invisible the moment supporting content sits after `#root`: the content
 * is present in the DOM, readable by a crawler, and completely unreachable by a
 * person.
 *
 * Both halves matter and they pull against each other. Making the page
 * scrollable is easy; making it scrollable *without* costing the tuner any of
 * the first screenful is the actual requirement, and the one that erodes
 * silently as content is added over time.
 */
test.use(audioArgs('e2-in-tune.wav'));

/**
 * FR-066: the tuner gets exactly one viewport height, no more and no less.
 *
 * `100dvh` rather than `100vh` is load-bearing now that the page scrolls. On
 * mobile browsers whose chrome collapses on scroll, `100vh` overstates the
 * viewport and pushes part of the tuner below the fold at rest — the exact
 * violation this test exists to catch, on the devices least able to spare the
 * pixels.
 */
test('the tuner occupies exactly one viewport height (FR-066)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const { rootHeight, viewportHeight } = await page.evaluate(() => ({
    rootHeight: document.getElementById('root')!.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
  }));

  // Rounded: sub-pixel layout means an exact equality assertion is a flake
  // waiting for a different device scale factor.
  expect(
    Math.round(rootHeight),
    `#root is ${rootHeight}px tall against a ${viewportHeight}px viewport`
  ).toBe(Math.round(viewportHeight));
});

/**
 * FR-067: the document is not *prevented* from scrolling.
 *
 * **This passes on unmodified code, and that is the finding.** Research D3
 * claimed three rules "conspire to make the document unscrollable". Measured,
 * they do not: `overflow: hidden` sits on `<main>` *inside* `#root`, so it clips
 * main's own overflow and never the document, and `height: 100%` sets a box
 * height without clipping anything. Content appended after `#root` on the
 * unmodified build scrolls to 2104px quite happily.
 *
 * So this is a characterisation test, not a red-to-green one. It is kept
 * because the property it pins is genuinely required from here on and is one
 * `overflow` rule away from being lost — but it was never broken, and claiming
 * otherwise in a comment would be the kind of tidy story that costs someone a
 * day in two years.
 *
 * Probed with an injected element rather than the real content section because
 * that section arrives with US1. Asserting the CSS instead — `overflow !==
 * 'hidden'` — would test the mechanism rather than the behaviour, and would
 * pass on a build where some other rule clips the page anyway.
 */
test('the document is free to scroll past the fold (FR-067)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const probe = await page.evaluate(() => {
    const element = document.createElement('div');
    element.id = 'fold-scroll-probe';
    element.style.height = '2000px';
    document.body.append(element);

    const scrollable =
      document.documentElement.scrollHeight > document.documentElement.clientHeight;

    window.scrollTo(0, 500);
    const moved = window.scrollY;

    window.scrollTo(0, 0);
    element.remove();

    return { scrollable, moved };
  });

  expect(probe.scrollable, 'the document reports itself unscrollable with 2000px appended').toBe(
    true
  );
  expect(probe.moved, 'the document did not actually scroll when told to').toBeGreaterThan(0);
});

/**
 * FR-067: a return visit starts at the tuner, not where the reader left off.
 *
 * This is the half of D3 that was actually broken, and the only Phase 2
 * assertion that fails before its implementation. Browsers restore scroll
 * position on reload and on back-navigation by default, so once the page has
 * content worth scrolling to, someone who read it and came back the next day
 * would land on prose with the tuner off-screen — against an app whose whole
 * premise is a readout visible at a glance.
 *
 * The tall element is installed by `addInitScript` so it survives the reload;
 * without it there is nothing to restore a position within, and the assertion
 * would pass vacuously on any build.
 */
test('does not restore scroll position on reload (FR-067)', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const element = document.createElement('div');
      element.id = 'fold-scroll-probe';
      element.style.height = '2000px';
      document.body.append(element);
    });
  });

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.evaluate(() => {
    window.scrollTo(0, 800);
  });
  expect(await page.evaluate(() => window.scrollY), 'the probe never scrolled').toBeGreaterThan(0);

  await page.reload();
  await waitForNote(page, 'E');

  // Give the browser the frame it would use to restore a remembered position.
  await page.waitForTimeout(500);

  expect(
    await page.evaluate(() => window.scrollY),
    'the browser restored the previous scroll position — a returning reader lands on the content ' +
      'with the tuner off-screen'
  ).toBe(0);
});
