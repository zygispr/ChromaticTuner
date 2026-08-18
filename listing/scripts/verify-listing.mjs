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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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
      const spec = limits[store].fields[path.split('.').pop()];

      if (typeof value !== 'string') {
        failures.push(`${path} is missing`);
        continue;
      }

      checked += 1;

      if (value.trim() === '') {
        failures.push(`${path} is empty`);
        continue;
      }

      // A limit is a plain number counted in code points, or `{ max, unit }`
      // where the store counts differently. Only one field does today: T066
      // re-read Apple's specification and found the keyword field measured in
      // **bytes** — "you can provide up to 100 bytes of content" — while every
      // other field is characters.
      //
      // ASCII hides this completely: the current keywords are 78 either way.
      // The two diverge the moment anyone writes an accented word or an em
      // dash, and the divergence runs the dangerous direction — more bytes than
      // code points — so the gate would have waved through a field the store
      // silently truncates. This is the same failure mode L1 already guards
      // against by counting code points rather than UTF-16 units, one level
      // further out.
      const limit = typeof spec === 'object' ? spec.max : spec;
      const unit = typeof spec === 'object' ? spec.unit : 'characters';
      const length = unit === 'bytes' ? Buffer.byteLength(value, 'utf8') : [...value].length;

      if (length > limit) {
        failures.push(`${path} is ${length} ${unit}, limit ${limit}`);
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
 *
 * **The privacy page is scanned too, and that is not an afterthought** (T041).
 * The contract states L5 over `store-listing.json` *and* the rendered text of
 * `apps/web/privacy.html`, because a policy is the surface most likely to name
 * an absent capability while denying it — "no accounts, no sync" is how such a
 * document is normally written, and FR-093 forbids the vocabulary including
 * inside a negation. Scanned as **rendered text of the built page**, for the
 * same reason L7 reads the built document: the source file is not what a store
 * reviewer opens.
 */
group('vocabulary', ({ listing: doc, forbidden: patterns, ROOT: root }) => {
  const failures = [];
  const values = [...strings(doc, '')];

  for (const [path, value] of values) {
    for (const { pattern, source } of patterns) {
      if (pattern.test(value)) {
        failures.push(`${path} claims a capability 001 put out of scope — matches ${source}`);
      }
    }
  }

  // A check that passes over an absent file is the quietest way to lose a gate,
  // so the missing case is a failure with a name rather than a silent skip of
  // an empty string.
  let privacy = null;
  try {
    privacy = renderedText(new URL('apps/web/dist/privacy.html', root));
  } catch {
    failures.push(
      'apps/web/dist/privacy.html was not built, so the privacy policy was not scanned for ' +
        'out-of-scope claims — run `pnpm build` first. FR-104 requires the page to exist and L5 ' +
        'requires its rendered text to be checked; passing over an absent file would report ' +
        'green over a question never asked'
    );
  }

  if (privacy !== null) {
    for (const { pattern, source } of patterns) {
      if (pattern.test(privacy)) {
        failures.push(
          `apps/web/dist/privacy.html claims a capability 001 put out of scope — matches ${source}`
        );
      }
    }
  }

  return {
    label: `${values.length} strings clean, plus the built privacy page`,
    failures,
  };
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
  return (
    html
      // Comments before tags: `<[^>]+>` below would otherwise chew a comment up to
      // its first `>` and leave the rest of the author's note in the "rendered"
      // text. Both documents carry a long explanatory comment, and neither is
      // something a reader sees.
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
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

/**
 * The PNG header, read directly (L8, FR-111). No image dependency — Principle
 * II's rule against a package standing in for work the platform already does.
 *
 * A PNG is an 8-byte signature followed by length-prefixed chunks; IHDR is
 * always first. Bytes 16–23 are width and height as big-endian uint32, byte 24
 * is the bit depth, and byte 25 is the colour type: 0 grey, 2 RGB, 3 palette,
 * 4 grey+alpha, 6 RGBA. Alpha is present for colour types 4 and 6, and for a
 * palette image carrying a tRNS chunk.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(path) {
  const bytes = readFileSync(path);

  if (bytes.length < 26 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { error: 'is not a PNG' };
  }

  const colourType = bytes[25];
  const hasAlpha = colourType === 4 || colourType === 6 || bytes.includes('tRNS');

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType,
    hasAlpha,
    bytes: bytes.length,
  };
}

const pngFiles = (dir) => {
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .sort();
  } catch {
    return null;
  }
};

/**
 * L8 (FR-111): every required asset exists, at the right size, in the right
 * format, with alpha present or absent as its store requires.
 *
 * The gate checks the **committed pixels**, not the device profile the capture
 * script asked for. A capture that silently landed at the wrong resolution is
 * precisely the case where asking the script would agree with itself.
 */
group('assets', ({ limits, ROOT: root }) => {
  const failures = [];
  let checked = 0;

  const declared = limits.assets?.files ?? {};

  for (const [relative, spec] of Object.entries(declared)) {
    const path = fileURLToPath(new URL(relative, root));
    let png;

    try {
      png = readPng(path);
    } catch {
      failures.push(`${relative} is missing — required by ${spec.requiredBy}`);
      continue;
    }

    checked += 1;

    if (png.error) {
      failures.push(`${relative} ${png.error} — required by ${spec.requiredBy}`);
      continue;
    }

    if (png.width !== spec.width || png.height !== spec.height) {
      failures.push(
        `${relative} is ${png.width}×${png.height}, expected ${spec.width}×${spec.height} ` +
          `(${spec.requiredBy})`
      );
    }

    if (spec.alpha === 'forbidden' && png.hasAlpha) {
      failures.push(
        `${relative} has an alpha channel (PNG colour type ${png.colourType}) and ${spec.requiredBy} ` +
          'rejects one'
      );
    }

    if (spec.alpha === 'required' && !png.hasAlpha) {
      failures.push(
        `${relative} has no alpha channel (PNG colour type ${png.colourType}), but ${spec.requiredBy} ` +
          'masks it to a device-chosen shape and needs transparency'
      );
    }

    if (spec.maxBytes && png.bytes > spec.maxBytes) {
      failures.push(`${relative} is ${png.bytes} bytes, over the ${spec.maxBytes}-byte limit`);
    }
  }

  // Screenshots are counted and measured per platform and appearance. Their
  // sizes are a range for Android and a short list for iOS, so they cannot use
  // the fixed-size table above.
  const appearances = limits.assets?.appearances ?? [];

  for (const [platform, spec] of Object.entries(limits.assets?.screenshots ?? {})) {
    // The store's cap is on the whole slot, not on one appearance of it (T066).
    // Apple accepts 10 screenshots per **display size**, and light and dark are
    // one display size to Apple — so a per-appearance maximum of 10 permitted
    // 20 files for a slot that takes 10. Two are committed, so this was never
    // wrong in practice: it was a limit encoded against the wrong axis, which is
    // the kind that is only wrong on the day someone needs it.
    let total = 0;

    for (const appearance of appearances) {
      const dir = fileURLToPath(new URL(`${spec.root}/${appearance}`, root));
      const files = pngFiles(dir);
      total += files?.length ?? 0;

      if (files === null) {
        failures.push(
          `${spec.root}/${appearance}/ does not exist — ${spec.requiredBy} needs this set`
        );
        continue;
      }

      if (files.length < spec.countPerAppearance.min) {
        failures.push(
          `${spec.root}/${appearance}/ holds ${files.length} screenshots, at least ` +
            `${spec.countPerAppearance.min} required by ${spec.requiredBy}`
        );
      }

      if (files.length > spec.countPerAppearance.max) {
        failures.push(
          `${spec.root}/${appearance}/ holds ${files.length} screenshots, at most ` +
            `${spec.countPerAppearance.max} accepted by ${spec.requiredBy}`
        );
      }

      for (const name of files) {
        const png = readPng(`${dir}/${name}`);
        checked += 1;

        if (png.error) {
          failures.push(`${spec.root}/${appearance}/${name} ${png.error}`);
          continue;
        }

        if (spec.sizes) {
          const ok = spec.sizes.some(([w, h]) => png.width === w && png.height === h);
          if (!ok) {
            failures.push(
              `${spec.root}/${appearance}/${name} is ${png.width}×${png.height}; ` +
                `${spec.requiredBy} accepts ${spec.sizes.map(([w, h]) => `${w}×${h}`).join(' or ')}`
            );
          }
        }

        if (spec.sideRange) {
          const [min, max] = spec.sideRange;
          const shortest = Math.min(png.width, png.height);
          const longest = Math.max(png.width, png.height);

          if (shortest < min || longest > max) {
            failures.push(
              `${spec.root}/${appearance}/${name} is ${png.width}×${png.height}; ` +
                `${spec.requiredBy} needs every side between ${min} and ${max}`
            );
          }

          if (longest > shortest * spec.maxAspectRatio) {
            failures.push(
              `${spec.root}/${appearance}/${name} is ${png.width}×${png.height}, ratio ` +
                `${(longest / shortest).toFixed(2)}:1 — ${spec.requiredBy} rejects anything over ` +
                `${spec.maxAspectRatio}:1`
            );
          }
        }
      }
    }

    if (spec.maxTotalAcrossAppearances && total > spec.maxTotalAcrossAppearances) {
      failures.push(
        `${platform} has ${total} screenshots across all appearances, and ${spec.requiredBy} ` +
          `accepts ${spec.maxTotalAcrossAppearances} for the slot — the store's cap is on the ` +
          'whole set, not on each appearance of it'
      );
    }
  }

  return { label: `${checked} ok`, failures };
});

/**
 * L9 (FR-101): both appearances are represented, and they are not the same
 * image.
 *
 * The inequality is the whole point. A capture script whose appearance switch
 * silently failed writes two directories of identical bytes, which satisfies
 * every presence check ever written and still ships a listing that shows one
 * appearance twice.
 */
group('appearances', ({ limits, ROOT: root }) => {
  const failures = [];
  let compared = 0;

  const [light, dark] = limits.assets?.appearances ?? [];

  for (const [platform, spec] of Object.entries(limits.assets?.screenshots ?? {})) {
    const dirs = Object.fromEntries(
      [light, dark].map((appearance) => [
        appearance,
        fileURLToPath(new URL(`${spec.root}/${appearance}`, root)),
      ])
    );

    const files = Object.fromEntries(
      Object.entries(dirs).map(([appearance, dir]) => [appearance, pngFiles(dir) ?? []])
    );

    if (files[light].length === 0 || files[dark].length === 0) {
      failures.push(
        `${platform} is missing a ${files[light].length === 0 ? light : dark} screenshot — ` +
          'Principle IV requires both appearances be represented'
      );
      continue;
    }

    const first = readFileSync(`${dirs[light]}/${files[light][0]}`);
    const second = readFileSync(`${dirs[dark]}/${files[dark][0]}`);
    compared += 1;

    if (first.equals(second)) {
      failures.push(
        `${platform}'s ${light} and ${dark} screenshots are byte-identical — the appearance ` +
          'switch did not take effect during capture, and a presence check alone would pass this'
      );
    }
  }

  return { label: `${compared} platforms, both appearances`, failures };
});

/**
 * L11 (FR-098): the artwork derives from the tokens rather than from literals.
 *
 * **This check is not the grep the contract describes, and the difference is
 * deliberate.** L11 says "no colour literal appears in any generator template or
 * committed SVG". The first half is checkable as written and is checked as
 * written. The second half is not satisfiable by any SVG that renders: a
 * standalone icon has to carry its colours somewhere, so "no literal in the
 * committed SVG" would forbid the file from working at all.
 *
 * What the contract is actually protecting is that the colours are **derived**
 * rather than hand-transcribed — the defect D5 found, where `icon.svg` carried
 * five hex values hand-copied from the dark palette and drifted freely because
 * the `apps/**` ESLint rule reaches TypeScript and not SVG in `public/`.
 *
 * So the committed SVGs are checked two ways, because either alone is
 * satisfiable by the wrong thing:
 *
 * 1. **Every colour literal must appear in the built `--ct-*` block.** Catches
 *    drift — a token changes, the SVG is not regenerated, and its now-stale
 *    literal no longer matches the palette.
 * 2. **The file must carry the generator's provenance marker.** Catches
 *    hand-authoring. Check 1 alone does *not* catch the D5 defect as it stood,
 *    because those five literals were transcribed *correctly* — they were
 *    palette values on the day they were typed. A check that passed on the
 *    defect it was written for would be this feature's own headline mistake.
 *
 * V34's "regenerate and see no diff" is the third leg, and the only one that
 * proves the bytes themselves; it is manual because it needs a browser.
 */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

/** Written into every SVG the generator emits, and required of every SVG here. */
const GENERATED_BY = 'listing/scripts/generate-icons.mjs';

group('artwork', ({ ROOT: root }) => {
  const failures = [];
  let scanned = 0;

  // Half one, exactly as the contract states it: the generator's own templates
  // carry no colour of their own. Everything they draw with is a var(--ct-*).
  const scriptsDir = fileURLToPath(new URL('listing/scripts', root));
  for (const name of readdirSync(scriptsDir).filter((f) => f.endsWith('.mjs'))) {
    scanned += 1;
    const source = readFileSync(`${scriptsDir}/${name}`, 'utf8');
    // This file names colour literals inside a regex and a comment; scanning it
    // for them would be self-defeating. The generators are what matter.
    if (name === 'verify-listing.mjs') continue;

    const found = source.match(COLOUR_LITERAL);
    if (found) {
      failures.push(
        `listing/scripts/${name} contains colour literals (${[...new Set(found)].join(', ')}) — ` +
          'artwork colours must come from the built token block, not from the template (D5, D6)'
      );
    }
  }

  // Half two: every literal in the committed SVGs is a palette value.
  const tokenBlock = (() => {
    try {
      const html = readFileSync(fileURLToPath(new URL('apps/web/dist/index.html', root)), 'utf8');
      return /<style data-chromatic-tuner="tokens">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? null;
    } catch {
      return null;
    }
  })();

  if (!tokenBlock) {
    return {
      label: `${scanned} scanned`,
      failures: [
        ...failures,
        'apps/web/dist/index.html has no token <style> block to compare the SVGs against — ' +
          'run `pnpm build` first',
      ],
    };
  }

  const palette = new Set(
    (tokenBlock.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((c) => c.toLowerCase())
  );
  const publicDir = fileURLToPath(new URL('apps/web/public', root));

  for (const name of readdirSync(publicDir).filter((f) => f.endsWith('.svg'))) {
    scanned += 1;
    const source = readFileSync(`${publicDir}/${name}`, 'utf8');

    if (!source.includes(GENERATED_BY)) {
      failures.push(
        `apps/web/public/${name} is hand-authored — it carries no ${GENERATED_BY} marker. ` +
          'Its colours may match the palette today and drift the moment a token changes, ' +
          'which is exactly what D5 found in this file'
      );
    }

    for (const literal of new Set(source.match(COLOUR_LITERAL) ?? [])) {
      if (!palette.has(literal.toLowerCase())) {
        failures.push(
          `apps/web/public/${name} uses ${literal}, which is not a --ct-* token value — ` +
            'the artwork has drifted from the palette it is supposed to be generated from'
        );
      }
    }
  }

  return { label: `${scanned} scanned`, failures };
});

/**
 * L15 (FR-173, FR-179, FR-182): every generated artefact is recorded, unmodified
 * and drawn from the current palette.
 *
 * **Why this group exists beside `artwork` rather than inside it.** The group
 * above proves two things about the committed SVGs by reading them: every colour
 * literal is a palette value, and the file carries the generator's marker.
 * Neither transposes to a raster — a PNG has no literals and no comment. This
 * group reproduces both properties from a sidecar record: the recorded palette
 * is the literal, and the digest is the marker (research D5).
 *
 * All four checks are needed and none is redundant:
 *
 * 1. digests — catches a hand-edited or design-tool-exported file;
 * 2. palette — catches a token that moved without the artwork being regenerated.
 *    Check 1 passes on correctly-transcribed-then-stale artwork, which is exactly
 *    the defect 004's D5 found, and check 2 passes on a hand-drawn file whose
 *    recorded palette happens to be current. Each alone is half a gate;
 * 3. completeness — catches a new generator target that ships unrecorded, which
 *    would otherwise be an artefact nothing checks at all;
 * 4. limits agreement — the two records answer different questions ("what does a
 *    platform demand" vs "what did the generator produce"), and an artefact in
 *    one but not the other is a gap in one of them.
 *
 * It also converts 004's V34 into something CI can run. "Regenerate and see no
 * diff" needs the browser `pnpm listing:assets` launches, which CI's Ubuntu
 * runners do not have; recomputing a committed digest launches nothing.
 */
group('artwork-manifest', ({ limits, ROOT: root }) => {
  const failures = [];

  let manifest;
  try {
    manifest = readJson(
      new URL('listing/assets/artwork.json', root),
      'listing/assets/artwork.json'
    );
  } catch {
    return {
      label: '0',
      failures: [
        'listing/assets/artwork.json is missing or unreadable — run `pnpm build && pnpm listing:assets`',
      ],
    };
  }

  const recorded = manifest.artefacts ?? {};

  // 1 — every recorded artefact is present and its bytes are the recorded bytes.
  for (const [relative, spec] of Object.entries(recorded)) {
    let bytes;
    try {
      bytes = readFileSync(fileURLToPath(new URL(relative, root)));
    } catch {
      failures.push(`${relative} is recorded in artwork.json but is not on disk`);
      continue;
    }

    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== spec.sha256) {
      failures.push(
        `${relative} does not match its recorded digest (recorded ${String(spec.sha256).slice(0, 12)}…, ` +
          `found ${digest.slice(0, 12)}…) — it has been edited by hand, or regenerated without ` +
          'committing artwork.json alongside it'
      );
    }
  }

  // 2 — every colour the artefacts were drawn with is still a current token.
  const tokenBlock = (() => {
    try {
      const html = readFileSync(fileURLToPath(new URL('apps/web/dist/index.html', root)), 'utf8');
      return /<style data-chromatic-tuner="tokens">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? null;
    } catch {
      return null;
    }
  })();

  if (!tokenBlock) {
    failures.push(
      'apps/web/dist/index.html has no token <style> block to compare the recorded palette ' +
        'against — run `pnpm build` first'
    );
  } else {
    const current = new Set(
      (tokenBlock.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((c) => c.toLowerCase())
    );

    for (const [token, value] of Object.entries(manifest.palette ?? {})) {
      if (!current.has(String(value).toLowerCase())) {
        failures.push(
          `the artwork was drawn with ${token}: ${value}, which is no longer a --ct-* token value — ` +
            'the palette moved and the artwork was not regenerated (`pnpm listing:assets`)'
        );
      }
    }
  }

  /*
   * 3 — the generator's target list and the manifest's key set are equal.
   *
   * Read out of the generator's source rather than imported: that module
   * launches Chromium at the top level, so importing it here would put a browser
   * in the merge gate — the one thing this whole design is arranged to avoid.
   * The coupling is to the literal `file: '…'` shape of a TARGETS/SVGS entry,
   * which Prettier's single-quote rule keeps stable, and a drift in that shape
   * surfaces as this check reporting a missing artefact rather than as a silent
   * pass: an empty target list would fail against a populated manifest.
   */
  const generatorSource = readFileSync(
    fileURLToPath(new URL('listing/scripts/generate-icons.mjs', root)),
    'utf8'
  );
  const declared = new Set(
    [...generatorSource.matchAll(/file:\s*'([^']+)'/g)].map(([, file]) => file)
  );

  if (declared.size === 0) {
    failures.push(
      'no `file:` targets could be read out of listing/scripts/generate-icons.mjs — the ' +
        'generator changed shape and this check can no longer see what it produces'
    );
  }

  for (const file of declared) {
    if (!(file in recorded)) {
      failures.push(
        `generate-icons.mjs writes ${file}, but artwork.json does not record it — a shipped ` +
          'artefact that no check can see'
      );
    }
  }

  for (const file of Object.keys(recorded)) {
    if (!declared.has(file)) {
      failures.push(
        `artwork.json records ${file}, but no generator target writes it — the record has ` +
          'outlived its artefact'
      );
    }
  }

  // 4 — every icon the limits table measures is also an artefact the generator
  // produced. Screenshots are captured, not generated, so they are excluded by
  // the same `assets.files`/`assets.screenshots` split limits.json already makes.
  for (const relative of Object.keys(limits.assets?.files ?? {})) {
    if (!(relative in recorded)) {
      failures.push(
        `limits.json requires ${relative}, but artwork.json does not record it — either the ` +
          'generator does not produce it, or it is hand-authored artwork pretending otherwise'
      );
    }
  }

  return {
    label: `${Object.keys(recorded).length} artefacts, ${Object.keys(manifest.palette ?? {}).length} palette values`,
    failures,
  };
});

/**
 * Where an icon path in the resolved Expo config actually points (008, L13).
 *
 * **The resolved config does not resolve these.** `expo config --type prebuild`
 * reports `icon` exactly as `app.config.ts` wrote it — `./assets/icon.png` — and
 * not as an absolute path, which is what the first version of this check assumed
 * and why it reported three existing files as missing. The string is relative to
 * the **mobile project directory**, which is also the only reading under which
 * Expo itself finds the file, since `@expo/image-utils` hands the path to an
 * image library rather than to a resolver (research D2).
 *
 * Returns both forms because the two are needed for different things: the
 * absolute path to read the PNG header, and the repo-relative one to look the
 * artefact up in `artwork.json`, which is keyed that way.
 */
const MOBILE_PROJECT = 'apps/mobile/';

function iconPath(value, root) {
  if (value.startsWith('/')) {
    const rootPath = fileURLToPath(root);
    return {
      absolute: value,
      relative: value.startsWith(rootPath) ? value.slice(rootPath.length) : value,
    };
  }

  const relative = `${MOBILE_PROJECT}${value.replace(/^\.\//, '')}`;
  return { absolute: fileURLToPath(new URL(relative, root)), relative };
}

/**
 * The Expo configuration as **resolved**, not as written (L12.1, L12.2).
 *
 * Reading the resolved output rather than `app.config.ts` is the point of this
 * check. `.mjs` cannot import a `.ts` module under the Node 20 CI pins (D1), but
 * that is the smaller reason — the larger one is that the resolved config is
 * what actually reaches `Info.plist` and `AndroidManifest.xml`. Plugins rewrite
 * it, and a check against the source would agree with the source whatever the
 * plugins did.
 *
 * Sliced from the first `{`: invoked from the repository root this command
 * prints JSON and nothing else, but a differently-scoped pnpm invocation
 * prefixes `Scope: all 6 workspace projects` on **stdout**, which is not JSON.
 * Found while writing T013 and recorded there.
 */
function resolvedMobileConfig(root) {
  const stdout = execFileSync(
    'pnpm',
    [
      '--filter',
      '@chromatic-tuner/mobile',
      'exec',
      'expo',
      'config',
      '--json',
      '--type',
      'prebuild',
    ],
    {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    }
  );

  const start = stdout.indexOf('{');
  if (start === -1) throw new Error(`expo config printed no JSON:\n${stdout.slice(0, 400)}`);
  return JSON.parse(stdout.slice(start));
}

/**
 * L12.1, L12.2 (FR-105, FR-106, FR-107): derived identity matches its source.
 *
 * `app.config.ts` derives all of this from `store-listing.json` already, so
 * every assertion here is true by construction today. That is not a reason to
 * skip it — it is the reason to write it: the value of this group is that the
 * derivation cannot be quietly replaced by a literal later. It was observed red
 * by altering one purpose string in `app.config.ts` (T040); a check never seen
 * red is not known to work.
 *
 * **What is deliberately not asserted here.** L12.1 names "the Android
 * permission rationale" alongside the two iOS purpose strings. Android has no
 * equivalent field in the configuration — a permission there is declared without
 * a reason string, and the rationale a user actually reads is the in-app
 * explainer in `apps/mobile/src/components/molecules/PermissionPrompt.tsx`.
 * That component is outside this feature's boundary (FR-113, SC-044), so
 * asserting it here would mean either changing it or writing a check that
 * pretends the config carries something it does not. What is checked instead is
 * that the resolved Android permission set still requests RECORD_AUDIO, which is
 * the fact the plugin config is actually responsible for.
 */
group('identity', ({ listing: doc, ROOT: root }) => {
  const failures = [];
  let config;

  try {
    config = resolvedMobileConfig(root);
  } catch (error) {
    return {
      label: '0',
      failures: [
        'the resolved Expo configuration could not be read — ' +
          '`pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild` ' +
          `failed: ${error.message.split('\n')[0]}`,
      ],
    };
  }

  const mobileVersion = readJson(
    new URL('apps/mobile/package.json', root),
    'apps/mobile/package.json'
  ).version;

  const audioPlugin = (config.plugins ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === 'react-native-audio-api'
  );

  const derived = [
    [
      'ios.infoPlist.NSMicrophoneUsageDescription',
      config.ios?.infoPlist?.NSMicrophoneUsageDescription,
      doc.claims?.purposeSentence,
      'claims.purposeSentence',
    ],
    [
      'plugins["react-native-audio-api"].iosMicrophonePermission',
      audioPlugin?.[1]?.iosMicrophonePermission,
      doc.claims?.purposeSentence,
      'claims.purposeSentence',
    ],
    [
      'ios.bundleIdentifier',
      config.ios?.bundleIdentifier,
      doc.claims?.identifier,
      'claims.identifier',
    ],
    ['android.package', config.android?.package, doc.claims?.identifier, 'claims.identifier'],
    ['version', config.version, mobileVersion, "apps/mobile/package.json's version"],
  ];

  for (const [path, actual, expected, source] of derived) {
    if (actual === undefined) {
      failures.push(`the resolved config has no ${path} — it should derive from ${source}`);
      continue;
    }
    if (actual !== expected) {
      failures.push(
        `the resolved config's ${path} is ${JSON.stringify(actual)}, but ${source} is ` +
          `${JSON.stringify(expected)} — the two must be the same string, not two copies of it ` +
          '(FR-105, FR-106)'
      );
    }
  }

  // One integer feeding both stores (D10, FR-107). Two independently maintained
  // numbers is the case where one store accepts a build and the other rejects it.
  if (config.ios?.buildNumber !== String(config.android?.versionCode)) {
    failures.push(
      `ios.buildNumber is ${JSON.stringify(config.ios?.buildNumber)} and android.versionCode is ` +
        `${JSON.stringify(config.android?.versionCode)} — both must come from the one BUILD_NUMBER ` +
        'constant, or the two stores drift'
    );
  }

  if (!(config.android?.permissions ?? []).includes('android.permission.RECORD_AUDIO')) {
    failures.push(
      'the resolved Android permission set does not request android.permission.RECORD_AUDIO — ' +
        'the app cannot hear anything, and the purpose sentence describes a permission it never asks for'
    );
  }

  /*
   * L13 (FR-171, FR-175, FR-180): the mobile app declares an icon, and it is
   * this product's icon.
   *
   * L11's title is "artwork derives from tokens, and the app is not left with
   * two icons". The outcome was worse than the one it guards: the app was left
   * with **no** icon, and Expo's placeholder branch made that build and ship.
   * Nothing checked that the mobile app pointed at any of the artwork at all.
   *
   * **Read from the resolved config, for two reasons.** Plugins rewrite it, so a
   * check against `app.config.ts` would agree with the source whatever they did
   * — the reason L12 above is written this way. And it is the only level at
   * which this defect is visible *as* a defect: the source's failure mode is an
   * absent key, and `expo config --type prebuild` is where absence becomes a
   * value that can be asserted about.
   *
   * **Alpha is asserted in both directions**, because they are opposite
   * requirements with opposite silent failures. An alpha channel on `icon` is
   * rejected by Apple — but before that ever happens, Expo composites a
   * transparent source onto white and ships it looking merely wrong. An opaque
   * `foregroundImage` hides the background layer the launcher draws beneath it.
   *
   * **Membership of `artwork.json` is what ties these files to this product.**
   * Dimensions and colour type are true of any 1024² PNG, Expo's white square
   * included. The digest recorded in L15 is what says this is the mark.
   */
  const iconChecks = [
    ['icon', config.icon, 1024, 'forbidden'],
    [
      'android.adaptiveIcon.foregroundImage',
      config.android?.adaptiveIcon?.foregroundImage,
      1024,
      'required',
    ],
    [
      'android.adaptiveIcon.backgroundImage',
      config.android?.adaptiveIcon?.backgroundImage,
      1024,
      'any',
    ],
  ];

  const artwork = (() => {
    try {
      return readJson(new URL('listing/assets/artwork.json', root), 'artwork.json').artefacts ?? {};
    } catch {
      return {};
    }
  })();

  for (const [key, value, expectedSize, alpha] of iconChecks) {
    if (value === undefined || value === null) {
      failures.push(
        `the resolved config has no ${key} — the app ships Expo's blank white placeholder, which ` +
          'builds and installs without a warning (FR-180, research D1)'
      );
      continue;
    }

    const { absolute, relative } = iconPath(value, root);

    let png;
    try {
      png = readPng(absolute);
    } catch {
      failures.push(`${key} names ${relative}, which does not exist`);
      continue;
    }

    if (png.error) {
      failures.push(`${key} names ${relative}, which ${png.error}`);
      continue;
    }

    if (png.width !== expectedSize || png.height !== expectedSize) {
      failures.push(
        `${key} names ${relative}, which is ${png.width}×${png.height} — Expo expects ` +
          `${expectedSize}×${expectedSize}`
      );
    }

    if (alpha === 'forbidden' && png.hasAlpha) {
      failures.push(
        `${key} names ${relative}, which has an alpha channel. Apple rejects one — and before a ` +
          'submission ever happens, Expo sets removeTransparency and composites it onto white, so ' +
          'the icon ships looking merely wrong rather than failing loudly (research D4)'
      );
    }

    if (alpha === 'required' && !png.hasAlpha) {
      failures.push(
        `${key} names ${relative}, which has no alpha channel — the launcher composites it over ` +
          'the background layer, and an opaque foreground hides that layer entirely'
      );
    }

    if (!(relative in artwork)) {
      failures.push(
        `${key} names ${relative}, which artwork.json does not record — nothing ties it to this ` +
          "product's mark rather than to any PNG that happens to be the right shape"
      );
    }
  }

  // Expo requires the two adaptive layers to share dimensions; a mismatch is
  // composited rather than reported.
  const layers = [
    config.android?.adaptiveIcon?.foregroundImage,
    config.android?.adaptiveIcon?.backgroundImage,
  ];

  if (layers.every((path) => typeof path === 'string')) {
    const sizes = layers.map((path) => {
      try {
        const png = readPng(iconPath(path, root).absolute);
        return png.error ? null : `${png.width}×${png.height}`;
      } catch {
        return null;
      }
    });

    if (sizes[0] && sizes[1] && sizes[0] !== sizes[1]) {
      failures.push(
        `the adaptive foreground is ${sizes[0]} and the background is ${sizes[1]} — Expo requires ` +
          'the two layers to match, and composites a mismatch rather than reporting it'
      );
    }
  }

  return {
    label: `${derived.length + 2} derived values ok, ${iconChecks.length} icons`,
    failures,
  };
});

/**
 * The store privacy declaration (data-model §5; FR-103, FR-104).
 *
 * Registered beyond T040's and T041's task text, and recorded rather than
 * smuggled. The `privacy` object is what gets typed into two console forms, and
 * nothing else in this gate looks at it: without this group its `policyUrl`
 * could point at a page that was never built and both stores would be told so
 * in writing.
 *
 * **`policyUrl` is derived, not stored.** The origin lives in `VITE_SITE_URL`
 * and reaches the built document as its canonical link (`003` FR-075), so a
 * literal URL here would be a second copy of an origin that changes with the
 * deployment. `store-listing.json` holds the path; this composes the address the
 * same way the build does, and checks that the privacy page's own canonical link
 * agrees. That last comparison is what makes the derivation real rather than
 * arithmetic on two constants.
 */
group('privacy', ({ listing: doc, ROOT: root }) => {
  const failures = [];
  const privacy = doc.privacy;

  if (!privacy || typeof privacy !== 'object') {
    return {
      label: '0',
      failures: [
        'store-listing.json has no `privacy` object — both stores require a policy address, a ' +
          'data-collection answer, and a reason for every permission (data-model §5)',
      ],
    };
  }

  if (typeof privacy.policyPath !== 'string' || !privacy.policyPath.startsWith('/')) {
    failures.push(
      `privacy.policyPath is ${JSON.stringify(privacy.policyPath)} — it must be a root-relative ` +
        "path, because the origin is the build's and only the path is this listing's to own"
    );
  }

  if (!Array.isArray(privacy.dataCollected) || privacy.dataCollected.length > 0) {
    failures.push(
      'privacy.dataCollected is not an empty array — FR-103 declares no data collected to both ' +
        'stores, and anything listed here contradicts claims.collectsNoData and the in-app copy ' +
        'in the same file'
    );
  }

  const permissions = Array.isArray(privacy.permissions) ? privacy.permissions : [];
  if (permissions.length !== 1 || permissions[0]?.id !== 'microphone') {
    failures.push(
      'privacy.permissions must be exactly the microphone — the resolved Android permission set ' +
        'is checked by the identity group, and a second entry here would be a claim about the app ' +
        'that no configuration backs'
    );
  }

  // The reason is a pointer, not a copy. Storing the sentence again would put a
  // fifth hand-maintained copy of it in the one file whose whole purpose is that
  // there is exactly one (FR-088, FR-105).
  for (const permission of permissions) {
    const resolved = permission?.reasonFrom
      ?.split('.')
      .reduce(
        (value, key) => (typeof value === 'object' && value !== null ? value[key] : undefined),
        doc
      );

    if (typeof resolved !== 'string' || resolved.trim() === '') {
      failures.push(
        `privacy.permissions[${permission?.id}].reasonFrom points at ` +
          `${JSON.stringify(permission?.reasonFrom)}, which is not a non-empty string in this file`
      );
    }
  }

  // The derivation, checked against what was actually built.
  const canonicalOf = (name) => {
    const html = readFileSync(fileURLToPath(new URL(`apps/web/dist/${name}`, root)), 'utf8');
    return /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/.exec(html)?.[1] ?? null;
  };

  let siteCanonical;
  let policyCanonical;
  try {
    siteCanonical = canonicalOf('index.html');
    policyCanonical = canonicalOf('privacy.html');
  } catch {
    return {
      label: '0',
      failures: [
        ...failures,
        'apps/web/dist/privacy.html was not built — FR-104 requires a reachable policy page, and ' +
          'the address given to both stores is derived from it. Run `pnpm build` first',
      ],
    };
  }

  if (!siteCanonical || !policyCanonical) {
    failures.push(
      'the built index.html or privacy.html carries no canonical link, so the policy address ' +
        'cannot be derived from the origin the build decided on (003 FR-075)'
    );
  } else {
    const expected = new URL(privacy.policyPath ?? '', siteCanonical).href;
    if (policyCanonical !== expected) {
      failures.push(
        `the built privacy page's canonical is ${policyCanonical}, but the origin plus ` +
          `privacy.policyPath derives ${expected} — the address handed to both stores would not ` +
          'be the address the page claims for itself'
      );
    }
  }

  return { label: `policy at ${privacy.policyPath}, 0 data collected`, failures };
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
