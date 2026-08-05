import { expect, test, type Page } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * User Story 3 — a blocked microphone is a state with a way out (V6, SC-014).
 *
 * The permission *decision* is stubbed rather than driven through Chromium's
 * own permission machinery, for a specific reason: the fake-device flags this
 * suite needs (`--use-fake-ui-for-media-stream`) auto-accept every prompt, and
 * removing them makes `getUserMedia` fail with `NotSupportedError` instead of
 * `NotAllowedError` — the app would then be tested against the wrong error and
 * the test would pass while proving nothing about permissions.
 *
 * Everything downstream of that one decision is real: the adapter's error
 * mapping, the session state machine, the automatic retry loop, and the DOM.
 */
async function stubMicrophonePermission(page: Page, initiallyAllowed: boolean): Promise<void> {
  await page.addInitScript((allowed) => {
    const state = { allowed };
    (window as unknown as { __setMicAllowed: (value: boolean) => void }).__setMicAllowed = (
      value: boolean
    ) => {
      state.allowed = value;
    };

    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!state.allowed) {
        throw new DOMException('Permission dismissed', 'NotAllowedError');
      }
      return real(constraints);
    };
  }, initiallyAllowed);
}

/** Flip the stub without reloading — the whole point of the recovery test. */
async function allowMicrophone(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __setMicAllowed: (value: boolean) => void }).__setMicAllowed(true);
  });
}

test('a blocked microphone explains itself and offers a next step', async ({ page }) => {
  await stubMicrophonePermission(page, false);
  await page.goto('/');

  const banner = page.getByTestId('status-banner');
  await expect(banner).toHaveAttribute('data-status', 'permission-denied', { timeout: 15_000 });

  // SC-014: an explanation AND a next step. A bare error message is a dead end.
  await expect(page.getByTestId('tuner-status')).toContainText(/blocked/i);
  await expect(page.getByTestId('recovery-steps')).toContainText(/address bar|site settings/i);
  await expect(page.getByTestId('retry-button')).toBeVisible();
});

test('recovers automatically when permission is granted, with no reload', async ({ page }) => {
  test.setTimeout(90_000);

  await stubMicrophonePermission(page, false);
  await page.goto('/');

  await expect(page.getByTestId('status-banner')).toHaveAttribute(
    'data-status',
    'permission-denied',
    { timeout: 15_000 }
  );

  // The user allows the microphone in browser settings. Nothing reloads and
  // nothing is clicked — the session's own retry loop has to notice (FR-029).
  await allowMicrophone(page);

  await waitForNote(page, 'E');
  await expect(page.getByTestId('status-banner')).toHaveCount(0);
});

test('the retry button reaches the tuner without waiting for the retry loop', async ({ page }) => {
  test.setTimeout(90_000);

  await stubMicrophonePermission(page, false);
  await page.goto('/');

  const retry = page.getByTestId('retry-button');
  await expect(retry).toBeVisible({ timeout: 15_000 });

  await allowMicrophone(page);
  await retry.click();

  await waitForNote(page, 'E');
});

test('a blocked microphone is never presented as one that is listening', async ({ page }) => {
  test.setTimeout(90_000);

  await stubMicrophonePermission(page, false);
  await page.goto('/');

  await expect(page.getByTestId('status-banner')).toHaveAttribute(
    'data-status',
    'permission-denied',
    { timeout: 15_000 }
  );

  // The regression: capture INTENT survives a failed start, and the control's
  // label was derived from intent alone. Denying the prompt therefore left two
  // buttons on screen — "Try again", and a "Stop listening" that asserted the
  // tuner held the very microphone it had just failed to open (FR-039).
  const toggle = page.getByTestId('microphone-toggle');
  await expect(toggle).toHaveAccessibleName(/start listening/i);
  await expect(toggle).toHaveAttribute('data-capturing', 'false');

  // And it has to be a real way out, not just honest signage: pressing a
  // control that says "start" must start, which here means retrying.
  await allowMicrophone(page);
  await toggle.click();

  await waitForNote(page, 'E');
});

test('explains why the microphone is needed before the browser asks', async ({ page }) => {
  // FR-028 and FR-031: the explainer, including the promise that audio never
  // leaves the device, must come before the system prompt — so it is shown
  // whenever a prompt is still to come.
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
  await expect(page.getByTestId('privacy-note')).toContainText(/never recorded/i);
  await expect(page.getByTestId('privacy-note')).toContainText(/never sent anywhere/i);

  // Nothing has been captured yet: the tuner only appears after the user agrees.
  await expect(page.getByTestId('tuner-display')).toHaveCount(0);

  await page.getByTestId('allow-microphone').click();
  await waitForNote(page, 'E');
});
