import { PREFERENCES_STORAGE_KEY } from '@chromatic-tuner/core';
import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Shared setup for the fake-microphone specs.
 *
 * Chromium replays a WAV file as the capture device, so the whole stack —
 * getUserMedia, the AudioWorklet, the analyzer, the filter chain, and the DOM —
 * runs for real against a known input with no hardware (research D10).
 *
 * `launchOptions` cannot be set per `describe` (Playwright forces a new worker
 * for it), so each fixture gets its own spec file with a top-level `test.use`.
 */
export function audioArgs(wav: string) {
  const file = fileURLToPath(new URL(`./fixtures/${wav}`, import.meta.url));
  return {
    launchOptions: {
      args: [
        // Required. Without it Chromium rejects getUserMedia with
        // NotSupportedError even when the context has been granted the
        // microphone permission — the fake device alone is not enough.
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${file}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  };
}

/** The readout settles a few analysis hops after the stream starts. */
export async function waitForNote(page: Page, note: string): Promise<void> {
  await expect(page.getByTestId('note-label')).toContainText(note, { timeout: 20_000 });
}

/**
 * Open the settings sheet and wait until it is ready to be driven.
 *
 * Waiting for the sheet to be visible is not enough. `open` is React state, so
 * the sheet paints in the commit and the autofocus lands in a PASSIVE effect
 * flushed after it — a `toBeVisible()` that polls in between resolves on a
 * sheet whose focus is still moving. A test that then focuses a control of its
 * own races the effect and loses at random, which for this feature would look
 * exactly like the defect under test.
 *
 * So this waits on the state the sheet actually settles into: focus on the
 * Done button, which is guarantee K1 and existing behaviour (FR-020). Every
 * caller starts from one known active element rather than from whichever of
 * the two won.
 */
export async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await expect(page.getByTestId('settings-close')).toBeFocused();
}

/**
 * What currently holds focus, named the way an assertion can read it.
 *
 * Returns the active element's `data-testid`, falling back to its tag name —
 * so focus resting on the document body reports `BODY` rather than
 * `undefined`, and "focus escaped to the page behind" is distinguishable from
 * "focus escaped to nowhere". Those are different defects with different
 * causes: a half-written trap produces the first, and a native `<dialog>`
 * produces the second (D2, measured).
 *
 * Playwright's `toBeFocused()` cannot serve here. It asserts against a locator
 * chosen in advance, and these tests need the opposite question — not "is X
 * focused" but "what is", when the failure being caught is focus landing on an
 * element the test did not think to name.
 */
export async function activeTestId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    // Only observed with no document at all; reported rather than coerced to a
    // tag name that would read as a real element.
    if (!active) return 'NONE';
    return active.getAttribute('data-testid') ?? active.tagName;
  });
}

/** Parse the signed integer out of the cents readout. */
export async function readCents(page: Page): Promise<number> {
  const text = await page.getByTestId('cents-readout').textContent();
  const match = /-?\d+/.exec(text ?? '');
  expect(match, `expected a numeric cents readout, got "${text}"`).not.toBeNull();
  return Number(match![0]);
}

/**
 * Where the marker actually sits, in pixels either side of the line's centre.
 *
 * Measured from the rendered boxes rather than read off the inline style,
 * because that is the difference between "a transform was applied" and "the
 * marker is where it should be". A percentage translation resolves against the
 * transformed element's own width, so an implementation that applies it to the
 * 6px marker instead of the full-width track moves it 2.4px where it should
 * move 144px — and every assertion phrased as `transform !== 'none'` passes
 * happily throughout. That shipped for seven phases before someone looked at a
 * screenshot.
 */
export async function markerOffsetPx(page: Page): Promise<number> {
  const line = await page.getByTestId('tuning-line').boundingBox();
  const marker = await page.getByTestId('tuning-marker').boundingBox();

  expect(line, 'tuning line has no box').not.toBeNull();
  expect(marker, 'tuning marker has no box').not.toBeNull();

  return marker!.x + marker!.width / 2 - (line!.x + line!.width / 2);
}

/** Half the line's width: the distance the marker travels for 50 cents. */
export async function lineHalfWidthPx(page: Page): Promise<number> {
  const line = await page.getByTestId('tuning-line').boundingBox();
  expect(line, 'tuning line has no box').not.toBeNull();
  return line!.width / 2;
}

