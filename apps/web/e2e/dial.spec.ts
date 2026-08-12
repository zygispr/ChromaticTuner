import { PREFERENCES_STORAGE_KEY } from '@chromatic-tuner/core';
import { expect, test, type Page } from '@playwright/test';

import { audioArgs, expectNeedleAt, medianNeedleAngleDeg, useDial, waitForNote } from './helpers';

test.use(audioArgs('d3-in-tune.wav'));

/**
 * User Story 1 — the circular display (007, V60 and V63).
 *
 * One fixture per spec file: `launchOptions` cannot be set per `describe`
 * because Playwright forces a new worker for it, which is why the dial's angle
 * table is spread across `dial-*.spec.ts` rather than parameterised here.
 *
 * Read the hazard table in this feature's tasks.md before adding assertions.
 * The needle's angle is measured from RENDERED BOXES throughout, never from its
 * transform: putting the rotation on the needle instead of its wrapper writes a
 * perfectly correct matrix and draws the needle in the wrong place (D5, G21).
 */

test('points the needle at the segment of the note it is naming (G2, G21)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  // D is pitch class 2, so 60 degrees clockwise from the top.
  expectNeedleAt(await medianNeedleAngleDeg(page), 60);
});

test('labels all twelve segments, C at the top, ascending clockwise (FR-155)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  const labels = await page.getByTestId('dial-label').allTextContents();
  expect(labels).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);

  // Order alone is not placement: a list rendered in the right sequence but
  // laid out anticlockwise passes the assertion above and is a mirrored dial.
  const dial = (await page.getByTestId('tuning-dial').boundingBox())!;
  const centreX = dial.x + dial.width / 2;
  const centreY = dial.y + dial.height / 2;

  const boxes = await page.getByTestId('dial-label').all();
  const c = (await boxes[0]!.boundingBox())!;
  const dSharp = (await boxes[3]!.boundingBox())!;

  expect(c.y + c.height / 2, 'C is not above the centre').toBeLessThan(centreY);
  expect(Math.abs(c.x + c.width / 2 - centreX)).toBeLessThan(dial.width * 0.06);
  // D♯ is a quarter turn on, so clockwise puts it to the RIGHT. This is the
  // assertion that says which way round the dial runs.
  expect(dSharp.x + dSharp.width / 2, 'D♯ is not clockwise of C').toBeGreaterThan(centreX);
});

test('respells the five accidentals with flats, naturals untouched (FR-156)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page, { accidentalStyle: 'flat' });
  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  expect(await page.getByTestId('dial-label').allTextContents()).toEqual([
    'C',
    'D♭',
    'D',
    'E♭',
    'E',
    'F',
    'G♭',
    'G',
    'A♭',
    'A',
    'B♭',
    'B',
  ]);
});

test('draws a boundary tick between every pair of segments (FR-154)', async ({ page }) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  expect(await page.getByTestId('dial-tick').count()).toBe(12);
});

/**
 * The dial takes no pointer events, anywhere, ever.
 *
 * **Reported by the maintainer**: with the dial selected, the settings badge was
 * clickable only at its two extreme ends.
 *
 * The cause is geometric and worth stating, because nothing about the dial's
 * appearance suggests it. The ticks, the target and the needle are each drawn by
 * an `inset: 0` wrapper — a square the full size of the dial — which is then
 * rotated (G21: the transform must go on a dial-sized concentric element, never
 * on the mark itself). A rotated square hit-tests over its rotated area, which
 * pokes out of the dial's own box by up to `((√2 − 1) / 2) × size` — 101px on a
 * 489px dial, at the 45° ticks. Those corners are transparent and paint nothing,
 * so the overhang is invisible; it is only detectable by asking what is on top.
 *
 * It was latent in Phase 3 and Phase 7 exposed it: at a 320px dial the overhang
 * was 66px and the note name and cents readout sat between the badge and the
 * dial, absorbing all of it. Moving them into the hub (FR-168) put the badge
 * 24px from the dial's edge.
 *
 * Asserted by hit-testing rather than only by clicking, so a failure says which
 * element is on top instead of "click timed out".
 */
