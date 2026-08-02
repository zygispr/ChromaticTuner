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
