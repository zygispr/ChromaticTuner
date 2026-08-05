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
group('claims', ({ listing: doc }) => {
  const failures = [];
  const claims = doc.claims;

  if (!claims || typeof claims !== 'object') {
    return { label: '0', failures: ['store-listing.json has no `claims` object'] };
  }

  const values = [...strings(claims, 'claims')];

  for (const [path, value] of values) {
    if (value.trim() === '') failures.push(`${path} is empty`);
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

const STORES = ['ios', 'android'];

/** The store's copy fields, in the order `limits.json` lists them. */
function copyFields(doc, limits, store) {
  const declared = Object.keys(limits[store]?.fields ?? {});
  return declared.map((field) => [`stores.${store}.${field}`, field, doc.stores?.[store]?.[field]]);
}

/**
 * L1 (FR-109): every field present, non-empty, and within its store's limit.
 *
 * Counted in **Unicode code points**, not UTF-16 units and not bytes. The three
 * disagree the moment anyone puts an emoji in a 30-character store name, and
 * the store counts the way a reader does.
 *
 * Every failure names the field, what it measured, and the limit it broke. A
 * gate that says only "listing invalid" gets muted, and a 4000-character field
 * with an unnamed problem is a search task.
 */
group('fields', ({ listing: doc, limits }) => {
  const failures = [];
  let checked = 0;

  if (!doc.stores || typeof doc.stores !== 'object') {
    return { label: '0', failures: ['store-listing.json has no `stores` object'] };
  }

  for (const store of STORES) {
    if (!doc.stores[store] || typeof doc.stores[store] !== 'object') {
      failures.push(`stores.${store} is missing`);
      continue;
    }

    for (const [path, , value] of copyFields(doc, limits, store)) {
      const limit = limits[store].fields[path.split('.').pop()];

      if (typeof value !== 'string') {
        failures.push(`${path} is missing`);
        continue;
      }

      checked += 1;

      if (value.trim() === '') {
        failures.push(`${path} is empty`);
        continue;
      }

      const length = [...value].length;
      if (length > limit) {
        failures.push(`${path} is ${length} characters, limit ${limit}`);
      }
    }
  }

  return { label: `${checked} ok`, failures };
});

/**
 * L2 (FR-089): the name leads with what the tool does.
 *
 * Deliberately weak. It cannot judge whether copy is good — L3 is a human
 * reading it — only catch a regression to the product's internal name, which is
 * the specific failure `003`'s FR-061 fixed on the web and the one a store's
 * search field punishes hardest.
 */
group('names', ({ listing: doc }) => {
  const failures = [];
  let checked = 0;
  const named = [
    ['stores.ios.name', doc.stores?.ios?.name],
    ['stores.android.title', doc.stores?.android?.title],
  ];

  for (const [path, value] of named) {
    // An absent field is L1's failure to report, not this group's. It must not
    // be counted as checked either — a green "2 ok" over two fields that do not
    // exist is exactly the assertion-satisfied-by-the-wrong-thing shape this
    // feature's tasks.md opens by warning about.
    if (typeof value !== 'string' || value.trim() === '') continue;

    checked += 1;
    const lower = value.toLowerCase();

    if (!lower.includes('tuner')) {
      failures.push(
        `${path} does not contain "tuner" — a shopper searching for one will not match it`
      );
    }

    if (!lower.includes('guitar') && !lower.includes('chromatic')) {
      failures.push(`${path} contains neither "guitar" nor "chromatic"`);
    }

    if (value.trim() === doc.claims?.appName) {
      failures.push(
        `${path} is exactly the product's own name — FR-089 requires it lead with what the tool does`
      );
    }
  }

  // FR-092: the App Store already indexes every word in `name` and `subtitle`,
  // so repeating one in the 100-character keyword field spends characters on a
  // term that was free. Checked rather than trusted because it is an authoring
  // rule nobody remembers a year later, and its cost is invisible — the listing
  // still works, it just competes for fewer queries than it paid for.
  const keywords = doc.stores?.ios?.keywords;
  if (typeof keywords === 'string' && keywords.trim() !== '') {
    const indexed = new Set(
      `${doc.stores?.ios?.name ?? ''} ${doc.stores?.ios?.subtitle ?? ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    );

    for (const keyword of keywords.split(',')) {
      const term = keyword.trim().toLowerCase();
      if (indexed.has(term)) {
        failures.push(
          `stores.ios.keywords repeats "${term}", which stores.ios.name or .subtitle already indexes`
        );
      }
      if (keyword !== keyword.trim()) {
        failures.push(
          `stores.ios.keywords has whitespace around "${term}" — the separator costs a character out of 100`
        );
      }
    }
  }

  return { label: `${checked} ok`, failures };
});

/**
 * L4 (FR-091): the opening stands alone.
 *
 * Both stores truncate a description behind a "more" control, and the fold
 * lengths live in `limits.json` so a store's layout change is a data edit
 * rather than a number buried here.
 */
const OPENING_MUST_MENTION = [
  ['the instrument', ['guitar']],
  ['the microphone', ['microphone', 'mic ']],
  ['that it is free', ['free']],
];

group('openings', ({ listing: doc, limits }) => {
  const failures = [];
  let checked = 0;
  const openings = [
    ['stores.ios.description', doc.stores?.ios?.description, limits.ios?.descriptionOpening],
    [
      'stores.android.fullDescription',
      doc.stores?.android?.fullDescription,
      limits.android?.descriptionOpening,
    ],
  ];

  for (const [path, value, fold] of openings) {
    // Same reasoning as `names`: not checked is not the same as ok.
    if (typeof value !== 'string' || value.trim() === '') continue;

    checked += 1;
    const opening = [...value].slice(0, fold).join('').toLowerCase();

    for (const [what, phrasings] of OPENING_MUST_MENTION) {
      if (!phrasings.some((phrase) => opening.includes(phrase))) {
        failures.push(
          `${path} does not mention ${what} in its first ${fold} characters — ` +
            'that is all a shopper reads before the store truncates it'
        );
      }
    }
  }

  return { label: `${checked} ok`, failures };
});

/**
 * L5 (FR-093, FR-110): nothing claims a capability `001` put out of scope.
 *
 * Scans every string in the document, at every depth, so a term is caught
 * wherever it is added — a check aimed only at the descriptions would miss a
 * keyword field, which is where the temptation is strongest.
 *
 * Names the field path as well as the term. The term alone turns a
 * 4000-character description into a search problem, and a gate that is annoying
 * to act on is a gate that gets muted.
 */
group('vocabulary', ({ listing: doc, forbidden: patterns }) => {
  const failures = [];
  const values = [...strings(doc, '')];

  for (const [path, value] of values) {
    for (const { pattern, source } of patterns) {
      if (pattern.test(value)) {
        failures.push(`${path} claims a capability 001 put out of scope — matches ${source}`);
      }
    }
  }

  return { label: `${values.length} strings clean`, failures };
});

/**
 * The corroboration concepts, read from the listing itself.
 *
 * A claim is not a string to be matched — the two stores' field structures
 * differ by design, so byte comparison would either fail always or force copy
 * that wastes one store's fields. What has to agree is the **substance**, so
 * each claim is restated as a concept plus the phrasings that count as saying
 * it, and both L6 and L7 ask whether every concept is present.
 */
function concepts(doc) {
  const list = doc.claims?.corroboration;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list;
}

const present = (haystack, phrasings) =>
  phrasings.some((phrase) => haystack.includes(phrase.toLowerCase()));

/**
 * L6 (FR-095, FR-112): the two stores make the same claims.
 *
 * The forward direction only — every claim appears in both stores' copy. The
 * reverse ("no store asserts something absent from `claims`") is not decidable
 * by a program reading prose; its automated half is the vocabulary group above,
 * and its honest other half is the read-through recorded at T024. Saying so
 * here is better than a check that reports green over a question it never asked.
 */
group('agreement', ({ listing: doc, limits }) => {
  const failures = [];
  const list = concepts(doc);

  if (!list) {
    return { label: '0', failures: ['claims.corroboration is missing or empty'] };
  }

  for (const store of STORES) {
    if (!doc.stores?.[store]) continue; // L1 reports this

    const copy = copyFields(doc, limits, store)
      .map(([, , value]) => (typeof value === 'string' ? value : ''))
      .join('\n')
      .toLowerCase();

    for (const { concept, phrasings } of list) {
      if (!present(copy, phrasings)) {
        failures.push(
          `stores.${store} never says "${concept}" — both listings must make every claim`
        );
      }
    }
  }

  return { label: `${list.length} claims × ${STORES.length} stores`, failures };
});

/**
 * L7 (FR-094, FR-112): the listings agree with the web page.
 *
 * Compared against the **rendered text of the built document**, never against
 * `apps/web/src/content.ts`. Comparing the listing to the constant that
 * produces the web page proves two constants are equal and proves nothing about
 * what shipped — `003`'s tasks.md records the seven-phase defect that shape of
 * assertion produced in `001`.
 */
function renderedText(url) {
  const html = readFileSync(url, 'utf8');
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

group('corroboration', ({ listing: doc, ROOT: root }) => {
  const failures = [];
  const list = concepts(doc);

  if (!list) {
    return { label: '0', failures: ['claims.corroboration is missing or empty'] };
  }

  const built = new URL('apps/web/dist/index.html', root);
  let text;

  try {
    text = renderedText(built);
  } catch {
    return {
      label: '0',
      failures: [
        `apps/web/dist/index.html not found — run \`pnpm build\` first. ` +
          'This check reads the built document rather than content.ts on purpose: ' +
          'comparing the listing against the constant that produces the page proves nothing ' +
          'about what shipped.',
      ],
    };
  }

  for (const { concept, phrasings } of list) {
    if (!present(text, phrasings)) {
      failures.push(
        `the built web page never says "${concept}", but the listing claims it — ` +
          'a shopper who finds one surface and then the other would be told two different things'
      );
    }
  }

  return { label: `${list.length} corroborated`, failures };
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
