import { expect, test } from '@playwright/test';

import { audioArgs, useDial, waitForNeedleAngle, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * V8 / SC-010 / Principle V — 60 fps under continuous tuning.
 *
 * The quickstart calls V8 "manual, on device", and the on-device half stays
 * manual. But the failure mode it exists to catch is not device-specific: it is
 * React re-rendering the tree once per reading, ~43 times a second. That is
 * mechanically detectable in any browser, and the quickstart says so outright —
 * "if React is re-rendering per reading, this is where it shows; the fix is
 * R1/S4, not a faster device".
 *
 * So this measures the cause rather than only the symptom, which also makes it
 * a usable CI gate instead of a number someone films once.
 */

test('the marker moves without re-rendering React (guarantee R1)', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  // Count DOM mutations to the marker's style against mutations anywhere else
  // in the tree. The marker's transform is written imperatively ~43x/second; if
  // React were re-rendering per reading, the rest of the tree would churn at a
  // comparable rate.
  await page.evaluate(() => {
    const counts = { marker: 0, other: 0 };
    (window as unknown as { __counts: typeof counts }).__counts = counts;

    // The continuous channel writes to the TRACK carrying the marker, because a
    // percentage translation resolves against the transformed element's own
    // width — see TuningLine.
    const track = document.querySelector('[data-testid="tuning-track"]');
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === track) counts.marker += 1;
        else counts.other += 1;
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });

  await page.waitForTimeout(5_000);

  const counts = await page.evaluate(
    () => (window as unknown as { __counts: { marker: number; other: number } }).__counts
  );

  // The marker really is being driven continuously — if this were near zero the
  // test below would pass vacuously.
  expect(counts.marker).toBeGreaterThan(100);

  // The cents readout is deliberately rewritten at 10 Hz, so "other" is not
  // zero. What must not happen is the whole tree churning at reading rate.
  expect(
    counts.other,
    `expected the rest of the tree to stay quiet; marker=${counts.marker} other=${counts.other}`
  ).toBeLessThan(counts.marker / 2);
});

test('sustains its frame budget through a continuous tuning session (SC-010)', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  // Sample real presented frames via requestAnimationFrame for 20 s of live
  // tuning. Headless Chromium does not composite to a display, so this measures
  // the main thread's ability to service the frame loop — which is the thing
  // the render path can actually starve.
  const frames = await page.evaluate(async () => {
    const deltas: number[] = [];
    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const started = previous;
      const tick = (now: number) => {
        deltas.push(now - previous);
        previous = now;
        if (now - started >= 20_000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return deltas;
  });

  // Drop the first frame: it includes whatever the page was doing at the moment
  // sampling began, and is not a steady-state measurement.
  const steady = frames.slice(1).sort((a, b) => a - b);
  expect(steady.length).toBeGreaterThan(500);

  const p50 = steady[Math.floor(steady.length * 0.5)]!;
  const p95 = steady[Math.floor(steady.length * 0.95)]!;
  const worst = steady[steady.length - 1]!;

  // Reported so a regression shows the numbers rather than only a red cross.
  console.log(
    `frame time: p50 ${p50.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms  max ${worst.toFixed(1)}ms`
  );

  // 16.7 ms is one frame at 60 Hz. The median must sit on the frame clock, and
  // the 95th percentile must not miss two frames in a row.
  expect(p50).toBeLessThanOrEqual(17.5);
  expect(p95).toBeLessThanOrEqual(33.4);
});

test('does not grow its DOM while running (a leak would eventually stutter)', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  const before = await page.evaluate(() => document.querySelectorAll('*').length);
  await page.waitForTimeout(8_000);
  const after = await page.evaluate(() => document.querySelectorAll('*').length);

  // The tuner's tree is fixed size. Anything that appends per reading — a log
  // line, a live-region entry — shows up here long before it shows up as jank.
  expect(after).toBeLessThanOrEqual(before + 2);
});

