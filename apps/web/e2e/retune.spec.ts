import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

test.use(audioArgs('e2-to-d2-sweep.wav'));

/**
 * User Story 2, end to end in a real browser: a string loosened a whole tone
 * from E2 to D2.
 *
 * The unit tests pin the filter chain's behaviour precisely; this proves the
 * same behaviour survives the AudioWorklet, the real detector, React, and the
 * DOM. Chromium replays the sweep on a loop, so rather than a sequence of
 * waits, the test records one continuous trace and asserts over it — a wait per
 * note could step over a flicker between two samples, which is exactly the
 * defect FR-011 is about.
 */

interface Sample {
  readonly note: string;
  readonly cents: number | null;
}

/** Poll the display for `durationMs`, returning everything it showed. */
async function traceDisplay(page: import('@playwright/test').Page, durationMs: number) {
  const samples: Sample[] = [];
  const deadline = Date.now() + durationMs;

  while (Date.now() < deadline) {
    const [noteText, centsText] = await Promise.all([
      page.getByTestId('note-label').textContent(),
      page.getByTestId('cents-readout').textContent(),
    ]);

    const match = /-?\d+/.exec(centsText ?? '');
    samples.push({
      note: (noteText ?? '').trim(),
      cents: match ? Number(match[0]) : null,
    });

    await page.waitForTimeout(80);
  }

  return samples;
}

/** Note names in order, without octaves, ignoring "no reading" and repeats. */
function noteSequence(samples: readonly Sample[]): string[] {
  const sequence: string[] = [];
  for (const { note } of samples) {
    // Strip the octave digit; "E2" and "E" are the same note for this test.
    const name = note.replace(/\d/g, '');
    if (name === '' || name === '–') continue;
    if (sequence[sequence.length - 1] !== name) sequence.push(name);
  }
  return sequence;
}

test('names each note once while a string is loosened a whole tone', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  // The fixture is a 6 s sweep on a loop; 14 s guarantees a whole pass.
  const sequence = noteSequence(await traceDisplay(page, 14_000));

  const start = sequence.indexOf('E');
  expect(start, `expected to see E in ${JSON.stringify(sequence)}`).toBeGreaterThanOrEqual(0);

  // E → D♯ → D and nothing in between. A flicker at either boundary would show
  // up here as E, D♯, E, … and fail (FR-011).
  expect(sequence.slice(start, start + 3)).toEqual(['E', 'D♯', 'D']);
});

test('sweeps the marker across the full line between name changes', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  const samples = await traceDisplay(page, 14_000);

  // While D♯ is displayed the pitch travels from just under its upper midpoint
  // to just past its lower one, so the readout must visit both extremes (V3).
  const middle = samples
    .filter((sample) => sample.note.replace(/\d/g, '') === 'D♯' && sample.cents !== null)
    .map((sample) => sample.cents!);

  expect(middle.length, 'expected the sweep to spend time on D♯').toBeGreaterThan(3);
  expect(Math.max(...middle)).toBeGreaterThan(30);
  expect(Math.min(...middle)).toBeLessThan(-30);
});

test('keeps telling the player which way to turn throughout the retune', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  const cue = page.getByTestId('direction-cue');

  // SC-008: a retune is one continuous motion, so the cue must never go blank
  // while the string is audibly off pitch. Sampling repeatedly over a full pass
  // catches a cue that drops out at a note boundary.
  for (let i = 0; i < 40; i += 1) {
    const [cueText, centsText] = await Promise.all([
      cue.textContent(),
      page.getByTestId('cents-readout').textContent(),
    ]);
    const match = /-?\d+/.exec(centsText ?? '');

    if (match && Math.abs(Number(match[0])) > 10) {
      expect(cueText?.trim(), `blank cue at ${match[0]} cents`).toMatch(/tighten|loosen/i);
    }

    await page.waitForTimeout(150);
  }
});
