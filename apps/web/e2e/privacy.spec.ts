import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { privacyDescription, privacyTitle } from '../src/content';

/**
 * The privacy policy as a store reviewer receives it (004 FR-104, research D9).
 *
 * Both stores review a microphone app against a reachable policy, and a
 * reviewer's tooling may not run scripts at all — so every assertion here is
 * about the **served document**, never about a rendered React tree. That is why
 * the page is plain markup and why this file follows `no-script.spec.ts`'s
 * method rather than the tuner specs'.
 *
 * The sentence the page must carry is read from `listing/store-listing.json`,
 * not from a copy in this file. FR-105 requires the permission prompt, both
 * store listings, and this page to explain the microphone in the same terms; a
 * spec that hard-coded the sentence would keep passing while the four surfaces
 * drifted apart, which is the whole failure 004 exists to remove.
 */
test.use({ javaScriptEnabled: false });

const PATH = '/privacy.html';

const listing = JSON.parse(
  readFileSync(new URL('../../../listing/store-listing.json', import.meta.url), 'utf8')
) as { claims: { appName: string; purposeSentence: string } };

const { appName, purposeSentence } = listing.claims;

test('serves the policy text as bytes, with no browser involved (FR-104, D9)', async ({
  request,
}) => {
  const response = await request.get(PATH);
  expect(response.status(), `${PATH} is not served`).toBe(200);

  const html = await response.text();

  const required: ReadonlyArray<readonly [string, string]> = [
    ['the microphone purpose sentence from store-listing.json', purposeSentence],
    ['the app name from store-listing.json', appName],
    ['the document title', privacyTitle],
    ['the meta description', privacyDescription],
    ['the statement that nothing is collected', 'Nothing at all'],
    ['the statement that no audio leaves the device', 'No audio leaves your device'],
  ];

  const missing = required.filter(([, value]) => !html.includes(value)).map(([label]) => label);
  expect(missing, `not present in the served bytes: ${missing.join(', ')}`).toEqual([]);

  // A build-time placeholder that survived would ship a value-shaped literal —
  // the same failure `003` removed from the canonical link. `vite.config.ts`
  // throws on one, and this is the assertion that proves the throw is reached.
  expect(html, 'an unreplaced build placeholder reached the served document').not.toMatch(
    /%CT_[A-Z_]+%/
  );
});

test('the policy page has exactly one h1 and its own canonical (P2, 003 FR-075)', async ({
  page,
  request,
}) => {
  await page.goto(PATH);

  const headings = await page.evaluate(() => document.querySelectorAll('h1').length);
  expect(headings, 'the policy page must have exactly one top-level heading').toBe(1);

  // Read through `evaluate` rather than a locator: a locator's `getAttribute`
  // waits for its element, so a missing canonical costs the full timeout and
  // then reports only that the test timed out. The same fix `no-script.spec.ts`
  // records from 003's T048.
  const canonical = await page.evaluate(
    () => document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
  );

  expect(canonical, 'no <link rel="canonical"> on the policy page').toBeTruthy();
  expect(canonical, `canonical contains an unresolved template token: ${canonical}`).not.toContain(
    '%'
  );
  expect(() => new URL(canonical!), `canonical is not an absolute URL: ${canonical}`).not.toThrow();

  // Its own address, not the tuner's. This is the value the store privacy
  // declaration's policy URL is derived from, and a canonical pointing at `/`
  // would hand both stores an address for a different page.
  expect(new URL(canonical!).pathname, 'the policy page claims the tuner as its canonical').toBe(
    PATH
  );

  const response = await request.get(canonical!);
  expect(response.status(), `the canonical address ${canonical} does not resolve`).toBe(200);
});

test('the policy page carries the appearance handling the tuner has (Principle IV)', async ({
  page,
}) => {
  await page.goto(PATH);

  // The token block is injected into this page as well as the tuner's, so the
  // policy is styled in both appearances rather than rendering on the browser's
  // default white canvas in dark mode. Asserted on the resolved value, because
  // a `<style>` block that is present and unapplied looks identical in source.
  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--ct-background').trim()
  );
  expect(background, '--ct-background does not resolve on the policy page').not.toBe('');
});

/**
 * The policy page is subject to every obligation the tuner is (Principle IV).
 *
 * Same tags as `a11y.spec.ts` applies to the tuner screen. A page of prose is
 * where an accessibility failure is least expected and easiest to ship —
 * contrast on a muted "last updated" line, a link that is only a colour change.
 *
 * **Scripting back on for these two, and only these two.** Axe is injected into
 * the page and evaluated there, so it cannot run in a context with JavaScript
 * disabled — the attempt times out inside `frame.evaluate` rather than failing
 * with anything that names the cause, which is worth recording because the
 * symptom says nothing about the reason. That is a limitation of the tool and
 * not of the page: nothing here is script-dependent, and the tests above prove
 * the same markup and the same styling arrive with scripting off.
 */
test.describe('accessibility', () => {
  test.use({ javaScriptEnabled: true });

  async function analyze(page: Page) {
    return new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`the policy page has no accessibility violations in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(PATH);

      const results = await analyze(page);
      expect(
        results.violations,
        results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
      ).toEqual([]);
    });
  }
});