/**
 * Assert the marker sits where the readout says it should, within a tolerance.
 *
 * The line spans ±50 cents, so the offset is a straight proportion of half the
 * width. This is FR-005 and FR-006 stated as arithmetic.
 *
 * Each sample reads the readout and the geometry in a SINGLE evaluate, in one
 * frame — reading them separately means two round-trips with marker travel in
 * between, and comparing a number from one instant against a position from
 * another is how a correct implementation fails intermittently.
 *
 * Even so, one sample is not enough. The marker animates to its target over
 * `motion.markerMs` by design, the readout is throttled to 10 Hz, and Chromium
 * loops the fixture — so at any given instant the marker may legitimately be
 * mid-flight toward a value the readout has already moved past. Measured
 * disagreement at a single arbitrary moment reached 44px on a correct build.
 *
 * So this samples across a second and asserts on the MEDIAN. A transient
 * spoils one or two samples; a scale error — the defect this exists to catch,
 * which put the marker 144px from where it belonged — is wrong in every one.
 */
export async function expectMarkerAtCents(page: Page, tolerancePx = 20, samples = 11) {
  const errors: number[] = [];
  let last = '';

  for (let i = 0; i < samples; i += 1) {
    const sample = await page.evaluate(() => {
      const line = document.querySelector('[data-testid="tuning-line"]')!.getBoundingClientRect();
      const marker = document
        .querySelector('[data-testid="tuning-marker"]')!
        .getBoundingClientRect();
      const text = document.querySelector('[data-testid="cents-readout"]')?.textContent ?? '';
      return {
        cents: Number(/-?\d+/.exec(text)?.[0] ?? Number.NaN),
        offset: marker.x + marker.width / 2 - (line.x + line.width / 2),
        halfWidth: line.width / 2,
      };
    });

    if (!Number.isNaN(sample.cents)) {
      const expected = (Math.max(-50, Math.min(50, sample.cents)) / 50) * sample.halfWidth;
      errors.push(Math.abs(sample.offset - expected));
      last = `marker at ${sample.offset.toFixed(1)}px, expected ~${expected.toFixed(1)}px for ${sample.cents} cents`;
    }

    await page.waitForTimeout(100);
  }

  expect(errors.length, 'no numeric cents readout in any sample').toBeGreaterThan(samples / 2);

  errors.sort((a, b) => a - b);
  const median = errors[Math.floor(errors.length / 2)]!;

  expect(
    median,
    `median disagreement ${median.toFixed(1)}px over ${errors.length} samples; ${last}`
  ).toBeLessThanOrEqual(tolerancePx);
}

/**
 * Where the needle actually points, in degrees clockwise from the top.
 *
 * Derived from RENDERED BOXES, not from the transform, and that distinction is
 * the whole reason this exists (007 research D5, guarantee G21). `rotate()`
 * turns an element about its OWN centre. A needle drawn from the dial's centre
 * to its rim has its centre halfway along itself, so rotating the needle
 * directly makes it orbit its own midpoint and swing clean out of the circle —
 * while `getComputedStyle(needle).transform` reports exactly the matrix that
 * was asked for. Every assertion phrased against the matrix passes on that
 * build. This is the rotate-shaped twin of the `translateX` bug that
 * {@link markerOffsetPx} exists for, and it is caught the same way: measure the
 * geometry, not the instruction.
 *
 * A rectangle is centrally symmetric, so its axis-aligned bounding box stays
 * centred on its own centre at every angle — the midpoint is therefore exact,
 * not an approximation that degrades off the axes.
 *
 * Under the D5 defect the needle's midpoint never leaves twelve o'clock, so
 * this reads ~0 whatever the tone.
 */
