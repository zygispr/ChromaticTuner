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

/**
 * P5: the canonical address is absolute and actually resolved.
 *
 * The `%` clause is the one that matters. Vite leaves an undefined `%VITE_*%`
 * token **in place** rather than replacing it with an empty string, so a build
 * with no origin configured ships a canonical whose value is a URL-shaped
 * literal. "Non-empty" passes on that; "parses as a URL" very nearly does too.
 *
 * 003 removed the token substitution in favour of the plugin resolving the
 * origin directly, which makes this structurally impossible — the assertion
 * stays because structure can be undone by a later edit and the check is cheap.
 */
test('the canonical address is absolute and resolved (P5, FR-074)', async ({ page }) => {
  await page.goto('/');

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

  expect(canonical, 'no <link rel="canonical"> in the document').toBeTruthy();
  expect(canonical, `canonical contains an unresolved template token: ${canonical}`).not.toContain(
    '%'
  );
  expect(() => new URL(canonical!), `canonical is not an absolute URL: ${canonical}`).not.toThrow();
  expect(new URL(canonical!).protocol, `canonical is not http(s): ${canonical}`).toMatch(
    /^https?:$/
  );
});

/**
 * P12 / FR-072, FR-073: crawl directives exist and point at each other.
 *
 * Served in development as well as emitted at build, so this is one HTTP
 * request rather than a build-output check — the same document a crawler would
 * ask for. The build-output half (emission, and the disallow-all variant for a
 * non-canonical origin) is `scripts/verify-build-output.mjs`, because those are
 * properties of `dist/` and cannot be observed through the dev server.
 */
test('serves robots.txt, and a non-canonical origin disallows crawling (P12, FR-076)', async ({
  request,
}) => {
  const response = await request.get('/robots.txt');
  expect(response.status(), 'robots.txt is not served').toBe(200);

  // The dev server runs on the fallback origin, which is by definition not the
  // canonical one — so the correct answer here is the disallow-all variant, and
  // asserting it is a real FR-076 check rather than a workaround. If this ever
  // starts allowing crawlers, a preview deployment would compete with the live
  // site for the same queries.
  //
  // The canonical variant — allow, plus an absolute Sitemap line — is asserted
  // by `scripts/verify-build-output.mjs`, which can set the origin the build
  // reads. That branch cannot be reached through the dev server at all.
  const body = await response.text();
  expect(body, 'a non-canonical origin served a crawlable robots.txt').toMatch(
    /^Disallow:\s*\/\s*$/m
  );
});

test('serves a sitemap listing exactly the canonical address (P12, FR-073)', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

  const response = await request.get('/sitemap.xml');
  expect(response.status(), 'sitemap.xml is not served').toBe(200);

  const body = await response.text();
  const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  expect(locations, 'the sitemap lists more than the one real page').toEqual([canonical]);
});
