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

/**
 * Reads a meta tag by either spelling.
 *
 * Open Graph uses `property`, Twitter's card tags use `name`, and mixing them up
 * produces a tag that looks right in the source and is ignored by every consumer.
 *
 * Read through `evaluate` rather than a locator on purpose. A locator's
 * `getAttribute` *waits* for a matching element, so a missing tag costs the full
 * 30-second timeout and then reports `locator.getAttribute: Test timeout` —
 * which says nothing about which tag was absent. These assertions exist to name
 * the missing item (FR-084), and a timeout cannot.
 */
async function metaContent(
  page: import('@playwright/test').Page,
  key: string
): Promise<string | null> {
  return page.evaluate((name: string) => {
    const element = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return element?.getAttribute('content') ?? null;
  }, key);
}

/**
 * P6: the whole preview identity is present.
 *
 * Without these a pasted link renders as a naked URL — no title, no summary, no
 * image — which is what the app does today in every chat and forum where a
 * musician might recommend it.
 */
test('carries a complete preview identity (P6, FR-077)', async ({ page }) => {
  await page.goto('/');

  const required = [
    'og:title',
    'og:description',
    'og:image',
    'og:url',
    'og:type',
    'og:site_name',
    'twitter:card',
    'twitter:image',
  ];

  const missing: string[] = [];
  for (const key of required) {
    const value = await metaContent(page, key);
    if (!value) missing.push(key);
  }

  expect(missing, `missing or empty preview tags: ${missing.join(', ')}`).toEqual([]);
});

/**
 * P7: the preview image is absolute, reachable, and the size platforms crop to.
 *
 * Each clause catches a different silent failure, and "og:image has a value"
 * catches none of them:
 *
 * - **Absolute.** Several preview generators do not resolve relative image URLs.
 *   The card renders with text and no image, which reads as a design choice
 *   rather than a bug.
 * - **200.** A moved or renamed asset leaves the tag pointing at nothing.
 * - **1200×630 PNG.** An icon-sized square is technically an image and is
 *   cropped into uselessness by every platform in scope.
 */
test('the preview image is absolute, reachable and 1200x630 (P7, FR-078)', async ({
  page,
  request,
}) => {
  await page.goto('/');

  const source = await metaContent(page, 'og:image');
  expect(source, 'no og:image tag').toBeTruthy();
  expect(() => new URL(source!), `og:image is not an absolute URL: ${source}`).not.toThrow();

  const response = await request.get(source!);
  expect(response.status(), `og:image did not return 200: ${source}`).toBe(200);

  const bytes = await response.body();

  // PNG header: 8-byte signature, then the IHDR chunk whose width and height are
  // big-endian uint32 at offsets 16 and 20. Cheaper and more honest than
  // decoding the image, and it also proves the file really is a PNG.
  expect(bytes.subarray(1, 4).toString('ascii'), `og:image is not a PNG: ${source}`).toBe('PNG');

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);

  expect(
    { width, height },
    `og:image is ${width}×${height}; platforms crop toward 1200×630`
  ).toEqual({ width: 1200, height: 630 });
});

/**
 * P8: the card promises what the page delivers.
 *
 * True by construction — both read the same constant from `content.ts` — and
 * asserted anyway, because construction can be undone by one later edit and
 * this check costs nothing.
 */
test('the preview text agrees with the page itself (P8, FR-079)', async ({ page }) => {
  await page.goto('/');

  const pageTitle = await page.title();
  const pageDescription = await metaContent(page, 'description');

  expect(await metaContent(page, 'og:title'), 'og:title disagrees with <title>').toBe(pageTitle);
  expect(
    await metaContent(page, 'og:description'),
    'og:description disagrees with the meta description'
  ).toBe(pageDescription);
});

/**
 * FR-080: the installed app presents a complete identity.
 *
 * Served rather than read off disk, and generated from `content.ts` for the
 * same reason everything else here is: a description restated in a second file
 * is a description that drifts.
 */
test('the web manifest is complete (FR-080)', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status(), 'manifest.webmanifest is not served').toBe(200);

  const manifest = JSON.parse(await response.text()) as Record<string, unknown>;

  const missing = [
    'name',
    'short_name',
    'description',
    'lang',
    'dir',
    'categories',
    'icons',
  ].filter((key) => {
    const value = manifest[key];
    return value === undefined || (Array.isArray(value) && value.length === 0);
  });

  expect(missing, `the manifest is missing: ${missing.join(', ')}`).toEqual([]);
});

/** The parsed structured description, or a named failure if there isn't exactly one. */
async function structuredDescription(
  page: import('@playwright/test').Page
): Promise<Record<string, unknown>> {
  const blocks = await page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (node) => node.textContent ?? ''
    )
  );

  expect(blocks.length, `expected exactly one JSON-LD block, found ${blocks.length}`).toBe(1);

  let parsed: unknown;
  expect(() => {
    parsed = JSON.parse(blocks[0]!);
  }, 'the JSON-LD block is not valid JSON').not.toThrow();

  return parsed as Record<string, unknown>;
}

