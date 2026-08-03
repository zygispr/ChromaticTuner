import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

/**
 * The tuner must not move vertically as its status changes.
 *
 * `StatusBanner` renders nothing while a note is being read and something while
 * listening, stopped, or failing — and the display is centre-justified, so the
 * banner appearing or vanishing re-centres the whole column. Measured before the
 * fix: everything above shifted **up 37 px** and the microphone control **down
 * 37 px**, every single time.
 *
 * That is not only a stop/start problem. The banner is absent while `reading`
 * and present while `listening`, so the display also jumped every time a note
 * was acquired or lost — which is what a tuner does constantly. It is the
 * signature element of the product moving under the player's eyes while they
 * are trying to read it from a metre away (FR-017, FR-021).
 */
test.use(audioArgs('e2-then-silence.wav'));

type Positions = Record<string, number>;

/** Top edge of each element that must not move, in viewport pixels. */
async function positions(page: import('@playwright/test').Page): Promise<Positions> {
  return page.evaluate(() => {
    const ids = ['reference-badge', 'note-label', 'cents-readout', 'tuning-line', 'direction-cue'];
    const out: Record<string, number> = {};
    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (element) out[id] = Math.round(element.getBoundingClientRect().y);
    }
    return out;
  });
}

function expectUnmoved(before: Positions, after: Positions, what: string) {
  for (const [id, y] of Object.entries(before)) {
    expect(after[id], `${id} moved ${(after[id] ?? NaN) - y}px ${what}`).toBe(y);
  }
}

test('the tuner does not move when capture is stopped and restarted (FR-021)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.waitForTimeout(300);

  const reading = await positions(page);
  expect(Object.keys(reading).length).toBeGreaterThan(3);

  await page.getByTestId('microphone-toggle').click();
  await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);
  expectUnmoved(reading, await positions(page), 'when capture stopped');

  await page.getByTestId('microphone-toggle').click();
  await waitForNote(page, 'E');
  await page.waitForTimeout(300);
  expectUnmoved(reading, await positions(page), 'when capture restarted');
});

test('the tuner does not move when a note is lost and re-acquired (FR-021)', async ({ page }) => {
  await page.goto('/');

  // The fixture is 3 s of tone then 3 s of silence, on a loop, so both states
  // arrive on their own without touching any control.
  await waitForNote(page, 'E');
  await page.waitForTimeout(300);
  const reading = await positions(page);

  await expect(page.getByTestId('tuner-status')).toContainText(/listening/i, { timeout: 15_000 });
  expectUnmoved(reading, await positions(page), 'when the note was lost');

  await waitForNote(page, 'E');
  await page.waitForTimeout(300);
  expectUnmoved(reading, await positions(page), 'when the note was re-acquired');
});
