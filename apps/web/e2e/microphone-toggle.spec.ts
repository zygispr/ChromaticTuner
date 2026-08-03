import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

/**
 * User Story 1 (T004, T005): the microphone can be stopped and started.
 *
 * Runs against the real fake-device stack rather than a stubbed session,
 * because the thing under test is whether capture actually stops — a mocked
 * flag would report success while the stream stayed open, which is precisely
 * the failure this story exists to prevent.
 */
test.use(audioArgs('e2-in-tune.wav'));

/**
 * Drive the real page-visibility transition.
 *
 * `visibilityState` is a read-only getter, so it has to be redefined before the
 * event is dispatched — dispatching alone leaves the handler reading `visible`
 * and the test passes for the wrong reason.
 */
async function setVisibility(page: import('@playwright/test').Page, state: 'hidden' | 'visible') {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('stops capture and starts it again without a reload (FR-036, FR-037, FR-038)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const toggle = page.getByTestId('microphone-toggle');
  await expect(toggle).toBeVisible();

  await toggle.click();

  // The note must clear. A tuner that keeps showing "E 2" after the microphone
  // is released is asserting a reading it can no longer be making.
  await expect(page.getByTestId('note-label')).not.toContainText('E', { timeout: 10_000 });
  await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);

  await toggle.click();
  await waitForNote(page, 'E');
});

test('the control names the action it will take, and that name changes (FR-039, FR-042)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const toggle = page.getByTestId('microphone-toggle');
  await expect(toggle).toHaveAccessibleName(/stop listening/i);

  await toggle.click();
  await expect(toggle).toHaveAccessibleName(/start listening/i);
});

test('the stopped state is not mistakable for silence (FR-039)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('microphone-toggle').click();

  // "Listening — play a string" and "the microphone is off" are the two states
  // a glancing player must never confuse: one means play something, the other
  // means press the button. The idle copy is also wrong here — before this
  // story, stopping showed "Starting…", which is the opposite of what happened.
  const status = page.getByTestId('tuner-status');
  await expect(status).toContainText(/microphone is off/i);
  await expect(status).not.toContainText(/listening/i);
  await expect(status).not.toContainText(/starting/i);
});

test('a user-initiated stop survives backgrounding and returning (FR-040)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('microphone-toggle').click();
  await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);

  await setVisibility(page, 'hidden');
  await setVisibility(page, 'visible');

  // The whole point of the story. `useMicrophoneLifecycle` calls start() on
  // every return to the foreground, so without intent gating the hook this
  // reopens the microphone with no user action — and the user's explicit
  // decision is silently reversed by a lifecycle handler.
  await expect(page.getByTestId('tuner-status')).toContainText(/microphone is off/i);
  await expect(page.getByTestId('note-label')).not.toContainText('E');

  // And it must still be recoverable by hand afterwards.
  await page.getByTestId('microphone-toggle').click();
  await waitForNote(page, 'E');
});
