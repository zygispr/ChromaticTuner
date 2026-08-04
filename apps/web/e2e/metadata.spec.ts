import { expect, test } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

/**
 * The page identity a consumer that does not run our code depends on
 * (contract P1–P12a).
 *
 * This file grows through the feature: the document outline lands first,
 * because the rest of the identity is meaningless on a page whose heading
 * structure is wrong.
 */
test.use(audioArgs('e2-in-tune.wav'));

async function headingCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('h1').length);
}

/**
 * P2: the heading count does not depend on microphone permission.
 *
 * This is the defect D4 names. Before 003 the app's only `<h1>` lived inside
 * `PermissionPrompt` — so the page had one top-level heading while permission
 * was pending and **zero** the moment it was granted, because the element
 * unmounted. A crawler and a returning user therefore saw different document
 * outlines, and the steady state was the one with no heading at all.
 *
 * Invariance is asserted separately from the count for a reason: it is the half
 * that catches a heading owned by a component whose lifetime is shorter than
 * the page's, which is the actual mistake. The absolute count is pinned by the
 * companion test below.
 */
test('the heading count is the same before and after permission is granted (P2)', async ({
  page,
}) => {
  // `permissions: []` on the context is not enough to reach the explainer: this
  // suite runs with `--use-fake-ui-for-media-stream`, which auto-accepts, so
  // `navigator.permissions.query` answers `granted` and `TunerGate` goes
  // straight to the tuner. Stubbing the query is how `permissions.spec.ts`
  // already handles the same conflict — the fake-device flags and a real
  // permission decision cannot both be in force.
  await page.addInitScript(() => {
    navigator.permissions.query = async () =>
      ({
        state: 'prompt',
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as PermissionStatus;
  });

  await page.goto('/');
  await expect(page.getByTestId('permission-prompt')).toBeVisible();
  const before = await headingCount(page);

  await page.getByTestId('allow-microphone').click();
  await expect(page.getByTestId('tuning-line')).toBeVisible();
  const after = await headingCount(page);

  expect(
    after,
    `the document had ${before} <h1> before permission and ${after} after — a heading that ` +
      `depends on permission state is owned by the wrong element`
  ).toBe(before);
});

/**
 * P2: exactly one `<h1>`, not "at least one".
 *
 * "At least one" passes on a document with two, which is the state this feature
 * produces if the static heading is added without demoting the one inside
 * `PermissionPrompt`. Both counts are wrong and only an equality assertion
 * separates them.
 */
test('the document has exactly one top-level heading (P2, FR-063)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  expect(await headingCount(page), 'the document must have exactly one <h1>').toBe(1);
});