for (const control of ['reference-badge', 'microphone-toggle']) {
  test(`the dial does not swallow clicks meant for the ${control}`, async ({ page }) => {
    test.setTimeout(60_000);
    await useDial(page);
    await page.goto('/');
    await waitForNote(page, 'D');

    const blockers = await page.evaluate((testId) => {
      const target = document.querySelector(`[data-testid="${testId}"]`);
      if (!target) return ['the control is not on the page'];

      const rect = target.getBoundingClientRect();
      const found = new Set<string>();

      // A grid across the whole control, not just its centre: the reported
      // symptom was that the MIDDLE was dead while the ends still worked.
      for (let i = 1; i < 10; i += 1) {
        for (let j = 1; j < 4; j += 1) {
          const hit = document.elementFromPoint(
            rect.left + (rect.width * i) / 10,
            rect.top + (rect.height * j) / 4
          );
          if (!hit || !target.contains(hit)) {
            found.add(hit ? (hit.getAttribute('data-testid') ?? hit.tagName) : 'nothing');
          }
        }
      }

      return [...found];
    }, control);

    expect(blockers, `${control} is covered by ${blockers.join(', ')}`).toEqual([]);
  });
}

test('the settings sheet opens from the badge with the dial selected (FR-022)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'D');

  // The symptom as a player meets it. Playwright's actionability check makes
  // this fail with an interception message rather than a silent no-op.
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
});

/**
 * V69 / FR-018 — the whole tuner fits without scrolling.
 *
 * Reported against the built dial: the microphone control was pushed off the
 * bottom of the screen. FR-018 requires the primary display to be fully visible
 * without scrolling, tapping or expanding, because the player's hands are on
 * the instrument.
 *
 * The regression this pins: the dial sized itself from WIDTH alone
 * (`width: 100%; max-width: 320px; aspect-ratio: 1`), so its height was
 * unbounded by what was left. Measured, the column went 574px with the line to
 * 798px with the dial, and the control left the screen below a 846px viewport.
 *
 * 622px is the height at which the LINE's column stops fitting, so it is the
 * bar the dial has to clear: whatever the viewport, choosing the dial must
 * never cost a player a control the line would have left on screen.
 *
 * **Re-baselined in Phase 7.** The note name and the cents readout moved into
 * the hub, so the chrome these cases are measured against fell from 526px to
 * 318px and the dial's cap rose. The heights are unchanged and 560 was added:
 * the fit is the requirement, and it has to hold across a bigger dial rather
 * than because of a smaller one.
 */
for (const height of [900, 800, 700, 640, 560]) {
  test(`fits the viewport at ${height}px, control and all (FR-018)`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 900, height });
    await useDial(page);
    await page.goto('/');
    await waitForNote(page, 'D');

    const dial = await page.getByTestId('tuning-dial').boundingBox();
    expect(dial, 'the dial has no box').not.toBeNull();

    const toggleBottom = await page
      .getByTestId('microphone-toggle')
      .evaluate((el) => el.getBoundingClientRect().bottom);

    expect(
      Math.round(toggleBottom),
      `the microphone control ends ${Math.round(toggleBottom - height)}px below the fold`
    ).toBeLessThanOrEqual(height);

    // And the dial itself is not clipped at the top by the same overflow.
    expect(dial!.y).toBeGreaterThanOrEqual(0);
    // Still square, whatever it had to shrink to.
    expect(Math.abs(dial!.width - dial!.height)).toBeLessThan(2);
  });
}

/* ------------------------------------------------------------------------- *
 * User Story 2 — pick the display, and keep the one you had (Phase 4).
 *
 * V58, V59, V64, V65. Almost all of this is behaviour the preference layer
 * already owns, which is exactly why it is worth testing: research D9's claim
 * is that a fourth field in one JSON blob inherits repair, persistence and
 * reset for free. A claim of inheritance is only worth anything checked.
 * ------------------------------------------------------------------------- */

/** Seed a whole stored record before the first paint. */
async function seedRecord(page: Page, record: Record<string, unknown>): Promise<void> {
  await page.addInitScript(
    ([key, raw]) => window.localStorage.setItem(key!, raw!),
    [PREFERENCES_STORAGE_KEY, JSON.stringify(record)]
  );
}

/** The pre-007 record from V64: three fields, no `tunerDisplay` at all. */
const PRE_007_RECORD = {
  a4Hz: 432,
  accidentalStyle: 'flat',
  appearance: 'dark',
  schemaVersion: 1,
};

/** Assert the three preferences that came from the seeded record survived. */
async function expectRecordIntact(page: Page): Promise<void> {
  await expect(page.getByTestId('reference-badge')).toContainText('432');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
    'dark'
  );
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true');
}

