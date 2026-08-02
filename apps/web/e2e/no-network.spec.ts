import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * SC-015 and V9 — the app transmits zero bytes of user data.
 *
 * FR-031 and FR-032 are promises made to the user on the permission screen:
 * audio is never transmitted, and no usage data is collected. A promise like
 * that is worth exactly as much as the check that enforces it, so this watches
 * every request the page makes during a real tuning session.
 *
 * Same-origin requests are the app's own assets being loaded. Anything to
 * another origin is, by definition, data leaving the device.
 */
test('makes no outbound requests to any other origin during a tuning session', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);

  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    // data: and blob: carry nothing off the machine — the AudioWorklet itself
    // is loaded from a blob URL.
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== new URL(baseURL!).origin) foreign.push(request.url());
  });

  await page.goto('/');
  await waitForNote(page, 'E');

  // Tune for a while: analytics and telemetry are usually batched, so a
  // snapshot taken the instant the page loads would miss them.
  await page.waitForTimeout(5_000);

  expect(foreign, `unexpected outbound requests: ${foreign.join(', ')}`).toEqual([]);
});

test('sends no request body anywhere while capturing audio', async ({ page }) => {
  test.setTimeout(90_000);

  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' || request.method() === 'HEAD') return;
    // Vite's dev server and HMR use same-origin POSTs for nothing audio-related,
    // but any request carrying a body during a tuning session is worth naming.
    uploads.push(`${request.method()} ${request.url()}`);
  });

  await page.goto('/');
  await waitForNote(page, 'E');
  await page.waitForTimeout(5_000);

  expect(uploads, `unexpected upload: ${uploads.join(', ')}`).toEqual([]);
});