/**
 * Cold start to a usable tuning display (Principle V, budget 2 s / target 1 s).
 *
 * Added by 003 (T002). The budget has been binding since the constitution was
 * ratified but was never measured — the suite covered frame time and DOM growth
 * and nothing else on this axis, so a regression here would have been invisible.
 * 003 moves the theme's token block from a runtime append to a build-time
 * `<style>` and adds static content to the document, which push cold start in
 * opposite directions; SC-028 wants the net, and a net needs a "before".
 *
 * "Usable" is the tuning line being in the DOM, not a note having been read.
 * Waiting for a note would fold in fixture playback and detection latency —
 * already measured by `packages/core/tests/latency.test.ts` — and report a
 * number that moves when the WAV changes.
 *
 * The observer is installed via `addInitScript`, which runs before any page
 * script, so nothing is missed between navigation and React's first paint.
 * `performance.now()` is measured from the navigation start of the document it
 * runs in, which is exactly the interval the budget names.
 */
test('reaches a usable tuning display within the cold-start budget (Principle V)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const record = (): void => {
      (window as unknown as { __coldStartMs?: number }).__coldStartMs = performance.now();
    };

    // Already present is possible in principle and free to handle; the observer
    // below would never fire for an element that existed before it started.
    if (document.querySelector('[data-testid="tuning-line"]')) {
      record();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="tuning-line"]')) return;
      record();
      observer.disconnect();
    });

    // `document`, not `document.documentElement`. This script runs before any
    // page script, which is early enough that `documentElement` is still null —
    // `observe(null)` throws, the init script dies silently, and the measurement
    // is simply never taken. Observing the document catches <html> being created
    // and everything appended beneath it.
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto('/');
  await expect(page.getByTestId('tuning-line')).toBeVisible();

  const coldStartMs = await page.evaluate(
    () => (window as unknown as { __coldStartMs?: number }).__coldStartMs
  );

  expect(coldStartMs, 'the cold-start observer never fired').toBeDefined();

  // Reported so a regression shows the number rather than only a red cross —
  // and so 003's before/after comparison has something to read.
  console.log(`cold start to usable display: ${coldStartMs!.toFixed(1)}ms`);

  expect(coldStartMs!).toBeLessThanOrEqual(2_000);
});

/**
 * T056 / SC-050 — switching appearance while a note is ringing costs no frames.
 *
 * The change is deliberately instant, with no transition (research D7), so the
 * cost is one attribute write plus a React re-render of the settings sheet —
 * and the risk is that it lands on top of the continuous reading path, which is
 * already writing the marker ~43 times a second.
 *
 * Sampled the same way as the session budget above, so the two numbers are
 * directly comparable: real presented frames via `requestAnimationFrame`, with
 * the switch performed in the middle of the window rather than before it.
 */
