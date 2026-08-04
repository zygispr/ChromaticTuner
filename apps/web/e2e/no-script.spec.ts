import { color } from '@chromatic-tuner/tokens';
import { expect, test } from '@playwright/test';

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