export async function needleAngleDeg(page: Page): Promise<number> {
  const dial = await page.getByTestId('tuning-dial').boundingBox();
  const needle = await page.getByTestId('dial-needle').boundingBox();

  expect(dial, 'tuning dial has no box').not.toBeNull();
  expect(needle, 'dial needle has no box').not.toBeNull();

  const dx = needle!.x + needle!.width / 2 - (dial!.x + dial!.width / 2);
  const dy = needle!.y + needle!.height / 2 - (dial!.y + dial!.height / 2);

  // Clockwise from straight up, which is how the dial is specified. Screen y
  // grows downwards, hence the negation.
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * The needle's ACCUMULATED angle, read from the wrapper's inline transform.
 *
 * Deliberately a different measurement from {@link needleAngleDeg}, because the
 * two defects need different instruments and neither can see the other's:
 *
 * - The bounding box says WHERE the needle points. It is bounded to [0, 360)
 *   and so cannot distinguish 345 from 705 — it is blind to the wrap.
 * - This says WHICH NUMBER was handed to the animation. Both a CSS transition
 *   and a Reanimated `withTiming` interpolate between two numbers, so feeding
 *   345 then -15 sweeps the needle 359 degrees backwards to travel 0.6 forward
 *   (G9, G10). The endpoint is identical either way, which is why an assertion
 *   about where the needle came to rest cannot catch this.
 *
 * Returns `null` when no needle is drawn at all — before the first reading of a
 * session (FR-163), which is a state with no angle rather than an angle of zero.
 */
export async function needleAccumulatedDeg(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const wrapper = document.querySelector('[data-testid="dial-needle-wrapper"]');
    if (!wrapper) return null;
    const transform = (wrapper as HTMLElement).style.transform;
    const match = /rotate\((-?[\d.]+)deg\)/.exec(transform);
    return match ? Number(match[1]) : null;
  });
}

/**
 * Start with the dial already chosen, before the first paint.
 *
 * Seeded into storage rather than clicked through Settings: these specs are
 * about what the dial draws, and driving the sheet first would make every
 * geometry failure also a possible settings failure.
 */
export async function useDial(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([key, raw]) => {
      window.localStorage.setItem(key!, raw!);
    },
    [
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance: 'system',
        tunerDisplay: 'dial',
        schemaVersion: 1,
        ...extra,
      }),
    ]
  );
}

/**
 * The needle's angle, sampled across a second and reduced to the median.
 *
 * Same reasoning as {@link expectMarkerAtCents}: the needle animates to its
 * target, the fixture loops, and a single sample can legitimately catch it
 * mid-flight. A transient spoils one sample; a geometry error — the wrong pitch
 * class, a mirrored dial, a transform on the wrong element — spoils every one.
 */
export async function medianNeedleAngleDeg(page: Page, samples = 9): Promise<number> {
  const seen: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    seen.push(await needleAngleDeg(page));
    await page.waitForTimeout(60);
  }
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)]!;
}

/**
 * Assert the needle points at `expected`, comparing as DIRECTIONS.
 *
 * Angles are congruent mod 360, so 359 and 1 are two degrees apart and a
 * subtraction would call them 358. Every comparison of two angles in these
 * specs goes through here.
 *
 * The tolerance is deliberately loose. At 0.3 degrees per cent, 4 degrees is
 * ~13 cents — wider than the fixture's own detection jitter, and far narrower
 * than the 30 degrees a wrong pitch class moves the needle or the 180 a mirror
 * does. Tightening it buys nothing and buys flakiness.
 */
export function expectNeedleAt(actual: number, expected: number, toleranceDeg = 4): void {
  // Shortest angular distance, already in [0, 180]. The `+ 540` is `+ 180` plus
  // a full turn, so a negative input still lands in the positive branch of `%`.
  //
  // Asserted DIRECTLY. This first read `180 - difference`, which inverted the
  // whole comparison: a needle exactly on target reported 180 and every failure
  // message said "needle at 60.0°, expected ~60°" while failing. The message
  // was right and the assertion was not.
  const difference = Math.abs(((actual - expected + 540) % 360) - 180);
  expect(difference, `needle at ${actual.toFixed(1)}°, expected ~${expected}°`).toBeLessThan(
    toleranceDeg
  );
}

/** Normalise a CSS colour to a comparable `r,g,b` triple. */
export function rgbOf(value: string): string {
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (match) {
    const [r, g, b] = match[1]!.split(',').map((part) => Number(part.trim()));
    return `${r},${g},${b}`;
  }
  const hex = value.trim().replace('#', '');
  if (hex.length === 6) {
    return `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;
  }
  return value.trim();
}
