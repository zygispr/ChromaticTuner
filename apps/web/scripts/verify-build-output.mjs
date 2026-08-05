/**
 * Asserts the properties of `dist/` that no browser can observe
 * (contract P12, P12a; FR-073, FR-076; V-ENV-2).
 *
 * These cannot live in the Playwright suite. That suite runs against
 * `vite dev`, which never emits `sw.js` — so the precache manifest, the one
 * thing P12a is about, does not exist there at all. The same reasoning that put
 * `verify-offline.mjs` outside the normal suite applies here.
 *
 *   pnpm --filter @chromatic-tuner/web build
 *   pnpm --filter @chromatic-tuner/web verify:build-output
 *
 * The non-canonical case rebuilds with a different origin, because FR-076 is a
 * property of what the build *decides*, and deciding it correctly for one
 * environment proves nothing about the other.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = new URL('../dist/', import.meta.url);
const CANONICAL = 'https://tuner.example.com';

const failures = [];

/**
 * Build with a chosen origin.
 *
 * The script drives both builds itself rather than inspecting whatever `dist/`
 * happens to hold, because FR-076 is a property of what the build *decides*.
 * Verifying one origin proves nothing about the other, and the non-canonical
 * branch is the one that only ever runs on preview deployments — which is
 * exactly why it would otherwise be the branch nobody notices is broken.
 */
function buildWith(siteUrl) {
  const env = { ...process.env };
  if (siteUrl) env['VITE_SITE_URL'] = siteUrl;
  else delete env['VITE_SITE_URL'];
  execFileSync('npx', ['vite', 'build'], { cwd: APP, stdio: 'pipe', env });
}

/** Record rather than throw, so one run reports every problem it can see. */
function check(condition, message) {
  if (!condition) failures.push(message);
}

function read(name) {
  try {
    return readFileSync(new URL(name, DIST), 'utf8');
  } catch {
    failures.push(`${name} was not emitted into dist/`);
    return null;
  }
}

// The canonical case first: this is what production ships.
buildWith(CANONICAL);

const html = read('index.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const manifest = read('manifest.webmanifest');
const serviceWorker = read('sw.js');

// ---------------------------------------------------------------------------
// V-ENV-2: no unresolved template token survives into any emitted file.
//
// Vite leaves an undefined `%VITE_*%` in place rather than blanking it, so this
// ships a URL-shaped literal rather than an obviously empty tag. 003 resolves
// the origin in the plugin instead, which makes it unreachable — this is the
// guard that keeps it that way.
// ---------------------------------------------------------------------------
for (const [name, source] of [
  ['index.html', html],
  ['robots.txt', robots],
  ['sitemap.xml', sitemap],
  // Added when the manifest became a generated file rather than a static one:
  // it now interpolates the same origin everything else does, so it can carry
  // the same unresolved token.
  ['manifest.webmanifest', manifest],
]) {
  if (!source) continue;
  const tokens = source.match(/%VITE_[A-Z0-9_]*%/g);
  check(!tokens, `${name} contains unresolved template tokens: ${tokens?.join(', ')}`);
}

// ---------------------------------------------------------------------------
// P12: the crawl directives point at each other and at exactly one page.
// ---------------------------------------------------------------------------
if (robots) {
  check(
    /Sitemap:\s+https?:\/\/\S+\/sitemap\.xml/.test(robots),
    'robots.txt does not name an absolute sitemap URL'
  );
  check(
    !/^Disallow:\s*\/\s*$/m.test(robots),
    'the canonical build emitted a disallow-all robots.txt'
  );
}

if (sitemap) {
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  /*
   * The sitemap lists exactly the pages the build emitted — no more, no fewer.
   *
   * This asserted `locations.length === 1` until 004 added `privacy.html`, and
   * a magic number is what would have had to be edited by hand every time a page
   * is added. Derived from `dist/` instead, so the two halves of the D9
   * registration problem are both covered: a page that is built and not listed
   * (an unreachable policy, which is what a store reviewer follows) and a page
   * that is listed and not built (a 404 offered to every crawler).
   */
  const emitted = readdirSync(fileURLToPath(DIST))
    .filter((name) => name.endsWith('.html'))
    .map((name) => (name === 'index.html' ? `${CANONICAL}/` : `${CANONICAL}/${name}`))
    .sort();

  const listed = [...locations].sort();

  check(
    JSON.stringify(listed) === JSON.stringify(emitted),
    `sitemap.xml lists ${listed.join(', ') || '(nothing)'}, but dist/ holds ${emitted.join(', ')}`
  );
  check(
    locations.every((location) => /^https?:\/\//.test(location)),
    `sitemap.xml contains a non-absolute <loc>: ${locations.join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// P12a: the crawler-facing files are NOT precached.
//
// This is the assertion that fails on the obvious implementation. Files emitted
// by a Vite plugin land in Rollup's bundle object, and `precache()` derives its
// manifest from exactly that — so robots.txt and sitemap.xml get swept in
// automatically unless excluded. The cost is every user's browser caching two
// files meant for crawlers, and a sitemap that outlives the deployment that
// produced it.
// ---------------------------------------------------------------------------
if (serviceWorker) {
  const manifest = /const PRECACHE = (\[[^\]]*\])/.exec(serviceWorker)?.[1] ?? '';
  const leaked = ['robots.txt', 'sitemap.xml'].filter((name) => manifest.includes(name));
  check(
    leaked.length === 0,
    `the service worker precaches crawler-only files: ${leaked.join(', ')} — exclude them from the manifest`
  );
}

// ---------------------------------------------------------------------------
// FR-076: a build whose origin is not the canonical one must not be indexable.
//
// Rebuilt rather than reasoned about. This is the branch that only ever runs on
// preview deployments, which is precisely why it would otherwise be the one
// nobody notices is broken.
// ---------------------------------------------------------------------------
buildWith(undefined);

const previewRobots = read('robots.txt');
check(
  previewRobots !== null && /^Disallow:\s*\/\s*$/m.test(previewRobots),
  'a build with no VITE_SITE_URL did not emit a disallow-all robots.txt — a preview deployment, or a production deploy that forgot to set the variable, would compete with the live site'
);

// Leave dist/ built from the canonical origin. A stale preview build here would
// send the next `verify:offline` run against the wrong origin, and would leave a
// disallow-all robots.txt in a directory someone may be about to upload.
buildWith(CANONICAL);

if (failures.length > 0) {
  console.error(`\nBuild output verification failed:\n  ${failures.join('\n  ')}\n`);
  process.exit(1);
}

console.log(
  'Build output OK: crawl directives correct, no unresolved tokens, precache excludes them.'
);
