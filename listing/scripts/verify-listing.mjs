/**
 * The store-listing gate (contract L1–L12, FR-109–FR-112).
 *
 *   pnpm build && pnpm verify:listing
 *
 * `pnpm build` first is not optional: L7 compares the listing against the
 * rendered text of `apps/web/dist/index.html`, and after 004's Phase 5 also
 * against `dist/privacy.html`. The CI step is placed after the Build step for
 * that reason.
 *
 * **Why this is `.mjs` and its data is JSON.** CI pins `node-version: 20` in
 * every job, which predates type stripping, so this file cannot import a `.ts`
 * module — the same constraint `apps/web/scripts/generate-og-image.mjs` already
 * records in its own header. The gate has to run in CI, so the gate is `.mjs`,
 * so the data it reads is JSON (research D1). `apps/web/src/content.ts` would
 * otherwise have been the obvious precedent.
 *
 * **Why it is not a Vitest project.** The root Vitest config's `projects` is
 * `packages/*` only, and this check spans two apps and the web build output.
 * `verify-offline` and `verify-build-output` set the precedent for a standalone
 * Node gate wired into CI as its own step.
 *
 * **The reporting contract.** Every group prints its name and a count, whether
 * or not it found a problem. A silent success is a failure of quickstart V30:
 * the counts are what let a reviewer notice that a field stopped being checked
 * because it stopped existing. A gate that says only "listing invalid" gets
 * muted, so every failure names the specific field or file at fault.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);

const FILES = {
  listing: new URL('listing/store-listing.json', ROOT),
  limits: new URL('listing/limits.json', ROOT),
  outOfScope: new URL('listing/out-of-scope-claims.json', ROOT),
};

function readJson(url, what) {
  let raw;
  try {
    raw = readFileSync(url, 'utf8');
  } catch {
    console.error(`${what} could not be read at ${fileURLToPath(url)}.`);
    process.exit(1);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`${what} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

const listing = readJson(FILES.listing, 'listing/store-listing.json');
const limits = readJson(FILES.limits, 'listing/limits.json');
const outOfScope = readJson(FILES.outOfScope, 'listing/out-of-scope-claims.json');

/**
 * Compiled once, from source strings, with word boundaries intact — `async`
 * contains `sync` and `accounting` contains `account`, and a gate that fires on
 * innocent prose gets muted (research D8). The same file feeds
 * `apps/web/e2e/metadata.spec.ts`.
 */
const forbidden = (outOfScope.patterns ?? []).map(({ source, reason }) => ({
  pattern: new RegExp(source, 'i'),
  source,
  reason,
}));

if (forbidden.length === 0) {
  console.error(
    'listing/out-of-scope-claims.json has no `patterns` — an empty list would ' +
      'silently permit every claim it exists to forbid.'
  );
  process.exit(1);
}

/**
 * Keys beginning with `$` are annotations explaining the data, not data.
 * JSON carries no comments and this file has three audiences, one of them
 * human, so the reasoning lives beside the values it explains. They are skipped
 * by every check — a note saying *why* a term is forbidden would otherwise trip
 * the check that forbids it, which is exactly the shape of false positive that
 * gets a gate muted.
 */
const isAnnotation = (key) => key.startsWith('$');

/** Every string value under `value`, as `[path, string]` pairs, annotations excluded. */
function* strings(value, path) {
  if (typeof value === 'string') {
    yield [path, value];
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* strings(item, `${path}[${index}]`);
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (isAnnotation(key)) continue;
      yield* strings(item, path ? `${path}.${key}` : key);
    }
  }
}

/**
 * A check group returns `{ label, failures }`. `label` is the count line the
 * reviewer reads on a green run; `failures` is a list of strings, each of which
 * must name the field or file at fault on its own.
 */
const groups = [];

/** Registers a check group. Order here is the order of the printed report. */
function group(name, run) {
  groups.push({ name, run });
}

// Later tasks register the rest against this same registry: L1/L2/L4/L5/L6/L7
// in T014–T019, L8/L9/L11 in T026–T028, L12 in T040–T041. The harness lands
// first so each of them is an addition rather than a new script.

/**
 * The claims are the spine both stores' copy and the web copy are checked
 * against (data-model §1), so their own integrity is checked before anything
 * derived from them is.
 */
group('claims', ({ listing: doc, forbidden: patterns }) => {
  const failures = [];
  const claims = doc.claims;

  if (!claims || typeof claims !== 'object') {
    return { label: '0', failures: ['store-listing.json has no `claims` object'] };
  }

  const values = [...strings(claims, 'claims')];

  for (const [path, value] of values) {
    if (value.trim() === '') failures.push(`${path} is empty`);

    for (const { pattern, source } of patterns) {
      if (pattern.test(value)) {
        failures.push(`${path} claims a capability 001 put out of scope — matches ${source}`);
      }
    }
  }

  // Reverse-DNS, lower-case, at least two segments. Neither store accepts an
  // identifier outside this shape, and it is permanent from first publication.
  const identifier = claims.identifier;
  if (typeof identifier !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(identifier)) {
    failures.push(`claims.identifier is not a valid application identifier: ${identifier}`);
  }

  if (claims.collectsNoData !== true) {
    failures.push(
      'claims.collectsNoData is not true — FR-103 declares no data collected to both stores, ' +
        'and that declaration must not be weakened here without the privacy policy and both ' +
        'store forms changing with it'
    );
  }

  return { label: `${values.length} fields ok`, failures };
});

const context = { listing, limits, forbidden, ROOT };

let failed = false;

for (const { name, run } of groups) {
  const { label, failures } = run(context);

  if (failures.length > 0) {
    failed = true;
    console.error(`${name}: ${failures.length} problem${failures.length === 1 ? '' : 's'}`);
    for (const failure of failures) console.error(`  ${failure}`);
  } else {
    console.log(`${name}: ${label}`);
  }
}

process.exit(failed ? 1 : 0);