test('switching appearance mid-reading costs no dropped frames (SC-050)', async ({ page }) => {
  test.setTimeout(120_000);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  // Start sampling, then flip the appearance three times while it runs. The
  // sampler resolves on its own; the clicks happen against a live frame loop.
  const sampling = page.evaluate(async () => {
    const deltas: number[] = [];
    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const started = previous;
      const tick = (now: number) => {
        deltas.push(now - previous);
        previous = now;
        if (now - started >= 6_000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return deltas;
  });

  for (const value of ['dark', 'light', 'dark'] as const) {
    await page.waitForTimeout(1_200);
    await page.getByTestId(`appearance-${value}`).click();
  }

  const frames = await sampling;
  const steady = frames.slice(1).sort((a, b) => a - b);
  expect(steady.length).toBeGreaterThan(100);

  const p50 = steady[Math.floor(steady.length * 0.5)]!;
  const p95 = steady[Math.floor(steady.length * 0.95)]!;
  const worst = steady[steady.length - 1]!;

  console.log(
    `appearance switch frame time: p50 ${p50.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms  max ${worst.toFixed(1)}ms`
  );

  // The same budget the continuous session is held to. A switch that repainted
  // every token through a transition would show up in p95 first.
  expect(p50).toBeLessThanOrEqual(17.5);
  expect(p95).toBeLessThanOrEqual(33.4);

  // And the appearance actually changed — otherwise this measures an idle page.
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
    'dark'
  );
});

/* ------------------------------------------------------------------------- *
 * The dial's own render loop (007, T055, V71, Principle V).
 *
 * The three cases above measure the display a player gets by default, and the
 * dial is a second render loop beside it: a bigger element, one transform per
 * frame plus an opacity, and twelve labels and thirteen marks that must NOT be
 * re-rendered per reading. None of that is covered by a suite that only ever
 * loads the line — T002 flagged exactly this gap, and Phase 7 measured the dial
 * by hand-editing a spec, which is a number nobody can reproduce later.
 *
 * Same instruments, same budgets, `useDial` seeded, so the dial's numbers and
 * the line's are directly comparable rather than merely both green.
 * ------------------------------------------------------------------------- */

test('the needle moves without re-rendering React (guarantee R1, G21)', async ({ page }) => {
  test.setTimeout(120_000);

  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');
  await waitForNeedleAngle(page);

  await page.evaluate(() => {
    const counts = { needle: 0, other: 0 };
    (window as unknown as { __counts: typeof counts }).__counts = counts;

    // The WRAPPER, not the needle: the rotation goes on a dial-sized concentric
    // element, because `rotate()` turns an element about its own centre (G21).
    const wrapper = document.querySelector('[data-testid="dial-needle-wrapper"]');
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === wrapper) counts.needle += 1;
        else counts.other += 1;
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });

  await page.waitForTimeout(5_000);

  const counts = await page.evaluate(
    () => (window as unknown as { __counts: { needle: number; other: number } }).__counts
  );

  expect(counts.needle).toBeGreaterThan(100);
  expect(
    counts.other,
    `expected the rest of the tree to stay quiet; needle=${counts.needle} other=${counts.other}`
  ).toBeLessThan(counts.needle / 2);
});

test('the dial sustains its frame budget through a continuous session (SC-067, V71)', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await useDial(page);
  await page.goto('/');
  await waitForNote(page, 'E');

  const frames = await page.evaluate(async () => {
    const deltas: number[] = [];
    await new Promise<void>((resolve) => {
      let previous = performance.now();
      const started = previous;
      const tick = (now: number) => {
        deltas.push(now - previous);
        previous = now;
        if (now - started >= 20_000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return deltas;
  });

  const steady = frames.slice(1).sort((a, b) => a - b);
  expect(steady.length).toBeGreaterThan(500);

  const p50 = steady[Math.floor(steady.length * 0.5)]!;
  const p95 = steady[Math.floor(steady.length * 0.95)]!;
  const worst = steady[steady.length - 1]!;

  console.log(
    `dial frame time: p50 ${p50.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms  max ${worst.toFixed(1)}ms`
  );

  // The same two budgets the line is held to. `max` is deliberately printed and
  // not asserted: T003 recorded a 27.7ms outlier on an unloaded machine running
  // the LINE, which is why that baseline says to compare p50 and p95.
  expect(p50).toBeLessThanOrEqual(17.5);
  expect(p95).toBeLessThanOrEqual(33.4);
});

test('the dial reaches a usable display within the cold-start budget (V71)', async ({ page }) => {
  await useDial(page);
  await page.addInitScript(() => {
    const record = (): void => {
      (window as unknown as { __coldStartMs?: number }).__coldStartMs = performance.now();
    };

    if (document.querySelector('[data-testid="tuning-dial"]')) {
      record();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="tuning-dial"]')) return;
      record();
      observer.disconnect();
    });

    // `document`, not `document.documentElement` — see the line's version.
    observer.observe(document, { childList: true, subtree: true });
  });

  await page.goto('/');
  await expect(page.getByTestId('tuning-dial')).toBeVisible();

  const coldStartMs = await page.evaluate(
    () => (window as unknown as { __coldStartMs?: number }).__coldStartMs
  );

  expect(coldStartMs, 'the cold-start observer never fired').toBeDefined();
  console.log(`dial cold start to usable display: ${coldStartMs!.toFixed(1)}ms`);

  expect(coldStartMs!).toBeLessThanOrEqual(2_000);
});
