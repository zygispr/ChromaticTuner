/**
 * Verifies the offline and cold-start claims against the PRODUCTION build
 * (FR-026, FR-030, SC-011 — quickstart V9's offline half).
 *
 * This cannot be a Playwright spec in the normal suite: that suite runs against
 * `vite dev`, which does not emit the service worker, so neither the precache
 * nor the offline path exists there. Run it against `vite preview`:
 *
 *   pnpm --filter @chromatic-tuner/web build
 *   pnpm --filter @chromatic-tuner/web preview --port 4173 &
 *   pnpm --filter @chromatic-tuner/web verify:offline
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const WAV = fileURLToPath(new URL('../e2e/fixtures/e2-in-tune.wav', import.meta.url));
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const BUDGET_MS = 2000;

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${WAV}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({ permissions: ['microphone'] });
const page = await context.newPage();

const failedRequests = [];
page.on('requestfailed', (request) =>
  failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`)
);

/** Navigate and time how long until the tuner actually reports a note. */
async function timeToFirstReading(label) {
  failedRequests.length = 0;
  const started = Date.now();
  await page.goto(BASE, { waitUntil: 'commit' });
  await page
    .locator('[data-testid="note-label"]')
    .filter({ hasText: 'E' })
    .first()
    .waitFor({ timeout: 30_000 });
  const ms = Date.now() - started;
  console.log(`${label.padEnd(34)} ${String(ms).padStart(5)} ms`);
  return ms;
}

// Cold: first ever visit, nothing cached, service worker not yet installed.
const coldMs = await timeToFirstReading('cold (no service worker)');

await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
  timeout: 15_000,
});

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const entries = {};
  for (const name of names) {
    const cache = await caches.open(name);
    entries[name] = (await cache.keys()).map((request) => new URL(request.url).pathname);
  }
  return entries;
});

const warmMs = await timeToFirstReading('warm (service worker serving)');

// The one that matters: a cold reload with no network at all (SC-011).
await context.setOffline(true);
const offlineMs = await timeToFirstReading('offline (network disabled)');

if (failedRequests.length > 0) {
  throw new Error(`offline load had failed requests:\n  ${failedRequests.join('\n  ')}`);
}

await browser.close();

console.log('\nprecached:', JSON.stringify(cached, null, 2));
console.log(`\nbudget: ${BUDGET_MS} ms (FR-026)`);

const over = [coldMs, warmMs, offlineMs].filter((ms) => ms > BUDGET_MS);
if (over.length > 0) {
  throw new Error(`cold start exceeded the ${BUDGET_MS} ms budget: ${over.join(', ')} ms`);
}
console.log('all three starts are inside the budget.');