test('a player who has never chosen a display gets the line (FR-149, V58)', async ({ page }) => {
  test.setTimeout(60_000);
  // Deliberately no `useDial` and no seed of any kind.
  await page.goto('/');
  await waitForNote(page, 'D');

  // That there is no stored record at all is half the assertion: a default read
  // back out of a record the app wrote for itself would prove nothing about the
  // player who has never opened Settings, which is who FR-149 is about.
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), PREFERENCES_STORAGE_KEY),
    'the app wrote a preferences record without being asked to'
  ).toBeNull();

  await expect(page.getByTestId('tuning-line')).toBeVisible();
  await expect(page.getByTestId('tuning-dial')).toHaveCount(0);

  // And Settings says the same thing, which is the half a player can see.
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('tuner-display-line')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tuner-display-dial')).toHaveAttribute('aria-pressed', 'false');
});

/**
 * FR-152 / G20 / V59 — switching displays must not touch the microphone.
 *
 * The counters are installed before any page script runs and wrap
 * `getUserMedia` and every track's `stop`, because "capture was uninterrupted"
 * is a claim about the stream rather than about the picture. A component that
 * tore the source down and rebuilt it would redraw so fast that a screenshot,
 * and most assertions, would see nothing — the tell is a second `getUserMedia`,
 * or a `stop` that should never have happened.
 *
 * The readout is sampled on an interval rather than watched with a
 * MutationObserver: switching displays unmounts one subtree and mounts another,
 * so an observer bound to the old node stops observing exactly when the thing
 * it is watching for would happen. Re-querying each tick survives the swap.
 */
test('switching displays mid-reading never restarts capture (FR-152, G20, V59)', async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.addInitScript(() => {
    const counts = { getUserMedia: 0, stopped: 0 };
    (window as unknown as { __capture: typeof counts }).__capture = counts;

    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      counts.getUserMedia += 1;
      const stream = await original(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          counts.stopped += 1;
          stop();
        };
      }
      return stream;
    };

    // Sampled, not observed: the node this reads is replaced by the switch.
    const seen: string[] = [];
    (window as unknown as { __notes: string[] }).__notes = seen;
    setInterval(() => {
      const text = document.querySelector('[data-testid="note-label"]')?.textContent;
      if (text) seen.push(text.trim());
    }, 25);
  });

  await page.goto('/');
  await waitForNote(page, 'D');

  // Start the window HERE. Sampling begins at document start, so the buffer
  // already holds the placeholder from before the first reading arrived —
  // measured, five samples of it — and those are not what this test is about.
  // Left in, they fail a correct build and say "the readout blanked while the
  // display was switched", which is a false report of a real-sounding defect.
  await page.evaluate(() => {
    (window as unknown as { __notes: string[] }).__notes.length = 0;
  });

  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  // Several round trips, as V59 asks — one switch could survive on luck.
  //
  // The pause after each is not padding: a click and a visibility check take
  // ~30ms together, so without it the whole loop passes through the sampler in
  // a handful of ticks and "the readout never blanked" would be a claim about
  // almost no observation at all.
  for (let i = 0; i < 3; i += 1) {
    await page.getByTestId('tuner-display-dial').click();
    await expect(page.getByTestId('tuning-dial')).toBeVisible();
    await expect(page.getByTestId('tuning-line')).toHaveCount(0);
    await page.waitForTimeout(150);

    await page.getByTestId('tuner-display-line').click();
    await expect(page.getByTestId('tuning-line')).toBeVisible();
    await expect(page.getByTestId('tuning-dial')).toHaveCount(0);
    await page.waitForTimeout(150);
  }

  await page.getByTestId('tuner-display-dial').click();
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  const capture = await page.evaluate(
    () => (window as unknown as { __capture: { getUserMedia: number; stopped: number } }).__capture
  );
  expect(capture.getUserMedia, 'the microphone was opened more than once').toBe(1);
  expect(capture.stopped, 'a track was stopped by switching displays').toBe(0);

  // No permission prompt, on any of the switches.
  await expect(page.getByTestId('permission-prompt')).toHaveCount(0);

  // And the reading itself never lapsed. The fixture sounds continuously, so
  // any placeholder in this sample is the display swap knocking the note out.
  const notes = await page.evaluate(() => (window as unknown as { __notes: string[] }).__notes);
  expect(notes.length, 'the readout was never sampled across the switches').toBeGreaterThan(20);
  expect(
    notes.filter((text) => text.startsWith('–')),
    'the readout blanked while the display was switched'
  ).toEqual([]);
});

