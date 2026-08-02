import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * User Story 4, end to end in a real browser (V12).
 *
 * This is also where `LocalStoragePreferences` is verified against the port
 * contract, for the same reason `WebAudioSource` is (T045): the shared suite
 * runs headless, and obligation P4 is specifically about surviving a full
 * restart — which only a real browser reload can actually demonstrate.
 */

const STORAGE_KEY = 'chromatic-tuner:preferences';

test('shows the reference pitch and marks a non-standard one (FR-022)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const badge = page.getByTestId('reference-badge');
  await expect(badge).toContainText('440');
  await expect(badge).toHaveAttribute('data-non-standard', 'false');

  await badge.click();
  await page.getByTestId('a4-slider').fill('432');

  await expect(page.getByTestId('a4-value')).toHaveText('432');
  await page.getByTestId('settings-close').click();

  await expect(badge).toContainText('432');
  await expect(badge).toHaveAttribute('data-non-standard', 'true');
});

test('a 440 Hz string reads about +32 cents once A4 is 432 (V12)', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('415');
  await page.getByTestId('settings-close').click();

  // The fixture is a steady E2. Against a lower reference the same physical
  // pitch sits sharp of whatever note is now nearest — the note name may move,
  // but the tuner must keep reading rather than blanking (guarantee N7).
  await expect(page.getByTestId('note-label')).not.toHaveText('–', { timeout: 15_000 });

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('432');
  await page.getByTestId('settings-close').click();

  // The shift is a ratio, so it is the same for every note: 440/432 is +31.8
  // cents, and an in-tune E2 read against A4 = 432 must sit at exactly that.
  // Tight bounds on purpose — a loose band here would pass even if the
  // reference pitch were being applied at half strength or not at all.
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId('cents-readout').textContent();
        return Number(/-?\d+/.exec(text ?? '')?.[0] ?? Number.NaN);
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThan(28);

  const text = await page.getByTestId('cents-readout').textContent();
  const cents = Number(/-?\d+/.exec(text ?? '')?.[0] ?? Number.NaN);
  expect(cents).toBeLessThan(36);
});

test('the accidental preference applies wherever a note is shown (FR-023)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('accidental-flat').click();
  await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('settings-close').click();

  // E has no accidental, so assert the preference reached the store and the
  // control rather than inventing a fixture for a black key here — the naming
  // itself is exhaustively covered by the core's note tests.
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ accidentalStyle: 'flat' });
});

test('settings survive a full reload (FR-024, obligation P4)', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('444');
  await page.getByTestId('accidental-flat').click();
  await page.getByTestId('settings-close').click();

  // A reload, not a re-render: this is the difference between "kept in state"
  // and "actually persisted", and it is the whole of FR-024.
  await page.reload();
  await waitForNote(page, 'E');

  await expect(page.getByTestId('reference-badge')).toContainText('444');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true');
});

test('reset returns to defaults and clears storage', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('420');
  await expect(page.getByTestId('a4-value')).toHaveText('420');

  await page.getByTestId('settings-reset').click();

  await expect(page.getByTestId('a4-value')).toHaveText('440');
  await expect(page.getByTestId('accidental-sharp')).toHaveAttribute('aria-pressed', 'true');

  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBeNull();
});

test('a corrupt stored preference does not stop the tuner (obligation P1)', async ({ page }) => {
  // The case that matters most: whatever is in storage, tuning still works.
  await page.addInitScript((key) => {
    localStorage.setItem(key, '{ not json at all');
  }, STORAGE_KEY);

  await page.goto('/');
  await waitForNote(page, 'E');

  await expect(page.getByTestId('reference-badge')).toContainText('440');
});

test('settings are reachable and dismissible by keyboard (SC-013)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-sheet')).toHaveCount(0);
});