/**
 * P9: the page describes itself as an application, in a form a machine reads.
 *
 * `SoftwareApplication` with a zero-price `offers` is the shape that answers the
 * query this feature targets — "a free guitar tuner I can use in a browser".
 * The price is the field most likely to be surfaced and the one most likely to
 * be omitted, since "free" feels too obvious to state.
 */
test('carries a valid SoftwareApplication description (P9, FR-081, FR-082)', async ({ page }) => {
  await page.goto('/');

  const schema = await structuredDescription(page);

  expect(schema['@context'], 'JSON-LD has no schema.org context').toBe('https://schema.org');
  expect(schema['@type'], 'the structured description is not a SoftwareApplication').toBe(
    'SoftwareApplication'
  );

  const missing = ['name', 'description', 'applicationCategory', 'operatingSystem', 'url'].filter(
    (key) => !schema[key]
  );
  expect(missing, `the structured description is missing: ${missing.join(', ')}`).toEqual([]);

  const offers = schema['offers'] as Record<string, unknown> | undefined;
  expect(
    offers,
    'no offers block — the "free" claim is the one most likely to be surfaced'
  ).toBeTruthy();
  expect(offers?.['price'], 'offers.price must be the string "0"').toBe('0');
  expect(offers?.['priceCurrency'], 'offers has a price but no currency').toBeTruthy();
});

/**
 * P10 / FR-083: every claim in the markup is corroborated by visible text.
 *
 * **The load-bearing test of this story.** Answer engines cross-check schema
 * against the page and discount the page where the two disagree, so a
 * `featureList` entry no reader can find is worse than omitting it.
 *
 * Three things about how this is measured, each of which would hollow it out if
 * done the obvious way:
 *
 * - It reads the claims from the **parsed JSON-LD**, not from `content.ts`.
 *   Comparing the module against itself compares a constant to a constant and
 *   passes on a build that ships neither.
 * - It searches `innerText`, not `textContent` and not the HTML source.
 *   `textContent` includes text in hidden elements; the source includes comments
 *   and attributes. A claim "corroborated" by an `aria-label` or a comment has
 *   not been corroborated for a person reading the page.
 * - Whitespace is normalised on both sides, because `innerText` collapses runs
 *   of space and a claim spanning a line wrap would otherwise never match.
 */
test('every advertised claim appears in the visible text (P10, FR-083)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const schema = await structuredDescription(page);
  const claims = schema['featureList'] as string[] | undefined;

  expect(Array.isArray(claims) && claims.length > 0, 'the schema advertises no featureList').toBe(
    true
  );

  const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();
  const visible = normalise(await page.evaluate(() => document.body.innerText));

  const unsupported = claims!.filter((claim) => !visible.includes(normalise(claim)));

  expect(
    unsupported,
    `these claims appear in the markup but nowhere a reader can see them:\n  ${unsupported.join('\n  ')}`
  ).toEqual([]);
});

/**
 * P11 / FR-065: nothing claims a capability the app does not have.
 *
 * The failure this guards against is someone reaching for a phrase that ranks
 * well — "supports Drop D" — for a feature `001` put explicitly out of scope.
 * It would be false, and under P10's logic it would also be uncorroborated,
 * which answer engines punish.
 *
 * Matched with word boundaries rather than substrings. Nothing in the document
 * today trips a naive `includes` — that was checked, not assumed — but the
 * hazard is one ordinary word away: `async` contains `sync`, `accounting`
 * contains `account`. A gate that reports a violation for prose containing
 * nothing wrong gets muted, and a muted gate protects nothing.
 *
 * Scanned over the text and identity values this project authors rather than
 * the raw HTML, because the served document also carries Vite's client in
 * development and its own markup everywhere — neither of which is a claim about
 * the product, and neither of which anyone here would be able to fix.
 */
const OUT_OF_SCOPE = [
  /\btuning presets?\b/i,
  /\bdrop\s*d\b/i,
  /\bDADGAD\b/i,
  /\bcustom tunings?\b/i,
  /\bper-string\b/i,
  /\breference tones?\b/i,
  /\bcapo\b/i,
  /\btransposition\b/i,
  /\bmetronome\b/i,
  /\bchord librar(?:y|ies)\b/i,
  /\bsign-?in\b/i,
  /\baccounts?\b/i,
  /\bsync(?:ing|ed|hronis|hroniz)?\b/i,
];

test('claims no capability that is out of scope (P11, FR-065)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const schema = await structuredDescription(page);

  const authored = [
    await page.title(),
    (await metaContent(page, 'description')) ?? '',
    (await metaContent(page, 'og:title')) ?? '',
    (await metaContent(page, 'og:description')) ?? '',
    (await metaContent(page, 'og:image:alt')) ?? '',
    JSON.stringify(schema),
    await page.evaluate(() => document.body.innerText),
  ].join('\n');

  const violations = OUT_OF_SCOPE.filter((pattern) => pattern.test(authored)).map((pattern) =>
    String(pattern)
  );

  expect(
    violations,
    `the page claims capabilities 001 put out of scope: ${violations.join(', ')}`
  ).toEqual([]);
});
