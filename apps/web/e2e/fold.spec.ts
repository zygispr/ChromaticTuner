import { expect, test } from '@playwright/test';

import { audioArgs, useDial, waitForNote } from './helpers';

/**
 * The tuner owns the first viewport height, and the document may scroll past it
 * (FR-066, FR-067, D3).
 *
 * Before 003 three rules were thought to conspire to make the document
 * unscrollable — `height: 100%` on `html, body, #root` and `overflow: hidden` on
 * `<main>`. Measured, they did not (see the FR-067 case below), but the concern
 * behind them is real the moment supporting content sits after `#root`: content
 * present in the DOM, readable by a crawler, and unreachable by a person.
 *
 * `height: 100%` on `#root` is gone now — it capped the fold rather than
 * reserving it, and the tuner was drawn on top of the content whenever the
 * column outgrew the viewport. The rule left in its place is `min-height`, and
 * the case that pins the difference is `never paints over the supporting
 * content` below.
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
 * main's own overflow and never the document, and `height: 100%` set a box
 * height without clipping anything. Content appended after `#root` on the
 * unmodified build scrolls to 2104px quite happily.
 *
 * What that `height: 100%` did do was let the column overflow the box the
 * content was positioned after, which is a collision rather than a scroll trap —
 * a different defect, found later, and the one the overlap case below pins.
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
 * The elements FR-066 promises are usable without scrolling. The controls are
 * included deliberately: a display you can read but not reach is not usable.
 */
const FOLD_ELEMENTS = [
  'tuner-display',
  'note-label',
  'cents-readout',
  'tuning-line',
  'direction-cue',
  'reference-badge',
  'microphone-toggle',
] as const;

/**
 * The smallest screen the constitution's "Supported targets" covers.
 *
 * iOS 16.4 reaches back to iPhone 8 (375×667) and Android 8 mid-range phones
 * bottom out around 360×640, so 360×640 is the floor both ends agree on.
 */
const SMALLEST_VIEWPORT = { width: 360, height: 640 } as const;

/**
 * FR-066 / SC-029: on the smallest supported screen, everything is inside the
 * first viewport height with nothing scrolled.
 *
 * **Geometry, not DOM order.** Asserting that the content section follows
 * `#root` in the document says nothing about whether the tuner still fits — it
 * passes just as happily with the readout half off-screen. `001` shipped
 * exactly that shape of assertion (`transform !== 'none'`) and it hid a 144px
 * positioning error for seven phases; `helpers.ts` exists because of it. So
 * this measures real boxes against the real viewport.
 */
test('every tuning element fits the first viewport on the smallest screen (FR-066, SC-029)', async ({
  page,
}) => {
  await page.setViewportSize(SMALLEST_VIEWPORT);
  await page.goto('/');
  await waitForNote(page, 'E');

  expect(await page.evaluate(() => window.scrollY), 'the page did not start at the top').toBe(0);

  const overflowing = await page.evaluate((ids: readonly string[]) => {
    const viewport = window.innerHeight;
    const bad: string[] = [];
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) continue;
      const box = element.getBoundingClientRect();
      if (box.bottom > viewport + 0.5 || box.top < -0.5) {
        bad.push(
          `${id} spans ${Math.round(box.top)}–${Math.round(box.bottom)}px of a ${viewport}px viewport`
        );
      }
    }
    return bad;
  }, FOLD_ELEMENTS);

  expect(overflowing, `these elements do not fit the fold:\n  ${overflowing.join('\n  ')}`).toEqual(
    []
  );
});

/**
 * FR-087 / SC-032: the gate above must actually fail when content encroaches.
 *
 * Supporting content is the kind of thing that gains a paragraph every few
 * months. Without this, the fold erodes a little at a time and nobody notices
 * until FR-018 is already broken — and a gate never observed failing is not
 * known to work.
 *
 * The probe grows the tuner's own column rather than the content section,
 * because that is the direction the erosion actually comes from: something
 * added inside the fold pushing the rest down.
 *
 * Into `tuner-display`, not `<main>`. `<main>` is a flex **row**, so a block
 * prepended there lands *beside* the tuner and pushes nothing down — the first
 * version of this probe did exactly that and reported the gate as broken when
 * it was the probe that was wrong.
 */
test('the fold gate fails when something encroaches on it (FR-087, SC-032)', async ({ page }) => {
  await page.setViewportSize(SMALLEST_VIEWPORT);
  await page.goto('/');
  await waitForNote(page, 'E');

  const pushedOut = await page.evaluate((ids: readonly string[]) => {
    const filler = document.createElement('div');
    filler.style.height = '400px';
    filler.style.flexShrink = '0';
    document.querySelector('[data-testid="tuner-display"]')?.prepend(filler);

    const viewport = window.innerHeight;
    const bad = ids.filter((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) return false;
      return element.getBoundingClientRect().bottom > viewport + 0.5;
    });

    filler.remove();
    return bad;
  }, FOLD_ELEMENTS);

  expect(
    pushedOut.length,
    'injecting 400px into the fold pushed nothing out of view — the gate above cannot detect encroachment'
  ).toBeGreaterThan(0);
});