test('a record written before this feature loads with every field intact (G18, V64)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedRecord(page, PRE_007_RECORD);
  await page.goto('/');
  await waitForNote(page, 'D');

  // The missing field defaults...
  await expect(page.getByTestId('tuning-line')).toBeVisible();
  await expect(page.getByTestId('tuning-dial')).toHaveCount(0);
  // ...and takes none of its neighbours with it.
  await expectRecordIntact(page);
  await expect(page.getByTestId('tuner-display-line')).toHaveAttribute('aria-pressed', 'true');
});

/**
 * G16 / G17 / V64 — an unusable display does not cost the player their record.
 *
 * `'circle'` rather than `'nonsense'` on purpose: it is what someone would guess
 * the value is called, and a pass-through implementation with no validation
 * accepts it and then renders neither display. The near-miss is the only input
 * that discriminates.
 */
test('an unrecognised display falls back to the line without losing a field (G16, G17)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedRecord(page, { ...PRE_007_RECORD, tunerDisplay: 'circle' });
  await page.goto('/');
  await waitForNote(page, 'D');

  await expect(page.getByTestId('tuning-line')).toBeVisible();
  await expect(page.getByTestId('tuning-dial')).toHaveCount(0);
  await expectRecordIntact(page);

  // THE ASSERTION THAT MAKES THIS TEST WORTH RUNNING, and it is not the one
  // above. `TunerDisplay` renders the dial only for the exact string `'dial'`
  // and the line for everything else, so the picture is identical whether
  // `'circle'` was repaired to `'line'` or passed straight through unvalidated
  // — a pass-through with no validation at all draws the same screen and passes
  // every assertion before this one. Settings is where the two part company:
  // the repaired value selects Line, the raw one selects neither.
  await expect(page.getByTestId('tuner-display-line')).toHaveAttribute('aria-pressed', 'true');
});

/**
 * FR-150 / V64 — the choice survives a reload, and reset undoes it.
 *
 * "No flash of the line" is asserted from a MutationObserver installed before
 * any page script runs, because the flash it exists to catch lasts one frame:
 * a build that mounts the default and then corrects itself once preferences
 * load looks identical to a correct one by the time any assertion could run.
 * This is the same first-painted-frame obligation FR-120 puts on appearance.
 */
test('the chosen display survives a reload, and reset returns the line (FR-150, V64)', async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'D');
  await page.getByTestId('reference-badge').click();
  await page.getByTestId('tuner-display-dial').click();
  await expect(page.getByTestId('tuning-dial')).toBeVisible();
  await page.getByTestId('settings-close').click();

  await page.addInitScript(() => {
    (window as unknown as { __sawLine: boolean }).__sawLine = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="tuning-line"]')) {
        (window as unknown as { __sawLine: boolean }).__sawLine = true;
      }
    }).observe(document, { subtree: true, childList: true });
  });

  await page.reload();
  await expect(page.getByTestId('tuning-dial')).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __sawLine: boolean }).__sawLine),
    'the line was mounted before the dial, which is a flash of the wrong display'
  ).toBe(false);

  await waitForNote(page, 'D');
  await page.getByTestId('reference-badge').click();
  await page.getByTestId('settings-reset').click();

  // The line comes back with the rest of the defaults, not on its own.
  await expect(page.getByTestId('tuning-line')).toBeVisible();
  await expect(page.getByTestId('tuning-dial')).toHaveCount(0);
  await expect(page.getByTestId('tuner-display-line')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('a4-value')).toContainText('440');
  await expect(page.getByTestId('accidental-sharp')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('appearance-system')).toHaveAttribute('aria-pressed', 'true');
});

/**
 * FR-153 / V65 — a refused write still switches the display.
 *
 * Only `setItem` throws, so the app starts normally and just cannot save: the
 * awkward case, rather than storage being absent altogether. Same emulation as
 * `settings.spec.ts` uses for the appearance, and deliberately the same
 * warning — FR-153 asks for the existing surface, not a new one.
 */
test('a refused write still switches the display and warns (FR-153, V65)', async ({ page }) => {
  test.setTimeout(60_000);

  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(...args: [string, string]) {
      if (args[0] === key) throw new Error('QuotaExceededError');
      return original.apply(this, args);
    };
  }, PREFERENCES_STORAGE_KEY);

  await page.goto('/');
  await waitForNote(page, 'D');

  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await expect(page.getByTestId('persistence-warning')).toHaveCount(0);

  await page.getByTestId('tuner-display-dial').click();

  await expect(page.getByTestId('tuning-dial')).toBeVisible();
  await expect(page.getByTestId('tuner-display-dial')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('persistence-warning')).toBeVisible();
  await expect(page.getByTestId('persistence-warning')).toContainText(/not be remembered/i);
});
