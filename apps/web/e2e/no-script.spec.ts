import { color } from '@chromatic-tuner/tokens';
import { expect, test } from '@playwright/test';

import { description, heading, sections, title } from '../src/content';

/**
 * What a consumer that does not execute JavaScript receives (contract P1).
 *
 * Search crawlers reach the page on a delayed, budget-limited second pass;
 * link-preview generators and answer-engine fetchers do not run scripts at all.
 * They are now consumers of this document, and their interface is the served
 * HTML — so everything the page claims about itself has to survive with
 * scripting off.
 *
 * `javaScriptEnabled: false` is a context option, which makes the requirement
 * that looks hardest to test a three-line `test.use`. Worth stating plainly,
 * because this is the assertion most likely to be waved away as untestable.
 */
test.use({ javaScriptEnabled: false });

/**
 * Every design token must be defined by the served document (D2).
 *
 * Before 003 the token block was built in `src/theme.ts` and appended to
 * `<head>` by `main.tsx` during module evaluation. Nothing noticed, because
 * nothing existed on the page until that same JavaScript ran. The moment static
 * content sits in the document that stops being true twice over: a crawler
 * renders it with no colours at all, and a real user sees it paint unstyled and
 * then re-paint when the style block lands — a flash and a layout shift, which
 * FR-069 forbids.
 *
 * Derived from the token module rather than a hard-coded list, so a token added
 * to the palette is covered here without anyone remembering to add it.
 */
test('defines every design token without running any script (D2, FR-060)', async ({ page }) => {
  await page.goto('/');

  const expected = Object.keys(color).map(
    (name) => `--ct-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
  );

  const resolved = await page.evaluate((names: string[]) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, expected);

  const missing = expected.filter((name) => !resolved[name]);

  expect(
    missing,
    `these custom properties resolve to nothing with scripting disabled: ${missing.join(', ')}`
  ).toEqual([]);
});

/**
 * P1/FR-060: the page describes itself with no scripting at all.
 *
 * Every string a search engine or an answer engine would judge this page on has
 * to be here — the heading naming the tool, the summary, and the supporting
 * content — with React never having run.
 */
test('shows its heading, summary and supporting content with no scripting (P1, FR-060)', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.locator('h1')).toHaveText(heading);

  // Read through `evaluate`, not a locator. A locator's `getAttribute` waits
  // for its element, so a missing description costs the full 30-second timeout
  // and then reports `locator.getAttribute: Test timeout` — which does not say
  // *what* was missing. Found by T048's deliberate-failure run, which is the
  // point of doing it: the same flaw was fixed in `metadata.spec.ts` in an
  // earlier phase and this copy survived.
  const metaDescription = await page.evaluate(
    () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null
  );
  expect(metaDescription, 'no meta description in the served document').toBe(description);

  for (const section of sections) {
    await expect(
      page.getByRole('heading', { level: 2, name: section.heading }),
      `section heading missing without scripting: ${section.heading}`
    ).toBeVisible();

    // A distinctive slice rather than the whole paragraph: `toContainText`
    // normalises whitespace, and matching a 90-word string exactly turns any
    // future re-wrap into a false failure.
    await expect(
      page.getByText(section.body.slice(0, 60), { exact: false }),
      `section body missing without scripting: ${section.heading}`
    ).toBeVisible();
  }
});

/**
 * P1's binding word is *before any script executes*, and this is the half that
 * actually tests it.
 *
 * The rendered assertions above prove a browser displays the content with
 * scripting off. They do not prove it was **served** — a build step that
 * injected the copy through some other script the harness still permitted would
 * satisfy them. This reads the response body as bytes, with no browser in the
 * loop at all, which is what a link-preview generator or an answer-engine
 * fetcher actually receives.
 *
 * It is also the assertion that fails if someone later "fixes" this feature by
 * reaching for prerendering after all (D1): a hydrated React tree would put the
 * content in the document, but through a path this test can tell apart.
 */
test('serves the content as bytes, with no browser involved (P1, FR-060)', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);

  const html = await response.text();

  const required: ReadonlyArray<readonly [string, string]> = [
    ['the page heading', heading],
    ['the meta description', description],
    ['the document title', title],
    ...sections.map((s) => [`the "${s.heading}" heading`, s.heading] as const),
    ...sections.map((s) => [`the "${s.heading}" body`, s.body.slice(0, 60)] as const),
  ];

  const missing = required.filter(([, value]) => !html.includes(value)).map(([label]) => label);

  expect(missing, `not present in the served bytes: ${missing.join(', ')}`).toEqual([]);
});

/**
 * SC-023: at least 150 words of supporting text, counted off the page.
 *
 * A floor against the copy being quietly emptied by a later edit, not a target
 * to pad toward.
 *
 * Counted from the **rendered** content section rather than from `content.ts`.
 * Summing the module's own strings would compare a constant against itself and
 * pass on a build where the markup ships none of them — the same trap P10's
 * corroboration check exists to avoid, in a smaller costume.
 */
test('renders at least 150 words of supporting content (SC-023)', async ({ page }) => {
  await page.goto('/');

  const words = await page.locator('#site-content').evaluate((node) => {
    const text = (node as HTMLElement).innerText ?? node.textContent ?? '';
    return text.split(/\s+/).filter(Boolean).length;
  });

  expect(
    words,
    `the rendered content section holds ${words} words, below the 150-word floor`
  ).toBeGreaterThanOrEqual(150);
});