/**
 * FR-064 / FR-066: when the column outgrows the fold, the fold GROWS with it.
 *
 * Reported against the running app: below a 622px viewport — the height at which
 * the horizontal display's column stops fitting — the heading and its prose were
 * drawn *underneath* the tuner, with the microphone control sitting across a
 * paragraph.
 *
 * The mechanism is one declaration. `#root` carried `height: 100%` as well as
 * `min-height: 100dvh`, and the first of those is a DEFINITE height: `<main>`
 * grew to its 622px of content while `#root`'s box stayed pinned to the
 * viewport, so the column overflowed a box that the supporting content was
 * positioned immediately after. Measured at 500px of height: `#root` 500px,
 * `<main>` 622px, content starting at y=500 with the column reaching 598.
 *
 * Every element that paints, against the content's box, rather than
 * `#root`'s height against `<main>`'s — the arithmetic is the cause and the
 * collision is the defect, and a fold that grows by some other route is just as
 * correct.
 *
 * Both displays, because the dial's column has its own height and its own floor
 * (`dial.spec.ts`) and would meet this from a different direction.
 */
for (const display of ['line', 'dial'] as const) {
  test(`the tuner never paints over the supporting content on a short viewport (${display}, FR-064, FR-066)`, async ({
    page,
  }) => {
    // 500px: shorter than either column, and shorter than any supported phone.
    // The requirement is not that this viewport be usable — nothing fits it —
    // but that the page degrade by scrolling rather than by overlapping.
    await page.setViewportSize({ width: 800, height: 500 });
    if (display === 'dial') await useDial(page);
    await page.goto('/');
    await waitForNote(page, 'E');

    const overlaps = await page.evaluate(
      (ids: readonly string[]) => {
        const content = document.querySelector('#site-content')?.getBoundingClientRect();
        if (!content) return ['#site-content is not in the document'];

        const hits: string[] = [];
        for (const id of ids) {
          // The flex container paints nothing of its own — same exclusion the
          // scroll-cue case makes, and for the same reason.
          if (id === 'tuner-display') continue;
          const element = document.querySelector(`[data-testid="${id}"]`);
          if (!element) continue;
          const box = element.getBoundingClientRect();
          const intersects =
            content.left < box.right &&
            content.right > box.left &&
            content.top < box.bottom &&
            content.bottom > box.top;
          if (intersects) {
            hits.push(
              `${id} (${Math.round(box.top)}–${Math.round(box.bottom)}px) over content starting at ${Math.round(content.top)}px`
            );
          }
        }
        return hits;
      },
      [...FOLD_ELEMENTS, 'tuning-dial']
    );

    expect(
      overlaps,
      `the tuner is drawn on top of the supporting content:\n  ${overlaps.join('\n  ')}`
    ).toEqual([]);
  });
}

/**
 * FR-068: something tells the reader there is more below.
 *
 * And the constraint that makes it awkward — the cue must not overlap the
 * tuning display or any control. A cue that sits on top of the readout is worse
 * than no cue, on the one screen the product exists to keep legible.
 */
test('the scroll cue is visible and overlaps nothing (FR-068)', async ({ page }) => {
  await page.setViewportSize(SMALLEST_VIEWPORT);
  await page.goto('/');
  await waitForNote(page, 'E');

  const cue = page.getByTestId('scroll-cue');
  await expect(cue).toBeVisible();

  const overlaps = await page.evaluate((ids: readonly string[]) => {
    const cueBox = document.querySelector('[data-testid="scroll-cue"]')!.getBoundingClientRect();
    const hits: string[] = [];
    for (const id of ids) {
      // `tuner-display` is the flex container holding the others. It paints
      // nothing of its own — no background, no border — and its box spans the
      // full column, so overlapping it obscures no pixel a player can see.
      // Every element that does paint stays in the check.
      if (id === 'tuner-display') continue;
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) continue;
      const box = element.getBoundingClientRect();
      const intersects =
        cueBox.left < box.right &&
        cueBox.right > box.left &&
        cueBox.top < box.bottom &&
        cueBox.bottom > box.top;
      if (intersects) hits.push(id);
    }
    return hits;
  }, FOLD_ELEMENTS);

  expect(overlaps, `the scroll cue overlaps: ${overlaps.join(', ')}`).toEqual([]);

  // Within the fold, or it is not a cue — it is part of the content it points at.
  const withinFold = await cue.evaluate(
    (node) => node.getBoundingClientRect().bottom <= window.innerHeight + 0.5
  );
  expect(withinFold, 'the scroll cue is itself below the fold').toBe(true);
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
