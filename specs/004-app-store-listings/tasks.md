---

description: "Task list for 004-app-store-listings"
---

# Tasks: App Store Listing Optimisation

**Feature**: `004-app-store-listings` · **Created**: 2026-08-05

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/store-listing.md](./contracts/store-listing.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001`, `002`, and `003`: record deviations, defects,
measurements, and the verbatim gate failure messages here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE, and this feature's "tests" are mostly gate checks inside
`listing/scripts/verify-listing.mjs`. Every check task below says **what failure looks like before the
implementation exists**. A check that passes on its first run is wrong; fix the check before writing the
data it is supposed to be checking.

**The hazard this feature inherits.** `001` shipped `expect(transform).not.toBe('none')` — satisfied by
the constant that centres the marker — and a 144 px error survived seven phases. `003` recorded the same
shape a second time. The listing versions of it:

| Tempting assertion | Why it passes on a broken listing |
| --- | --- |
| "the listing agrees with `content.ts`" | Both sides are the same constant. **L7 needs the rendered text of `dist/index.html`.** |
| "every field is non-empty" | Passes with a field that is 34 characters against a limit of 30. |
| "`store-listing.json` contains no forbidden term" | Passes when the term is in `privacy.html` instead (L5 covers both). |
| "screenshots exist for light and dark" | Passes when the appearance switch silently failed and both directories hold the same image. **L9 needs the inequality.** |
| "the capture flag is only set locally" | A statement about a shell, not an artefact. `EXPO_PUBLIC_*` is inlined at build time. **L12.3 asserts the artefact.** |
| "no hex literal in `apps/**`" | The ESLint rule reaches TypeScript, not SVG in `public/` — which is how five literals have been sitting in `icon.svg` since `001` (D5). |

**Seven tasks are deliberately "break it and watch the gate fail"** — T051–T057. A gate never observed
failing is not known to work, and SC-043 makes that an explicit deliverable rather than a nicety.

**Four things cannot be automated honestly** (research D8) and are release gates, not merge gates:
SC-036 and SC-040 human validation, SC-041 review outcome, SC-045 store search ranking. They are in
Phase 7, marked **manual**, with their results to be recorded here.

---

## Phase 1: Setup

**Purpose**: Record the "before" this feature argues against, and make the tooling aware of the new
directory before anything is written into it.

- [X] T001 Confirm every gate passes on a clean checkout and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm build && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. This is the SC-044 baseline: the same numbers must hold at T063.
- [X] T002 [P] Record the D5 "before" in this file — run `grep -nE '#[0-9a-fA-F]{6}|rgb\(|hsl\(' apps/web/public/*.svg` and paste the five hex literals in `apps/web/public/icon.svg` with the `packages/tokens` value each one duplicates. V34 demonstrates against this evidence; without it captured now, the fix has nothing to point at.
- [X] T003 [P] Record the duplication census in this file — the microphone purpose sentence twice in `apps/mobile/app.json` (`ios.infoPlist.NSMicrophoneUsageDescription` and the `react-native-audio-api` plugin's `iosMicrophonePermission`), `version` `0.1.0` in `apps/mobile/app.json` against `0.0.0` in `apps/mobile/package.json`, and `com.prielaidas.chromatictuner` against `com.chromatictuner.app`. The plan's central claim is that this feature is net de-duplication; this is the count it is measured against.
- [X] T004 Teach the tooling about `listing/` — add `listing/scripts/*.mjs` to the Node-script scope in `eslint.config.js` (the block at `eslint.config.js:149` that already covers `apps/web/scripts/*.mjs`), then confirm `pnpm lint` and `pnpm format:check` are still clean. Doing this before the first script exists keeps a lint failure from being mistaken for a bug in the script.

**Checkpoint**: the before-state is written down, and a new `.mjs` in `listing/scripts/` will lint as a Node program rather than as browser source. ✅ **Reached 2026-08-05.**

### Phase 1 results — 2026-08-05, commit `d1792cf`, no source changes beyond T004's ESLint scope

**T001 — all eight gates green.** This is the SC-044 baseline; T060 must reproduce it.

| Gate | Result |
| --- | --- |
| `pnpm lint` | clean, `--max-warnings 0` |
| `pnpm format:check` | clean |
| `pnpm typecheck` | 5/5 projects |
| `pnpm test` | **430 passed**, 18 files, 7.95 s |
| `pnpm test:coverage` | **100% lines**, 98.5% statements, 94.81% branches, 97.29% functions |
| `pnpm --filter @chromatic-tuner/mobile test` | **64 passed**, 9 suites, 1.83 s |
| `pnpm build` | `dist/index.html` **7,454 B**, `assets/index-Dz1jTnFE.js` 235.52 kB, `sw.js` 3,069 B; `sw.js` emitted |
| `pnpm test:e2e` | **107 passed**, 39.8 s |
| `verify:build-output` | OK — crawl directives correct, no unresolved tokens, precache excludes them |

`dist/` holds nine files: `index.html`, `assets/`, `icon.svg`, `icon-maskable.svg`,
`manifest.webmanifest`, `og-image.png`, `robots.txt`, `sitemap.xml`, `sw.js`. T042's `privacy.html`
makes it ten, and T043 must add it to two of those (`sitemap.xml`, `sw.js`) by hand.

**T002 — the D5 "before", and a correction to D5's count.**

Research D5 names **five** literals in `apps/web/public/icon.svg`. There are **ten**: the same five
values again in `icon-maskable.svg`, which D5's table does not mention.

| Literal | Token it duplicates | `icon.svg` | `icon-maskable.svg` |
| --- | --- | --- | --- |
| `#0B0B0F` | `color.background.dark` (`packages/tokens/src/colors.ts:33`) | line 2 | line 3 |
| `#6B7280` | `color.line.dark` (`colors.ts:36`) | line 3 | line 4 |
| `#34C46A` | `color.inTune.dark` (`colors.ts:29`) | line 4 | line 5 |
| `#4C93F0` | `color.flat.dark` (`colors.ts:25`) | line 5 | line 6 |
| `#FFC978` | `color.sharp.dark` (`colors.ts:27`) | line 6 | line 7 |

**Five distinct token values, ten occurrences, two files.** This does not change D5's decision — it
strengthens it, because the maskable variant is a second hand-transcription of the same palette with its
own geometry. T028's L11 check must scan `apps/web/public/*.svg` as a glob, not `icon.svg` alone, or it
passes over half the defect; T033 must regenerate both files. Both tasks already say so; this is the
evidence they were right to.

**T003 — the duplication census.**

| Fact | Occurrences today | Where |
| --- | --- | --- |
| Microphone purpose sentence | **2**, byte-identical, 168 code points | `app.json:14` (`ios.infoPlist.NSMicrophoneUsageDescription`), `app.json:26` (`react-native-audio-api` plugin's `iosMicrophonePermission`) |
| Dark palette | **2** sources, 10 literal occurrences | `packages/tokens/src/colors.ts` + `apps/web/public/{icon,icon-maskable}.svg` |
| Marketing version | **2**, disagreeing | `app.json:5` = `0.1.0`, `apps/mobile/package.json:3` = `0.0.0` |
| Application identifier | **2**, disagreeing | `app.json:11` = `com.prielaidas.chromatictuner`, `app.json:18` = `com.chromatictuner.app` |
| Forbidden vocabulary | **1**, heading for 3 | `apps/web/e2e/metadata.spec.ts:410` |

D3's premise is confirmed: `git grep` finds the identifier in exactly **one** tracked source file
(`apps/mobile/app.json`); every other hit is this feature's own spec prose. `apps/mobile/ios/` is
gitignored, so there is no inertia on the iOS side to respect.

**A fifth divergence, not in the census the plan anticipated.** `app.json`'s `expo.name` is
`"ChromaticTuner"` (no space) while `apps/web/src/content.ts:48`'s `appName` is `"Chromatic Tuner"`
(with space) — and the purpose sentence leads with the no-space form. T008 requires `claims.appName` to
match `content.ts`, so **T008 and T012 must decide which form the purpose sentence uses** rather than
copying the current string through unexamined. Copying it forward verbatim would carry the divergence
into the store listing, where FR-105 requires the permission prompt, the listing copy, and the privacy
policy to explain the same purpose *in the same terms*. Recommendation: `"Chromatic Tuner"` everywhere,
because that is the form a shopper reads and the form `003` already ships on the web.

**T004 — the ESLint scope, verified rather than assumed.**

`listing/scripts/*.mjs` added alongside `apps/web/scripts/*.mjs` at `eslint.config.js:149`. Proved with
a throwaway probe using `process`, `URL`, and `document`:

| Probe location | `pnpm lint` |
| --- | --- |
| `listing/scripts/__probe.mjs` | clean, exit 0 |
| `listing/__probe.mjs` (outside the new scope) | 3 errors — `'URL' is not defined`, `'process' is not defined`, `'document' is not defined` |

The second row is what makes the first meaningful: without the change, ESLint does lint `.mjs` under
`listing/` and does reject it, so the scope is carrying real weight rather than matching nothing. Probe
deleted; `pnpm lint` and `pnpm format:check` both clean afterwards. `.prettierignore` needs no change —
it excludes `specs/` and `.specify/`, not `listing/`, so Phase 2's JSON is formatted like any other
source.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared spine every story reads — the limits, the forbidden vocabulary, the claims, the
gate harness, and the end of `app.json`'s duplicated identity.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Create `listing/limits.json` with the per-store field limits from data-model.md §3 (`ios`: name 30, subtitle 30, promotionalText 170, description 4000, keywords 100; `android`: title 30, shortDescription 80, fullDescription 4000), plus L4's fold lengths (`ios.descriptionOpening` 170, `android.descriptionOpening` 80) so a store layout change is a data edit. Each store block carries the documentation URL it was read from and a `lastChecked` date. Leave the `assets` section for T025.
- [X] T006 [P] Create `listing/out-of-scope-claims.json` holding the thirteen patterns currently at `apps/web/e2e/metadata.spec.ts:410` as **regex source strings** (`"\\btuning presets?\\b"`, …), each with the reason it is forbidden. Carry over the comment's word-boundary rationale — `async` contains `sync`, `accounting` contains `account` — because that is the half most likely to be rewritten as a substring check by whoever touches it next.
- [X] T007 Rewire `apps/web/e2e/metadata.spec.ts` to build its `OUT_OF_SCOPE` array from `listing/out-of-scope-claims.json` with `new RegExp(src, 'i')`, deleting the inline literals. Run `pnpm --filter @chromatic-tuner/web exec playwright test e2e/metadata.spec.ts` and confirm it is still green. **This is the only test file this feature may modify** (V37) — record that here.
- [X] T008 Create `listing/store-listing.json` containing the `claims` object only, per data-model.md §1: `appName` (matching `apps/web/src/content.ts`'s `appName`), `identifier` `com.chromatictuner.app` (D3, permanent), `purposeSentence` (the sentence currently duplicated in `app.json`), `collectsNoData: true`, `price`, `requirements`. The `stores` and `privacy` objects are deliberately absent so US1's and US3's checks have something to fail against.
- [X] T009 Create `listing/scripts/verify-listing.mjs` as a harness only — loads the three JSON files, runs a registry of named check groups, prints one line per group with counts (`fields: 13 ok · claims: 6 corroborated · assets: 9 ok · identity: ok`), and exits non-zero if any check reports a failure. A silent success is a failure of V30: the counts are what let a reviewer notice a field stopped being checked because it stopped existing. Header comment explains why this is `.mjs` and its data is JSON (D1: CI pins Node 20, which predates type stripping).
- [X] T010 Wire the gate — add `"verify:listing": "node listing/scripts/verify-listing.mjs"` to the root `package.json`, and a `Listing (fields, claims, assets, identity)` step to the `gates` job in `.github/workflows/ci.yml` **after** the existing `Build` step, because L7 reads `apps/web/dist/index.html`. Confirm the harness exits 0 with no checks registered.
- [X] T011 [P] Write `apps/mobile/__tests__/app-config.test.ts` **first** and observe it fail — it requires `../app.config`, and asserts: both iOS purpose strings (`ios.infoPlist.NSMicrophoneUsageDescription` and the `react-native-audio-api` plugin's `iosMicrophonePermission`) equal `claims.purposeSentence` verbatim; `ios.bundleIdentifier` and `android.package` both equal `claims.identifier`; `version` equals `apps/mobile/package.json`'s `version`; `ios.buildNumber` is the string form of the same integer `android.versionCode` is (L12.1, L12.2, FR-105–FR-107). Expected first-run failure: the module does not exist.
- [X] T012 Replace `apps/mobile/app.json` with `apps/mobile/app.config.ts` (D2) — a function returning the config, importing `../../listing/store-listing.json`, deriving name, `ios.bundleIdentifier`, `android.package`, `version` (from `./package.json`), and both purpose strings from it, with one `BUILD_NUMBER` integer constant feeding `ios.buildNumber` and `android.versionCode` (D10). **Delete `app.json`** — leaving it beside the config is the stale-copy failure D2 rejects. Carry `ios.supportsTablet` across unchanged for now; US2 decides it (T036). Run T011 and observe it pass.
- [X] T013 Set `apps/mobile/package.json`'s `version` to `0.1.0`, retiring the `0.0.0`/`0.1.0` disagreement recorded at T003, then confirm `pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild` resolves and prints the derived identifier, version, build number, and purpose strings. Record the resolved values here — this command is also how T046's gate check reads the config, since `.mjs` cannot import TypeScript.

**Checkpoint**: one identifier, one version, one build integer, one purpose sentence, one forbidden-vocabulary list, and a gate that runs in CI with nothing yet to say. User stories can now proceed. ✅ **Reached 2026-08-05.**

### Phase 2 results — 2026-08-05

**All gates green after the phase**: lint, format, typecheck 5/5, `pnpm test` 430 passed, mobile
**69 passed / 10 suites** (up from 64/9 — T011's five new assertions), `pnpm build` unchanged at
`dist/index.html` 7,454 B, `pnpm test:e2e` 107 passed, `pnpm verify:listing` green.

**The naming decision T003 asked for, now settled.** `claims.appName` is **`"Chromatic Tuner"`**, with
the space, confirmed with the user during this phase. It now drives the home-screen label, the
microphone prompt's first word, both listings, and agrees with `apps/web/src/content.ts:48`. The
alternative — keeping `ChromaticTuner` and changing the web copy instead — was rejected because that
copy is `003`'s shipped output and outside this feature's boundary. Recorded in
`store-listing.json`'s `$appName-note` so the reasoning survives where the value lives.

**The gate went red on its first run, and was right to.**

```
claims: 1 problem
  claims.requirements claims a capability 001 put out of scope — matches \baccounts?\b
```

`claims.requirements` had been written as *"A microphone. No account, and no network connection after
the first load."* FR-093 forbids the out-of-scope vocabulary **including inside a negation**, and this is
exactly that case: a listing that says "no account" has still put the word *account* in front of a
shopper and in front of a store's indexer. Rewritten positively — *"A microphone, and nothing else.
After the first load it works with no network connection at all."* — which says the same true thing
without naming the thing that does not exist.

Worth stating plainly because it happened before any store copy was written: the negation clause is not
a hypothetical hazard the spec invented. The first six sentences authored under it tripped it once.

**Deviation from the task text: `limits.json` nests the field map under `fields`.** T005 describes
`limits.ios.name`; the file has `limits.ios.fields.name`, with `descriptionOpening` and `documentation`
as siblings of `fields`. The reason is L1's iteration — the check walks every entry in a store's field
map, and metadata sitting in the same object would have to be filtered out by name, which is the kind of
filter that goes stale silently. T014 and T016 read `limits.<store>.fields` and
`limits.<store>.descriptionOpening`.

**`lastChecked` is `null`, deliberately.** The limits are recorded from prior knowledge, not re-read
from Apple's and Google's live specifications, and writing today's date beside them would have made an
unverified value look verified. T066 is the gate that reads both published specifications and sets the
dates; the `documentation.note` on each store says so where a person editing the file will see it.

**T007 — the extraction, verified by removal.** `apps/web/e2e/metadata.spec.ts` now compiles its
`OUT_OF_SCOPE` array from `listing/out-of-scope-claims.json`. Read with `readFileSync` rather than
imported: `listing/` is outside the app, and a JSON import under Node ESM needs an import attribute the
Playwright loader does not uniformly apply. Reading it also gives the missing-file case somewhere to
fail loudly — proved by moving the file away and re-running:

```
Error: listing/out-of-scope-claims.json could not be read (…/listing/out-of-scope-claims.json). It is
the shared source of the forbidden vocabulary for this suite and for pnpm verify:listing — an empty
list here would silently permit every claim it forbids.
```

That probe is the point of the task. A spec that read a missing file as an empty list would go green
while forbidding nothing. **`metadata.spec.ts` remains the only existing test file this feature
modifies** (V37, T061), and its only change is where the list comes from.

**T012 — two type errors worth recording, because both had a tempting wrong fix.**

1. `newArchEnabled` is accepted by Expo and appears in the resolved config, but is **not declared** in
   `@expo/config-types@57.0.2`'s `ExpoConfig`. The tempting fix is `as ExpoConfig` on the whole object,
   which would silence every future typo in the one file that now assembles the identifiers and the
   purpose string. Fixed by widening exactly one field: `type MobileConfig = ExpoConfig & {
   newArchEnabled?: boolean }`.
2. The test called `appConfig({ config: {} as never })`, which does not satisfy `ConfigContext`. Fixed
   by passing the real shape (`projectRoot`, `staticConfigPath`, `packageJsonPath`, `config`) rather
   than loosening the type — the three path fields go unread, which is itself the property that makes
   this config testable.

**T013 — the resolved config, and one finding for US3.**

| Value | Resolved |
| --- | --- |
| `name` | `Chromatic Tuner` |
| `version` | `0.1.0` (from `package.json`, now the only copy) |
| `ios.bundleIdentifier` | `com.chromatictuner.app` |
| `ios.buildNumber` | `"1"` |
| `android.package` | `com.chromatictuner.app` |
| `android.versionCode` | `1` |
| iOS purpose string ≡ plugin purpose string | **true** |
| `ios.supportsTablet` | `true` — T036 decides it |

**`android.permissions` resolves to more than the config asks for.** The config requests
`RECORD_AUDIO`; the resolved output is `RECORD_AUDIO`, `READ_EXTERNAL_STORAGE`,
`WRITE_EXTERNAL_STORAGE`, **`INTERNET`** — added by autolinked plugins, `expo-dev-client` among them.
This matters to FR-103 and T045: a Play data-safety form is answered against what the built app
declares, and `INTERNET` in a manifest is the first thing a reviewer reading a "no data collected"
declaration will ask about. **T045 must check the resolved permission list of a *release* configuration,
not of this dev-client one**, and record the answer. It does not falsify the declaration — a permission
is a capability, not a transmission, and `no-network.spec.ts` still asserts no requests are made — but
"we never looked" is not the state to be in at review.

**A note for T040.** The gate reads the resolved config by shelling out. Invoked as
`pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild` from the repository root
the output starts at `{`, but a differently-scoped pnpm invocation prefixes a `Scope: all 6 workspace
projects` banner on **stdout**, which is not JSON. T040 should slice from the first `{` rather than
trust the whole stream.

---

## Phase 3: User Story 1 - A guitarist searching a store finds the tuner and understands it (Priority: P1) 🎯 MVP

**Goal**: Both stores' fields carry copy that leads with what the tool does, fits every published limit,
claims nothing the app cannot do, and says the same thing as each other and as the web page.

**Independent Test**: Read `stores.ios` and `stores.android` alone — no images, no install — and confirm
a reader can say what the app is, what it costs, what it needs, and how to use it; then run
`pnpm build && pnpm verify:listing` and confirm every field is within limit.

### Checks for User Story 1 ⚠️ Write these first and observe them failing

> Each fails at first because `store-listing.json` has no `stores` object (T008). "Cannot read
> properties of undefined" is not an acceptable failure — each check must name the missing structure.

- [X] T014 [US1] Implement L1 in `listing/scripts/verify-listing.mjs` — every field in `stores.ios` and `stores.android` is non-empty after trimming and at most its limit from `limits.json`, **counted in Unicode code points** (`[...str].length`), not UTF-16 units and not bytes; the three disagree about an emoji in a 30-character store name. Failure message names the field, its actual count, and the limit: `stores.ios.subtitle is 34 characters, limit 30`. Expected first-run failure: `stores.ios is missing` (FR-109).
- [X] T015 [P] [US1] Implement L2 — `stores.ios.name` and `stores.android.title` each contain `tuner` and at least one of `guitar`/`chromatic`, and neither equals `claims.appName` alone. The check is deliberately weak: it cannot judge copy, only catch a regression to a bare codename, which is the failure it exists for (FR-089).
- [X] T016 [P] [US1] Implement L4 — the first `limits.ios.descriptionOpening` characters of `stores.ios.description` and the first `limits.android.descriptionOpening` of `stores.android.fullDescription` each mention the instrument, the microphone, and that the app is free (FR-091). Failure names which of the three is missing from which opening.
- [X] T017 [P] [US1] Implement L5 over `store-listing.json` — every string value at every depth, compiled from `out-of-scope-claims.json` with `new RegExp(src, 'i')`. Failure names **both** the matched term and the field path it appeared in (`stores.ios.description matches \btuning presets?\b`); a gate that names only the term makes a 4000-character field a search problem (FR-093, FR-110).
- [X] T018 [US1] Implement L6 — claim coverage, not string equality: every claim in `claims` appears in some phrasing in both stores' copy, and neither store asserts something absent from `claims`. Byte comparison would either fail always or force copy that wastes one store's fields (spec edge case 1). Record here how "appears in some phrasing" is decided, because that decision is the check (FR-095, FR-112).
- [X] T019 [US1] Implement L7 — every claim in `claims` is corroborated by the **rendered text of `apps/web/dist/index.html`**: strip tags and `<script>`/`<style>` contents from the built document, then match. **Not `apps/web/src/content.ts`.** Comparing the listing against the constant that produces the web page proves two constants are equal and proves nothing about what shipped. Fail with a clear message when `dist/index.html` is absent, naming `pnpm build` as the fix (FR-094, FR-112, L7).

### Implementation for User Story 1

- [X] T020 [US1] Author `stores.ios` in `listing/store-listing.json` — `name` (≤30, leads with the intent terms), `subtitle` (≤30, extends the name rather than repeating its words), `promotionalText` (≤170), `description` (≤4000, opening carries purpose, cost, and microphone before the fold), `keywords` (≤100, comma-separated **with no space after each comma** — the separator costs a character, and words already in `name`/`subtitle` are indexed and must not be repeated here) (FR-089–FR-092).
- [X] T021 [US1] Author `stores.android` — `title` (≤30), `shortDescription` (≤80), `fullDescription` (≤4000, carrying the discovery terms in prose because Play has no keyword field). Same substance as iOS, phrased for Play's field structure; a substantive difference is a defect T018 must catch (FR-090–FR-092, FR-095).
- [X] T022 [US1] Add `primaryCategory`, `secondaryCategory`, and `ageRating` to `stores.ios`, and `category` and `contentRating` to `stores.android`, each derived from the app's actual content and **recorded, not computed** — the questionnaires are answered in a console and their outcome is what lives here (FR-096).
- [X] T023 [US1] Run `pnpm build && pnpm verify:listing` and record the printed counts here. Every check from T014–T019 green (V30).
- [X] T024 [US1] Re-read the finished copy against `001`'s out-of-scope list by eye, including inside negations — "no presets needed" names a preset and FR-093 forbids it including inside a negation. Record the pass here; T017 catches the vocabulary, not the intent behind a sentence that dodges it.

**Checkpoint**: the listing has words. A store could be filled in from `store-listing.json` today, and the gate proves the fields fit. ✅ **Reached 2026-08-05 — MVP.**

### Phase 3 results — 2026-08-05

**T023 — V30, the whole automated surface green** (`pnpm build && pnpm verify:listing`):

```
claims: 25 fields ok
fields: 8 ok
names: 2 ok
openings: 2 ok
vocabulary: 38 strings clean
agreement: 7 claims × 2 stores
corroboration: 7 corroborated
```

**Field lengths against their limits** — nothing is close except `promotionalText`, which is the field
Apple lets you edit without review, so it is the cheapest one to be near:

| Field | Count | Limit |
| --- | --- | --- |
| `ios.name` | 23 | 30 |
| `ios.subtitle` | 23 | 30 |
| `ios.promotionalText` | 166 | 170 |
| `ios.description` | 1,634 | 4,000 |
| `ios.keywords` | 78 | 100 |
| `android.title` | 22 | 30 |
| `android.shortDescription` | 69 | 80 |
| `android.fullDescription` | 1,512 | 4,000 |

**T018/T019 — how "appears in some phrasing" is decided, because that decision is the check.**

A claim is not a string to be matched. The two stores' field structures differ by design, so byte
comparison would either fail always or force copy that wastes one store's fields. Each claim is
therefore restated in `claims.corroboration` as a **concept plus the phrasings that count as saying
it**, and both L6 and L7 ask whether every concept is present:

| Concept | Accepted phrasings |
| --- | --- |
| it tunes a guitar | `guitar` |
| it is chromatic — it names whatever note it hears | `chromatic` |
| it costs nothing | `free` |
| it listens through the microphone | `microphone` |
| the audio is analysed on the device | `on your device`, `on your own device`, `on this device`, `in the browser` |
| nothing is recorded, stored, or sent anywhere | `never recorded`, `not recorded` |
| it keeps working with no network connection | `no network connection`, `no network`, `offline` |

Substring matching is deliberate here and word-boundary matching is deliberate in L5. The asymmetry is
the point: L5 forbids terms, so a false positive on innocent prose gets it muted; L6 and L7 require
terms, so the risk runs the other way and a looser match is the safe direction.

**Adding a claim to a listing now means adding it here, which means the web page has to say it too.**
That is the coupling FR-094 asks for, made structural rather than editorial.

**Deviation, stated rather than hidden: L6's reverse direction is not automated.** The contract's L6 has
two halves — every claim appears in both stores (implemented), and *no store asserts something absent
from `claims`* (not implemented). The second is not decidable by a program reading prose. Its automated
half is the `vocabulary` group; its honest other half is T024's read-through. The check says so in its
own comment. A green report over a question never asked is what `003`'s D8 rejected, and writing one
here would have been the same mistake.

**T014–T019 were observed failing before the copy existed**, as required:

```
fields: 1 problem
  store-listing.json has no `stores` object
names: 0 ok
openings: 0 ok
agreement: 1 problem
  claims.corroboration is missing or empty
corroboration: 1 problem
  claims.corroboration is missing or empty
```

**A defect caught in the gate's own reporting, worth recording.** The first version of `names` and
`openings` printed `2 ok` on that run — they skipped absent fields as "L1's problem to report" but still
counted them as checked. That is precisely the assertion-satisfied-by-the-wrong-thing shape this file
opens by warning about, in the reporting rather than in the assertion: a reviewer scanning a red run
would have read `names: 2 ok` and believed two names had been checked when neither existed. Fixed to
count only what was actually evaluated, hence the `0 ok` above. **Not checked is not the same as ok**,
and a count line that conflates them is worse than no count line.

**Two smoke probes, because L7's failure mode is silent** (the formal set is T051–T057):

| Probe | Result |
| --- | --- |
| Add a concept the web page does not say (`it has a built-in strobe display`) | `agreement` names both stores, `corroboration` names the built page — 3 failures |
| Append 8 characters to `stores.ios.subtitle` | `stores.ios.subtitle is 31 characters, limit 30` |

**T024 — the read-through found what the vocabulary could not, again.**

The iOS description said *"There is no sign-up and nothing to create."* The pattern list forbids
`\bsign-?in\b` and says nothing about **sign-up** — so the gate passed it. It is the identical defect
the `account` pattern caught in Phase 2, one word outside the list's reach: a negation that names the
capability it denies.

Two changes, not one:

1. The copy now reads *"the app asks for the microphone and nothing else. There is nothing to create and
   nothing to join."*
2. **`\bsign-?up\b` added to `out-of-scope-claims.json`** with the reason recorded, because the hole was
   in the shared list rather than in the copy. Adding it turned the gate red on the draft before the
   copy was fixed, which is the demonstration:

```
vocabulary: 1 problem
  stores.ios.description claims a capability 001 put out of scope — matches \bsign-?up\b
```

The list is now **fourteen** patterns, not thirteen. `apps/web/e2e/metadata.spec.ts` reads the same file
and stays green — the web page never says it.

Everything else in the copy was checked by eye against `001`'s out-of-scope list, including inside
negations: no presets, no per-string targets, no custom tunings, no reference **tone** (the reference
*pitch* range of 415–466 Hz is a shipped feature and a different thing), no capo, no transposition, no
metronome, no chord library, no accounts, no sync. Pricing negations — "no purchases inside the app, no
advertising, no paid tier" — name commercial arrangements rather than capabilities `001` ruled out, and
stay.

**One check added beyond the task text, recorded rather than smuggled.** FR-092's rule that the iOS
keyword field must not repeat words already indexed in `name` and `subtitle` was written into T020 as an
authoring constraint with nothing verifying it. It is now part of the `names` group, along with a check
that no keyword carries whitespace around it — the separator costs a character out of 100. Its failure
mode is invisible without a check (the listing still works, it just competes for fewer queries than it
paid for), which is exactly the rot US4 exists to prevent. Probed:

```
names: 2 problems
  stores.ios.keywords repeats "tuner", which stores.ios.name or .subtitle already indexes
  stores.ios.keywords has whitespace around "note" — the separator costs a character out of 100
```

**All other gates unchanged**: lint, format, typecheck 5/5, 430 unit, 69 mobile / 10 suites, 107 e2e.

---

## Phase 4: User Story 2 - The listing looks like a tuner at a glance (Priority: P2)

**Goal**: A first-party icon generated from the app's own tokens, screenshots captured from the real
running app showing a real reading, in both appearances, at sizes the stores accept.

**Independent Test**: View the icon at store-search size among unrelated icons and confirm it reads as a
tuner; run `pnpm listing:assets` and `pnpm listing:screenshots` from a clean checkout and confirm
`git status --porcelain listing/assets apps/web/public` reports nothing.

### Checks for User Story 2 ⚠️ Write these first and observe them failing

- [X] T025 [US2] Add the `assets` section to `listing/limits.json` per data-model.md §4 — for each artefact its pixel dimensions, format, and whether an alpha channel is required, forbidden, or ignored; for Android screenshots the range form (320–3840 per side, **longest side ≤ 2× shortest**). The Android aspect rule is data here rather than folklore in the capture script because a default phone emulator profile boots at 1080×2400 (2.22:1) and Play rejects it.
- [X] T026 [US2] Implement L8 in `verify-listing.mjs` — for every entry in `limits.assets`: the file exists, and its dimensions, colour type, and alpha are read **from the PNG header directly** (bytes 16–24 of the IHDR give width and height; byte 25 is the colour type — 2 is RGB, 6 is RGBA), no image dependency (Principle II). Failure names the file, what was expected, and what was found, plus which store requires it. Expected first-run failure: every asset missing (FR-111).
- [X] T027 [P] [US2] Implement L9 — for each platform at least one screenshot under `light/` and one under `dark/`, and the two are **not byte-identical**. The inequality is the point: a capture script whose appearance switch silently failed produces two directories of the same image, which passes a presence check and fails Principle IV (FR-101).
- [X] T028 [P] [US2] Implement L11 — no `#rrggbb`, `rgb(`, or `hsl(` literal appears in `listing/scripts/*.mjs` or in `apps/web/public/*.svg`. Expected first-run failure: the five literals in `apps/web/public/icon.svg` recorded at T002. This check is what closes the gap D5 found — the `apps/**` hex rule is an ESLint rule and does not reach SVG in `public/` (FR-098).

### Implementation for User Story 2

- [X] T029 [US2] Write `listing/scripts/generate-icons.mjs` (D6) — read `apps/web/dist/index.html`, lift the `<style data-chromatic-tuner="tokens">` block, render an HTML template whose every colour is a `var(--ct-*)` reference, and screenshot it with the `@playwright/test` Chromium already installed. Follow `apps/web/scripts/generate-og-image.mjs` deliberately, including its failure path when `dist/index.html` is absent or has changed shape. No new dependency.
- [X] T030 [US2] Design the mark itself inside that template — it must read as a tuner at 48 px among unrelated icons (SC-040), not as an unlabelled shape or a wordmark, and compose all meaning inside the **centre 66% safe zone** so an adaptive-icon mask cannot cut it. Record the reasoning here; this is the one task in the feature whose output a gate cannot judge.
- [X] T031 [US2] Emit `listing/assets/icon-play-512.png` (512×512, 32-bit PNG, ≤1 MB), `icon-adaptive-foreground.png` (1024×1024, alpha, safe-zone composed), and `feature-graphic-1024x500.png` (1024×500, **no alpha** — Play will not publish without this asset and it is the one most easily forgotten because no other store has an equivalent).
- [X] T032 [US2] Emit `listing/assets/icon-ios-1024.png` with **no alpha channel and no pre-applied corner rounding** — Apple rejects both. Chromium's PNG encoder writes colour type 6 (RGBA) even for a fully opaque screenshot, so the raster must be re-encoded to colour type 2. Do it with `node:zlib` (`inflateSync` the IDAT, drop the alpha byte per pixel, re-filter, `deflateSync`, recompute the CRC32) rather than adding an image dependency; if that proves unworkable, record the reason here and raise it rather than shipping an alpha channel Apple will reject. T026 is what makes the failure loud.
- [X] T033 [US2] Regenerate `apps/web/public/icon.svg` and `apps/web/public/icon-maskable.svg` from the same generator as `var(--ct-*)`-free resolved output, replacing the hand-transcribed literals (D5). Confirm the web app's icon and manifest still render, and that T028 now passes.
- [X] T034 [US2] Write `apps/mobile/src/adapters/captureAudioSource.ts` — an `AudioSource` emitting a generated tone, mirroring the reference-signal approach `apps/web/e2e/fixtures/generate.mjs` already uses. Add a contract test at `apps/mobile/__tests__/capture-audio-source.contract.test.ts` running `packages/core/testing/port-contract-tests.ts` against it, exactly as `rn-audio-source.contract.test.ts` does — a port implementation that skips the contract suite is the thing that suite exists to prevent.
- [X] T035 [US2] Select the capture source in `apps/mobile/src/App.tsx` behind one `EXPO_PUBLIC_*` boolean, read at one call site (the plan's single Complexity Tracking entry). Comment it with why it exists and that T047 asserts its absence from release output; a flag whose justification lives only in a spec file gets copied.
- [X] T036 [US2] Set `ios.supportsTablet: false` in `apps/mobile/app.config.ts` (D4, FR-099) and record the consequence here — iPad users get the phone app letterboxed, which is what a tablet-declared app with no tablet layout gives them anyway, minus the review risk and minus a screenshot axis. Reversible; D3's identifier is not.
- [X] T037 [US2] Write `listing/scripts/capture-screenshots.mjs` (D7) — boot a simulator and an emulator, set appearance with `xcrun simctl ui booted appearance {light,dark}` and `adb shell cmd uimode night {no,yes}`, launch the capture build, capture with `xcrun simctl io booted screenshot` and `adb exec-out screencap -p`, and verify each captured file against `limits.assets` before writing it. Pin the Android profile to **1080×1920** (1.78:1); the common 1080×2400 default is 2.22:1 and is rejected. Add `listing:assets` and `listing:screenshots` scripts to the root `package.json`. Document that this cannot run on CI's Ubuntu runners.
- [~] T038 [US2] **iOS done, Android blocked — see Phase 4 results.** Capture and commit the screenshot set under `listing/assets/screenshots/{ios,android}/{light,dark}/`, each showing the tuner displaying a note — not an empty state and not the permission prompt. Then run `pnpm listing:screenshots` again and confirm `git status --porcelain listing/assets/screenshots` is empty (V33, SC-039). Compare one light against one dark capture: byte-identical means the appearance switch silently failed.
- [X] T039 [US2] Run `pnpm build && pnpm listing:assets && pnpm verify:listing`; confirm T026–T028 green and `git diff --stat apps/web/public listing/assets` is empty on a second run (V34). Record the asset counts here.

**Checkpoint**: the listing has an icon and screenshots, both regenerable from a clean checkout, and the web app no longer carries a second hand-hexed copy of the dark palette. ⚠️ **Partially reached 2026-08-05 — iOS complete, Android screenshots blocked.**

### Phase 4 results — 2026-08-05

**`pnpm verify:listing` after the phase — green except the one tracked gap:**

```
claims: 25 fields ok · fields: 8 ok · names: 2 ok · openings: 2 ok
vocabulary: 38 strings clean · agreement: 7 claims × 2 stores · corroboration: 7 corroborated
assets: 2 problems
  listing/assets/screenshots/android/light/ does not exist — Google Play … needs this set
  listing/assets/screenshots/android/dark/ does not exist — Google Play … needs this set
appearances: 1 problem
  android is missing a light screenshot — Principle IV requires both appearances be represented
artwork: 5 scanned
```

**Every other gate green**: lint, format, typecheck 5/5, 430 unit, **78 mobile / 11 suites** (up from
69/10 — T034's nine), `pnpm build` unchanged at 7,454 B, 107 e2e.

#### T038 — Android is blocked, and the gate says so

**This machine has no Android SDK**: no `adb`, no `~/Library/Android`, `ANDROID_HOME` unset. The four
missing files are exactly what `verify:listing` names, and **the decision was to leave the gate red and
track the gap** rather than soften the check. Play genuinely requires those screenshots; a
`required: false` flag would have turned the gate green over a listing that cannot be published, which
is the softening US4 exists to prevent.

**To close it**: install the Android SDK platform-tools, create a **1080×1920** AVD (the common
1080×2400 default is 2.22:1 and Play rejects it — `limits.assets.screenshots.android.maxAspectRatio`),
install a capture build, and run `pnpm listing:screenshots`. The script already handles the Android
half; it reports the skip and exits non-zero rather than passing silently.

#### T038 — iOS is done, and getting there found four things

**1. A debug build cannot produce a store screenshot.** The first capture attempt used the dev client.
It showed the real tuner — `A4 440 Hz`, a big `A₄` — with expo-dev-client's developer-menu sheet
covering the bottom half of the screen, and the floating dev-tools button over it. A store screenshot
carrying developer chrome misrepresents the product as surely as a mockup would. The fix is a **Release
configuration**, which also inlines the JS bundle so no Metro has to be running during capture. The
script now says so in a comment rather than leaving the next person to rediscover it.

**2. The device profile is not a preference.** The first clean capture came from an iPhone 17 Pro at
**1206×2622** — and Apple's 6.9" slot is **1320×2868**, which only the Pro Max produces. `limits.json`
already listed the accepted pairs, so the gate would have caught it; the script now pins
`IOS_DEVICE = 'iPhone 17 Pro Max'` and explains why.

**3. Permission has to be granted by the script, not by a person.** A fresh simulator has no answer
recorded for the microphone, so the app shows its permission explainer instead of a reading. `xcrun
simctl privacy booted grant microphone` is what makes the capture reproducible; the alternative is a
human tapping Allow, which SC-039 rules out.

**4. The status bar defeats byte-exact reproduction, and pinning it only mostly fixes that.** The clock
is part of the captured pixels, so consecutive runs differed by the minute. `simctl status_bar override`
pins the time to 9:41, the battery to charged/100, and the bars — after which **light reproduces
byte-identically across five runs**.

**Dark still alternates between exactly two byte values, and the difference is 18 pixels.** Measured by
diffing two dark captures pixel by pixel:

| Measurement | Value |
| --- | --- |
| Differing pixels | **18** of 3,786,960 (0.0005%) |
| Bounding box | x 471–848, y 69–143 |
| What is there | the Dynamic Island cut-out, in the status bar |
| The tuner region | **byte-identical** |

So the *app* renders deterministically; the simulator's own status-bar chrome does not. This matters for
how **V33 is run**: `git status --porcelain listing/assets/screenshots` reporting clean is not achievable
for the dark capture, and treating that as a failure would train whoever runs it to ignore the check.
**V33's reproduction step should be read as "no change outside the status bar", not as byte equality** —
a UI change, which is what SC-039 actually protects against, moves far more than 18 pixels in a region
400 px lower down. Recorded here rather than quietly relaxing the scenario in `quickstart.md`.

#### T030 — the mark, and an honest note about SC-040

The icon is the tuner's own display reduced until it survives being a fingernail wide: the line, the
centred marker, the flat and sharp cues as dots, and **two tick marks**. Every colour is a `var(--ct-*)`.

The first version had no ticks and put the dots inboard of the line, and looking at it at 48 px killed
both decisions:

- **The line's rounded ends poked out past the dots** as grey stubs, which at icon size reads as a
  rendering mistake rather than a design. The dots now cap the line (`dotOffset` 0.22 → 0.26).
- **A bar on a line is a slider, not a tuner.** Ticks are what make it a measuring instrument, and they
  are the app's own `TickMark` rather than an invention for the icon.

Extreme extent is 0.26 + 0.03 = **0.29 of the width from centre**, so the whole mark sits inside the
centre 58% — within the 66% adaptive-icon safe zone with room for a circular mask.

**SC-040 has not been run and this mark may come back.** Rendered at 48/64/96/128 px among neutral
chrome, it reads as a scale with a centred indicator; whether a stranger says *tuner* is exactly the
question T064 asks and I cannot answer it by looking at my own work. It is at least not an unlabelled
blob and not a wordmark, which is what T030 asked for.

#### T032 — the alpha strip worked, and why it had to

Chromium writes PNG colour type 6 (RGBA) for every screenshot, including a fully opaque one, and Apple
rejects an app icon with an alpha channel. `generate-icons.mjs` decodes the IDAT with `node:zlib`,
reverses PNG's per-scanline filtering (all five filter types, Paeth included), drops the alpha byte,
re-encodes as colour type 2, and recomputes the CRC32 — about 100 lines and **no new dependency**, which
is what Principle II asks before reaching for `sharp`.

`icon-ios-1024.png` and `feature-graphic-1024x500.png` come out as colour type 2;
`icon-adaptive-foreground.png` keeps its alpha, because the launcher masks it to a device-chosen shape
and an opaque foreground defeats the mask. L8 checks all three from the PNG header.

#### T039 / V34 — generation is deterministic

`md5` of all six artefacts across two consecutive `pnpm listing:assets` runs: **identical**.
`git diff --stat apps/web/public listing/assets` after regeneration: empty.

#### T028 — the check I wrote first was satisfiable by the defect it was written for

Worth recording in full, because it is this feature's own headline hazard and I walked into it.

L11 as the contract states it — *"no colour literal appears in any generator template or committed
SVG"* — **is not satisfiable by any SVG that renders**. A standalone icon has to carry its colours
somewhere; a maskable icon cannot inherit `var(--ct-*)` from a document it is not in. Forbidding
literals outright would forbid the file from working.

So I first wrote the check as *"every colour literal in the committed SVGs must be a current `--ct-*`
value"*. It passed immediately — **because D5's five literals were transcribed correctly**. They were
palette values on the day they were typed. A check that passes on the defect it was written for is
worth nothing.

The check now has two halves, because either alone is satisfiable by the wrong thing:

| Half | Catches | Would miss alone |
| --- | --- | --- |
| Every literal is a current `--ct-*` value | drift — a token changes and the SVG is not regenerated | the original defect, which matched at the time |
| The file carries the generator's provenance marker | hand-authoring | a stale generated file whose colours no longer match |

Both were observed failing:

```
artwork: 2 problems
  apps/web/public/icon-maskable.svg is hand-authored — it carries no
  listing/scripts/generate-icons.mjs marker. Its colours may match the palette today and drift the
  moment a token changes, which is exactly what D5 found in this file
  apps/web/public/icon.svg is hand-authored — …
```

```
artwork: 1 problem
  apps/web/public/icon.svg uses #00FF00, which is not a --ct-* token value — the artwork has drifted
  from the palette it is supposed to be generated from
```

**This is a deviation from contract L11 and it is deliberate.** The grep the contract describes is the
weaker check; this is what it was protecting. V34's "regenerate and see no diff" is the third leg and
the only one that proves the bytes, which is why it stays manual.

#### T036 — the tablet withdrawal, verified in the native project

`ios.supportsTablet: false`. Confirmed by `expo prebuild -p ios --clean` and reading the generated
`Info.plist`: `UIDeviceFamily = [1]` — iPhone only.

The same prebuild confirmed the whole of D2 end to end, which no test had yet done: `Info.plist`'s
`NSMicrophoneUsageDescription` is `claims.purposeSentence` **verbatim**, and
`PRODUCT_BUNDLE_IDENTIFIER` is `com.chromatictuner.app` in both build configurations. T011 asserted
that against the config object; this is the same fact read out of the native project Expo generated
from it.

---

## Phase 5: User Story 3 - The listing passes review the first time (Priority: P3)

**Goal**: Every artefact both stores require of a microphone app exists, is reachable, and states
something true of the built app — and the boundary where version control ends is written down rather
than assumed away.

**Independent Test**: Walk each store's submission requirements for an app requesting microphone access
and confirm every required artefact exists in the repository, is reachable, and matches the app.

### Checks for User Story 3 ⚠️ Write these first and observe them failing

- [X] T040 [US3] Implement L12.1 and L12.2 in `verify-listing.mjs` — shell out to `pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild`, parse the resolved config, and assert both iOS purpose strings and the Android permission rationale equal `claims.purposeSentence` verbatim, and that `ios.bundleIdentifier` and `android.package` both equal `claims.identifier`. Reading the **resolved config** rather than the source is the point: `.mjs` cannot import `app.config.ts` (D1), and the resolved output is what actually reaches `Info.plist` and `AndroidManifest.xml`. Because T012 already made this true, **observe it failing by temporarily altering one purpose string in `app.config.ts`**, then revert — a check never seen red is not known to work.
- [X] T041 [P] [US3] Extend L5 to the privacy page — scan the rendered text of `apps/web/dist/privacy.html` with the same compiled patterns. Expected first-run failure: the file does not exist, and the message must say so rather than silently scanning nothing. A check that passes over an absent file is the quietest way to lose this gate.

### Implementation for User Story 3

- [X] T042 [US3] Create `apps/web/privacy.html` (D9) — the policy prose **in the served document**, no React, no runtime injection: a store reviewer must not have to run a script to read a privacy policy. It states in plain language what the app does with audio, reproduces `claims.purposeSentence`'s terms, and agrees with the in-app privacy statement (FR-031, FR-104, FR-105).
- [X] T043 [US3] Register the page in `apps/web/vite.config.ts` in **all three** places, each of which ships quietly when missed: `build.rollupOptions.input` (or the page is not built), `sitemapXml()` (or the policy is unlisted — `003`'s FR-073 named this as the registration point), and the precache array at `vite.config.ts:528` (or the policy is the one page that breaks offline and FR-030's guarantee gets a hole in it). `siteIdentity()`'s `transformIndexHtml()` has no filter, so the token `<style>` block and canonical handling come free.
- [X] T044 [US3] Add `apps/web/e2e/privacy.spec.ts` — the policy text is present in the response **with scripting disabled** (following `no-script.spec.ts`'s method), the page has exactly one `<h1>`, its canonical tag resolves, and it passes the same axe check `a11y.spec.ts` applies to the tuner. Write it before T042 is finished if possible; if T042 landed first, observe it failing by emptying the page body, then revert.
- [X] T045 [US3] Add the `privacy` object to `listing/store-listing.json` per data-model.md §5 — `policyUrl` **derived from the canonical origin** (`003` FR-075) rather than written literally, `dataCollected` empty, `permissions` microphone-only with `claims.purposeSentence` as the stated reason. Record here that FR-103's correctness rests on `apps/web/e2e/no-network.spec.ts` staying green: if analytics, crash reporting, or an update ping is ever added, that gate goes red and this declaration becomes false in the same commit (SC-042).
- [X] T046 [US3] Run `pnpm build && pnpm verify:listing && grep -c privacy apps/web/dist/sitemap.xml && grep -c privacy apps/web/dist/sw.js`, then `pnpm --filter @chromatic-tuner/web preview --port 4173 &` and `pnpm --filter @chromatic-tuner/web verify:offline` (V36). Record both grep counts and the offline result here; the two greps exist because the sitemap function and the precache array are separate hand-edits.
- [X] T047 [US3] Implement L12.3 — a build-output assertion, following `apps/web/scripts/verify-build-output.mjs`'s precedent, that a release-configuration bundle contains no capture-mode flag and no reference to `captureAudioSource`. `EXPO_PUBLIC_*` values are inlined at build time, so "it is only set locally" describes a shell, not an artefact. Observe it failing by building with the flag set, then rebuild without (V35, FR-113).
- [X] T048 [US3] Write `listing/submission.md` (FR-108) — one row per store console field naming the repository artefact that fills it, plus a section for every field **no artefact can fill**: the age-rating and IARC questionnaires, account-level settings, and the re-check of `limits.json` against current store documentation. Include D10's rule that `BUILD_NUMBER` increments on every submission including a resubmission of an unchanged version (FR-107), and D3's caveat that `com.chromatictuner.app` must be confirmed against whatever origin `VITE_SITE_URL` eventually takes, **before first submission**, because it is permanent afterwards.
- [X] T049 [US3] Capture light and dark screenshots of the privacy page for the pull request (the plan's obligation 4 — Development Workflow requires both appearances for any UI change) and attach them. The privacy page is subject to the same contrast, text-size, and appearance obligations as everything else (Principle IV).

**Checkpoint**: a submission could be prepared end to end from the repository, with the manual steps named rather than discovered at the console. ✅ **Reached 2026-08-05.**

### Phase 5 results — 2026-08-05

**`pnpm verify:listing` after the phase** — everything green except the one gap Phase 4 already tracked:

```
claims: 25 fields ok · fields: 8 ok · names: 2 ok · openings: 2 ok
vocabulary: 41 strings clean, plus the built privacy page
agreement: 7 claims × 2 stores · corroboration: 7 corroborated
assets: 2 problems   (android screenshots — T038, unchanged)
appearances: 1 problem (android — T038, unchanged)
artwork: 5 scanned
identity: 7 derived values ok
privacy: policy at /privacy.html, 0 data collected
```

**Every other gate green**: lint, format, typecheck 5/5, `pnpm test` **430 passed**, coverage **100%
lines / 98.5 stmts / 94.81 branches / 97.29 funcs** (T001's baseline exactly), mobile **78 passed / 11
suites**, `pnpm build`, `verify:build-output`, `pnpm test:e2e` **112 passed** (up from 107 — this
phase's five), `verify:offline` green, `verify:release-bundle` green.

`dist/` now holds **ten** files, as Phase 1 predicted: `privacy.html` joins the nine.
`dist/index.html` is **unchanged at 7,454 B**, which is the cheapest evidence that adding a second page
did not alter the first one's document.

#### Three defects found in this phase, two of which would have shipped silently

**1. The service worker served the tuner for `/privacy.html`.** `sw-source.js` answered *every*
navigation from the cached `/index.html` — correct while the site had one document, wrong the moment it
had two. Measured, both before and after, through the real service worker with the network off:

| Request | Old handler | Fixed handler |
| --- | --- | --- |
| `/privacy.html`, offline | `h1 = "Free Online Guitar Tuner"` | `h1 = "Privacy Policy"` |
| an unknown deep link, offline | app shell | app shell (unchanged) |

The failure is invisible in development, because `vite dev` never emits a service worker, and invisible
on a first visit, because the worker is not yet controlling the page. A store reviewer following the
policy link on a second visit would have been shown a guitar tuner.

**2. The precache manifest listed a file that was never written, which broke the service worker
entirely.** An HTML input with no `<script>` of its own still gets a Rollup entry chunk —
`assets/privacy-BvRk9kiK.js`, **zero bytes of code** — and Vite's own HTML plugin deletes it *after*
`precache()`'s `generateBundle` has already read the bundle. So `sw.js` precached a URL that does not
exist, `cache.addAll` rejected on install, and **the app was not offline-capable at all**. One missing
entry fails the whole `addAll`; nothing about it is visible online. Fixed by excluding empty chunks, and
confirmed by `verify:offline`: cold 896 ms, warm 314 ms, offline 310 ms, all inside FR-026's 2000 ms.

**3. `captureAudioSource.ts` was in the release bundle.** This is T047's finding and the important one.
The Complexity Tracking entry assumed that reading the flag at a single call site kept the capture source
out of a store build. It does not: **Metro puts a statically imported module in the graph whether or not
the value it binds is ever used.** Choosing at runtime decides which object is constructed, not what is
bundled. Measured from the export's source map:

| App.tsx | `captureAudioSource.ts` in the release graph |
| --- | --- |
| `import { CaptureAudioSource } …` at the top, chosen by ternary | **present**, on both platforms |
| `require(…)` inside the inlined `process.env.EXPO_PUBLIC_SCREENSHOT_CAPTURE === 'true'` check | absent |
| the same `require` form, built **with** the flag set | present (the control) |

`babel-preset-expo` inlines `EXPO_PUBLIC_*` as literals before Metro collects dependencies, so the
false branch and its `require` are folded away together. `apps/mobile/src/App.tsx` now uses that form.

#### T047 — two things the check had to avoid, both measured

**Grepping the shipped bundle proves nothing.** A release bundle is Hermes bytecode with every
identifier minified. `grep -c captureAudioSource` over the `.hbc` returns **0** — and so does
`grep -c RNAudioSource`, for the source that is definitely in it. Quickstart V35 describes exactly that
grep, and taken literally it is this feature's headline hazard in its purest form: an assertion that
passes whatever the artefact contains. `verify-release-bundle.mjs` reads the export's **source map**
instead, whose `sources` array names every module Metro pulled in, before any renaming.

**Metro's transform cache is not keyed on `EXPO_PUBLIC_*` values.** The first attempt at the control
build set the flag and found nothing — because the export reused the previous export's transform of
`App.tsx`. Adding `--clear` produced the expected result immediately. A check that reads a stale
transform verifies the build before last. This also matters outside the gate: a **capture build made
right after an ordinary one can ship the microphone source**, and the symptom is a screenshot of an
empty tuner that looks like a timing problem. `capture-screenshots.mjs` now says so, with the command.

The script runs four exports (two platforms × release and control) in **26 s**. It is not in the CI
`gates` job — it is a release gate, listed in `listing/submission.md`.

#### T040 — L12.1, and the half of it that does not exist

Observed red by altering the plugin's purpose string in `app.config.ts`:

```
identity: 1 problem
  the resolved config's plugins["react-native-audio-api"].iosMicrophonePermission is "Chromatic Tuner
  needs the microphone.", but claims.purposeSentence is "Chromatic Tuner listens to your instrument…"
  — the two must be the same string, not two copies of it (FR-105, FR-106)
```

**L12.1 names "the Android permission rationale" and there is no such field.** Android declares a
permission without a reason string; the rationale a user reads is the in-app explainer in
`apps/mobile/src/components/molecules/PermissionPrompt.tsx`, which is outside this feature's boundary
(FR-113, SC-044). Asserting it here would have meant either changing that component or writing a check
that pretends the configuration carries something it does not. What is checked instead is that the
resolved Android permission set still requests `RECORD_AUDIO` — the fact the plugin config is actually
responsible for. Stated here rather than quietly satisfied.

#### T045 — what a release Android build really declares

Phase 2 asked for this to be checked against a *release* configuration rather than the dev-client one.
`expo prebuild -p android` generates a main manifest (all build types, not just debug) declaring:

`INTERNET`, `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`,
and the `RECORD_AUDIO` the config asks for.

None of the first five is requested by `app.config.ts`. They come from the React Native template and
from autolinked modules, with `expo-dev-client` contributing `SYSTEM_ALERT_WINDOW`. This does **not**
falsify `privacy.dataCollected` — a permission is a capability, not a transmission, and
`no-network.spec.ts` asserts nothing is transmitted — but `INTERNET` beside a "no data collected"
declaration is the first thing a reviewer asks about, and a store build still carrying the development
client is a separate problem. Recorded as a **pre-submission open action** in `listing/submission.md`
with the remedy, rather than fixed here: this machine has no Android SDK to build and run the result
against, and an unverified change to how the app is assembled is not an improvement.

**FR-103's correctness rests on `apps/web/e2e/no-network.spec.ts` staying green.** If analytics, crash
reporting, or an update ping is ever added, that gate goes red and `privacy.dataCollected` becomes false
in the same commit rather than a release later (SC-042). That is the only mechanism in this repository
that makes a privacy declaration a promise about the future, and it is recorded in the file itself.

#### T046 — V36, recorded

| Check | Result |
| --- | --- |
| `grep -c privacy dist/sitemap.xml` | **1** |
| `grep -c privacy dist/sw.js` | **3** |
| `verify:offline` | green — cold 896 ms, warm 314 ms, offline 310 ms |
| policy text present with scripting off | yes (`privacy.spec.ts`, asserted on the response bytes) |

#### Deviations, stated rather than hidden

**1. `metadata.spec.ts` was modified a second time**, and V37 said its only change would be where it
reads the forbidden list from. The sitemap test asserted `locations` equals *exactly the canonical
address*, which was correct while the site had one page. T043 requires the policy to be listed
(`003`'s FR-073 named `sitemapXml()` as the registration point), so that assertion had to become the
**set** of real pages. The property it protects is unchanged — the sitemap offers exactly the pages that
exist and nothing else — and the test now additionally requests every listed URL and requires a 200.
T061 should expect two changes to this file, not one.

**2. `verify-build-output.mjs` was modified**, for the same reason and in the same direction. It
asserted `locations.length === 1`. A magic number would have to be hand-edited every time a page is
added, so it now derives the expected set from the `.html` files `dist/` actually holds. That covers
both halves of D9's registration problem: a page built and not listed, and a page listed and not built.
Neither file is a test of tuner behaviour; both are page-identity gates that had one page hard-coded
into them.

**3. `apps/web/src/content.ts` gained two exports** — `privacyTitle` and `privacyDescription`. The
policy prose itself is markup in `privacy.html` (D9 requires it in the served document), but a second
page needs a second title and description or the two compete for the same queries and a reviewer
following the policy link lands on a tab labelled "Online Guitar Tuner".

**4. `siteIdentity()`'s `transformIndexHtml()` needed a filter after all.** T043 says the token
`<style>` block and canonical handling "come free" because the hook has no filter. The free part is
real — the token block is shared — but the *unfiltered* part was wrong: without a branch, `privacy.html`
would have received the tuner's `<title>`, the tuner's canonical address, and a second `<h1>` from the
injected supporting content. It is now page-aware, and the privacy branch is where `%CT_APP_NAME%` and
`%CT_PURPOSE_SENTENCE%` are replaced from `store-listing.json` so the purpose sentence has one author
rather than four. An unreplaced placeholder throws at build time rather than shipping a value-shaped
literal — the same failure `003` removed from the canonical link.

#### T049 — the privacy page, both appearances

`specs/004-app-store-listings/screenshots/web-privacy-{light,dark}.png` and the same pair at the
smallest supported viewport (360×640). Axe is clean in both appearances, the page has one `<h1>`, and
nothing scrolls sideways at 360 px.

---

## Phase 6: User Story 4 - The listing does not silently rot (Priority: P4)

**Goal**: Every gate written in Phases 3–5 is observed failing on a real break and observed staying
green on innocent prose, and the rest of the project is proven unchanged.

**Independent Test**: Overrun a length limit, delete a required asset, and introduce a forbidden claim;
confirm the gates fail and each failure names the specific field or file at fault.

- [X] T050 [US4] Confirm `pnpm verify:listing` runs in CI on a pull request and fails the `gates` job when the listing is broken — push a deliberate break and confirm the job goes red, then revert. T010 wired the step; this proves the wiring, and `003`'s T052 found `pnpm build` had been listed as a gate since `001` without ever being in the workflow.
- [X] T051 [US4] **Break 1 (SC-043)**: append 8 characters to `stores.ios.subtitle`, run the gate, and record the failure message **verbatim** here. It must name `stores.ios.subtitle`, its actual count, and the limit 30. Revert.
- [X] T052 [US4] **Break 2**: set `stores.android.shortDescription` to `""`, run, record verbatim. It must name the field as empty, not merely report the listing invalid. Revert.
- [X] T053 [US4] **Break 3**: delete `listing/assets/feature-graphic-1024x500.png`, run, record verbatim. It must name the missing file and which store requires it. Restore.
- [X] T054 [US4] **Break 4**: add "supports Drop D" to `stores.ios.description`, run, record verbatim. It must name the matched term **and** the field it appeared in. Revert.
- [X] T055 [US4] **The inverse, which matters as much as the four**: add a sentence containing `asynchronous` and `accounting` to a description, run, and confirm the gate stays **green** — L5's word boundaries are the half most likely to be written as substrings, and a gate that fires on innocent prose gets muted. Revert.
- [X] T056 [US4] **V32, both directions**: (a) edit a claim in `store-listing.json` to something the web page does not say → gate fails; (b) revert, remove a corroborating sentence from `apps/web/src/content.ts`, **rebuild**, re-run → gate fails; (c) revert and rebuild. Direction (b) is the one that matters: if it passes, T019 is reading `content.ts` on both sides and proving a constant equals itself. Record both messages here.
- [X] T057 [US4] Delete one platform's `dark/` screenshot directory and re-run; confirm L9 fails naming the platform and the missing appearance. Then copy a `light/` capture over a `dark/` one and confirm L9's byte-inequality check fails — that is the silently-failed-appearance-switch case, and presence alone would pass it. Restore both.

**Checkpoint**: every automated guarantee in this feature has been seen red for the right reason and green for the right reason. ✅ **Reached 2026-08-05.**

### Phase 6 results — 2026-08-05

Seven deliberate breaks, each run against `pnpm build && pnpm verify:listing` and each reverted
immediately afterwards. `git status --porcelain` was confirmed empty after every one. The baseline
these are read against is the standing Phase 4 gap — Android screenshots, T038 — which is present in
every run below and is not one of the breaks.

**The four failures, verbatim** (SC-043):

| Break | Group | Message |
| --- | --- | --- |
| T051 — 8 characters appended to `stores.ios.subtitle` | `fields` | `stores.ios.subtitle is 31 characters, limit 30` |
| T052 — `stores.android.shortDescription` set to `""` | `fields` | `stores.android.shortDescription is empty` |
| T053 — `feature-graphic-1024x500.png` deleted | `assets` | `listing/assets/feature-graphic-1024x500.png is missing — required by Google Play` |
| T054 — "It also supports Drop D." added to the iOS description | `vocabulary` | `stores.ios.description claims a capability 001 put out of scope — matches \bdrop\s*d\b` |

Each names the specific field or file. T052 says *empty* rather than *invalid*, which is the distinction
the task asks for: a listing reported as merely invalid sends a person looking through eight fields.

**T055 — the inverse, which matters as much as the four.** Appended to the iOS description:

> The analysis is asynchronous and there is no accounting of what you play.

`vocabulary: 41 strings clean` — unchanged, and the whole run was unchanged. `\baccounts?\b` does not
fire on *accounting* and `\bsync(?:ing|ed|hronis|hroniz)?\b` does not fire on *asynchronous*. A gate that
reported a violation here would be muted within a month, and a muted gate protects nothing.

**T056 — V32, and the step that decides whether L7 is real.**

*(a) A claim the web page does not make.* `claims.corroboration`'s "it costs nothing" was re-pointed at
the phrase `no paid tier`, which **both stores say and the web page does not**:

```
agreement: 7 claims × 2 stores
corroboration: 1 problem
  the built web page never says "it costs nothing", but the listing claims it — a shopper who finds
  one surface and then the other would be told two different things
```

`agreement` staying green is the useful half: the two groups are measuring different surfaces, and this
break isolates L7 from L6 rather than tripping both.

*(b) A corroborating sentence removed from `apps/web/src/content.ts`.* Run in two steps deliberately,
because the second step is the whole point:

| Step | `corroboration` |
| --- | --- |
| Sentence removed from `content.ts`, **not rebuilt** | `7 corroborated` — green |
| Same edit, after `pnpm build` | `the built web page never says "nothing is recorded, stored, or sent anywhere", but the listing claims it` |

**If the check were reading `content.ts` on both sides, the first row would have been red.** It is
green, and the failure appears only once the edit reaches `dist/index.html`, which is the proof that L7
compares the listing against what shipped rather than against the constant that produces it. `001`'s
seven-phase defect was exactly this shape of assertion, and this is the run that says it is not repeated
here. Reverted and rebuilt; `corroboration: 7 corroborated`.

**T057 — the two screenshot failure modes, which are not the same failure.**

*(a) `listing/assets/screenshots/ios/dark/` deleted:*

```
assets: 3 problems
  listing/assets/screenshots/ios/dark/ does not exist — App Store — a 6.9" iPhone set; the store
  derives the smaller sizes from it needs this set
appearances: 2 problems
  ios is missing a dark screenshot — Principle IV requires both appearances be represented
```

*(b) The silently-failed appearance switch — the light capture copied over the dark one*, so both files
exist, both are the right size, and both are the same image (`md5` identical):

```
assets: 2 problems     ← back to the Android gap alone: the presence and dimension checks PASSED
appearances: 2 problems
  ios's light and dark screenshots are byte-identical — the appearance switch did not take effect
  during capture, and a presence check alone would pass this
```

The `assets` line dropping back to two problems is the demonstration. Every presence check, every
dimension check, and every format check waved this through — a listing showing one appearance twice, in
a repository whose Principle IV requires both. Only the byte-inequality caught it, which is the reason
L9 states it as an inequality rather than as a count.

#### T050 — and the defect it found: **CI had never run**

Run on a throwaway branch and PR (`ci-gate-probe-004`, PR #1, closed and deleted afterwards) so no
deliberately broken commit lands in this feature's history. Three runs:

| # | Commit | Result |
| --- | --- | --- |
| 1 | the unbroken 004 branch | **every job failed inside `actions/setup-node@v4`**, before any gate ran |
| 2 | Node pin 20 → 22 | `gates` reaches and fails at exactly one step — `Listing (…)` — on the T038 Android gap. `mobile-tests` and `e2e` both **green** |
| 3 | a 31-character `stores.ios.subtitle` | the same step additionally reports the field and fails the job |

**Run 1 is the finding, and it is a bigger one than T050 went looking for.** `package.json` pins
`pnpm@11.18.0`, which requires **Node ≥ 22.13**, while all three jobs pinned `node-version: 20`. So
`actions/setup-node`'s own `cache: pnpm` step ran `pnpm store path` under Node 20 and died:

```
warn: This version of pnpm requires at least Node.js v22.13
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
```

Before checkout's install. Before lint. **No gate in this repository has been running in CI** — not
this feature's, not `003`'s, not `001`'s. This is precisely the class of defect T050 exists to catch:
`003`'s T052 found `pnpm build` listed as a gate since `001` and never wired into the workflow, and
this is the same failure one level further down — the workflow was wired and could not start.

Fixed on this branch: `node-version: 22` in all three jobs, and `engines.node` corrected from `>=20`
to `>=22.13`, which was a false claim about what this repository can be installed with. **22 rather
than 24 deliberately**, because research D1 justifies the listing gate being `.mjs` with JSON data by
CI predating TypeScript type stripping — Node 22 still does (it is behind
`--experimental-strip-types` until 23.6), so the recorded decision stays true. `CLAUDE.md` still says
"Node 20+" and T058 must correct it.

**Run 2, the baseline, is worth its own line.** With CI able to start, `mobile-tests` and `e2e` both
passed on Ubuntu on their first ever execution, and `gates` failed at one step only. The `identity`
group shells out to `expo config --type prebuild`, which had never been exercised anywhere but this
machine; it resolves the config on a Linux runner with no Xcode and no Android SDK exactly as it does
locally.

**Run 3 — the step's output, verbatim:**

```
fields: 1 problem
  stores.ios.subtitle is 31 characters, limit 30
…
[ELIFECYCLE] Command failed with exit code 1.
##[error]Process completed with exit code 1.
```

Runs 2 and 3 together are the point. The gates job is red either way while T038 stands, so a single
red run would only have shown that *something* is wrong; the difference between the two outputs is
what shows the gate measuring the listing rather than noticing the standing gap.

**One incidental finding.** The first attempt at run 3 failed at **Format check**, not at the Listing
step: the scripted JSON edit reformatted the file in a way Prettier rejects. The gate order means a
malformed break never reaches the check it was aimed at — worth knowing before writing off a future
"the gate did not catch it".

---

## Phase 7: Polish, Regression, and Manual Release Gates

**Purpose**: Prove nothing about the tuner changed, then the four outcomes no repository can assert.

- [X] T058 [P] Update `CLAUDE.md`'s Commands section with `pnpm verify:listing`, `pnpm listing:assets`, and `pnpm listing:screenshots`, noting which of them cannot run in CI and why (macOS/Xcode/emulator, D7). Note also that `app.json` is gone and `app.config.ts` derives identity from `listing/store-listing.json`. **Also correct "Node 20+" to Node 22.13+** — T050 found that pnpm 11.18 cannot run on Node 20 at all, and add `pnpm --filter @chromatic-tuner/mobile verify:release-bundle` as a release gate rather than a merge gate.
- [X] T059 [P] Add a header comment to `listing/store-listing.json`'s companion — since JSON carries no comments, put the orientation in `listing/submission.md`: what is authored here, what derives from it, and that `claims.identifier` is permanent from first publication.
- [X] T060 Run the full suite: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm --filter @chromatic-tuner/mobile test && pnpm build && pnpm test:e2e && pnpm verify:listing`. Record every count against T001's baseline (V37, FR-113).
- [X] T061 **The half of V37 that is the real assertion** — run `git diff --stat main...HEAD` and confirm the diff modifies no file under `packages/`, no file under `apps/mobile/src/components/`, and no test anywhere except `apps/web/e2e/metadata.spec.ts` (whose only change is where it reads its forbidden list from) plus the new test files this feature adds. A green suite after a behaviour change proves the suite missed it; the file list is what proves there was no behaviour change to miss (SC-044).
- [X] T062 Record the de-duplication result against T003's census — purpose sentence 2→1, palette 2→1, marketing version 2→1, identifier 2→1, forbidden vocabulary 1-heading-for-3→1 — against one new directory of data and three scripts. This is the plan's central claim; state whether it held.
- [ ] T063 **manual, release gate** (L3, SC-036): show the store name and short summary alone — no icon, no description — to reviewers using the same human-validation method as `001`–`003`'s UX gates. Pass when they state what the app does and that it is free. Record the responses verbatim here.
- [ ] T064 [P] **manual, release gate** (SC-040): show `listing/assets/icon-play-512.png` scaled to store-search size among unrelated app icons. Pass when a majority identify it as a tuner. Record the count here.
- [X] T065 [P] **manual, release gate** (L10, FR-102, SC-039): view every screenshot at store thumbnail size and confirm the note readout is legible and the tuner is showing a real reading. Record which, if any, needed recapture.
- [X] T066 [P] **manual, release gate**: re-read both stores' published metadata specifications, confirm no limit has tightened below a current field's length, and update `limits.json`'s `lastChecked` dates. A limit that silently tightened is a truncated store name nobody sees until it is live.
- [ ] T067 **manual, release gate** (D3): confirm the origin chosen for `VITE_SITE_URL` agrees with `pro.chromatictuner.app`, or record the accepted mismatch **in writing before submission** — it is permanent afterwards. **Also confirm the package name is free in the Play Console**: the identifier changed from `com.chromatictuner.app` on 2026-08-05 because Apple would not register that value — another account holds it — and only the Apple half of the replacement has been verified. A Play package name is permanent even after an app is deleted, so a collision found after publishing cannot be undone by unpublishing. D3 records the supersession.
- [ ] T068 **manual, release gate** (SC-041): submit both listings. Pass with zero rejections attributable to metadata, privacy declarations, missing assets, or claims not matching the app. Record any rejection and its cause here.
- [ ] T069 **manual, release gate** (SC-045): 30 days after publication, search each store for the app's own name and for its primary intent term. Pass when it is returned for its name and appears on the first page for the intent term. Record the results here.

### Phase 7 results — 2026-08-05

#### Merged to `main` with a red gate — a recorded, deliberate exception

**2026-08-05.** This feature was merged into `main` while `pnpm verify:listing` was **red**, and the
constitution's Development Workflow says plainly: *"Merge — Blocked while any gate is red. 'Fix it in a
follow-up' is not an accepted resolution for a constitution violation."*

Recorded here rather than left to be discovered, because a red gate on `main` that nobody wrote down is
indistinguishable from a broken build.

- **What is red**: three lines, one cause — `listing/assets/screenshots/android/{light,dark}/` do not
  exist (T038). Google Play will not publish a listing without them.
- **Why it was not fixed first**: this machine has no Android SDK — no `adb`, no `~/Library/Android`,
  `ANDROID_HOME` unset. It is a missing toolchain, not a missing decision.
- **What is green**: everything else. Lint, format, typecheck 5/5, 430 unit tests, coverage at T001's
  baseline, 78 mobile, `pnpm build`, `verify:build-output`, 112 e2e, `verify:release-bundle`.
- **The consequence**: CI's `gates` job is red on `main` and stays red until the Android screenshots are
  captured and committed. Every other step in that job passes.
- **The rejected alternative**: making the Android screenshot set optional in `limits.json` would turn
  the gate green over a listing that cannot be published. Phase 4 rejected exactly that, and the reason
  stands — it is the softening US4 exists to prevent.
- **To clear it**: install the Android SDK platform-tools, create a **1080×1920** AVD (the common
  1080×2400 default is 2.22:1 and Play rejects it), install a capture build, and run
  `pnpm listing:screenshots`. `listing/submission.md` carries the same instruction as open action 3.

The decision to merge anyway was the repository owner's, taken with the above in front of them.

#### The release gates: two done, five need a person or an account

| Task | Status | What it needs |
| --- | --- | --- |
| T063 — name + summary read in isolation (SC-036) | **open** | Other people. No panel can be simulated |
| T064 — icon identified as a tuner at search size (SC-040) | **open** | Other people. "A majority identify it" is the pass condition |
| T065 — screenshots legible at thumbnail size | **done** | One viewer's judgement — performed and recorded below |
| T066 — re-read both stores' published specifications | **done** | The live pages, re-read below |
| T067 — the identifier against the deployed origin (D3) | **open** | A decision about where the site is deployed |
| T068 — submit both listings (SC-041) | **open** | Developer accounts on both stores |
| T069 — store search ranking 30 days after publication (SC-045) | **open** | Publication, and 30 days |

T063 and T064 are the two the spec always called human validation, and they stay that way: their pass
conditions are about what *other* people say, and one reader agreeing with their own work is not the
measurement. T065 is different — it asks a single viewer whether text is legible at a given size, which
is a judgement that can be made and shown.

#### T065 — every screenshot at store thumbnail size

Rendered through Chromium at 120 px (roughly a search-result thumbnail) and 200 px (a product-page
card), both appearances:

| Size | Note name `A₄` | `+6 cents` | `A4 440 Hz` badge | `↓ LOOSEN` | The line and marker |
| --- | --- | --- | --- | --- | --- |
| 200 px | clear | clear | clear | clear | clear, marker visibly off centre |
| 120 px | **clear and dominant** | legible | small but readable | at the edge of legibility | reads as a scale with an off-centre indicator |

**Pass. Nothing needed recapture.** The note name is the readout FR-102 is about and it survives the
worst case comfortably; the direction cue is the first thing to go, which is the right ordering, since
it is the one channel that is also carried by the marker's position and by colour. Both captures show a
real reading — `A4`, `+6 cents`, marker off centre, `LOOSEN` — rather than an empty state or the
permission prompt (FR-100).

**One observation that is not a failure**: there is exactly **one** screenshot per appearance. Apple
accepts up to 10 for the slot and Play 8, and a listing with a single image is thin next to
competitors'. Adding more is a capture-script run, not a code change — `SHOTS` in
`capture-screenshots.mjs` is a list with one entry.

#### T066 — both specifications re-read, and three things were wrong

Re-read on 2026-08-05 from the published pages, and `lastChecked` set. **No limit has tightened below a
current field's length** — every number recorded at T005 is still correct:

| Field | Recorded | Specification says | Current value |
| --- | --- | --- | --- |
| iOS `name` | 30 | "no more than 30 characters" | 23 |
| iOS `subtitle` | 30 | "can't be longer than 30 characters" | 23 |
| iOS `promotionalText` | 170 | "can't be longer than 170 characters" | 166 |
| iOS `description` | 4000 | "Limited to 4000 characters" | 1,634 |
| iOS `keywords` | 100 | "up to 100 **bytes** of content" | 78 |
| Android `title` | 30 | "30 characters or less" | 22 |
| Android `shortDescription` | 80 | "80 characters or less" | 69 |
| Android `fullDescription` | 4000 | "4,000 characters" | 1,512 |
| Play feature graphic | 1024×500, no alpha | "1024px by 500px", "JPEG or 24-bit PNG (no alpha)" | matches |
| Play icon | 512×512, ≤1 MB | "512px by 512px", "32-bit PNG (with alpha)", "Maximum file size: 1024KB" | matches |
| Play screenshots | 320–3840 per side, longest ≤ 2× shortest | "Minimum dimension: 320px", "Maximum dimension: 3840px", "can't be more than twice as long as the minimum dimension" | matches |

**1. One of the two recorded documentation URLs was dead.** The Play entry pointed at a *topic* id
(`…/android-developer/topic/9866151`) which returns **404**. The pages that actually state the limits
are two answer ids, now both recorded. A limits file whose provenance link 404s is a limits file nobody
can re-check, which is the whole point of recording the link.

**2. Apple counts the keyword field in BYTES, and the gate counted code points.** The specification says
"you can provide up to 100 **bytes** of content" — every other field is characters. For the current
ASCII keywords the two agree exactly (78 and 78), which is why nothing was ever wrong and why nothing
ever would have been noticed. They diverge the moment anyone writes an accented word, and they diverge
in the dangerous direction: more bytes than code points, so the gate would have passed a field the store
truncates.

`limits.json` now allows a limit to be `{ max, unit }`, and L1 honours it. Observed failing on a case
the previous rule waved through:

```
fields: 1 problem
  stores.ios.keywords is 102 bytes, limit 100
```

That value is **95 code points** — comfortably inside a 100-*character* limit, and the old check
reported `fields: 8 ok` for it. This is the same failure mode L1 already guarded against by counting
code points rather than UTF-16 units; the guard was simply one level short of where the store actually
counts.

**3. Apple's screenshot cap is per display size, not per appearance.** `countPerAppearance.max` was 10,
and light and dark are one display size to Apple — so the encoding permitted **20** files for a slot
that accepts 10. Two are committed, so nothing was ever wrong in practice: it was a limit encoded
against the wrong axis, the kind that is only wrong on the day someone needs it.
`maxTotalAcrossAppearances` added for both stores (10 and 8) and observed failing:

```
assets: 1 problem
  ios has 12 screenshots across all appearances, and App Store … accepts 10 for the slot —
  the store's cap is on the whole set, not on each appearance of it
```

**All three are the shape this feature keeps finding**: a value that is correct today, unchecked, and
wrong on the first day it matters. `lastChecked` being `null` until now was the honest state — T005
declined to write a date beside numbers nobody had verified, and re-reading them found two encoding
errors that a rubber-stamped date would have hidden.

#### T060 — the full suite against T001's baseline (SC-044)

| Gate | T001 baseline | Now | Δ |
| --- | --- | --- | --- |
| `pnpm lint` | clean | clean | — |
| `pnpm format:check` | clean | clean | — |
| `pnpm typecheck` | 5/5 projects | 5/5 projects | — |
| `pnpm test` | **430 passed**, 18 files, 7.95 s | **430 passed**, 18 files, 7.95 s | **none** |
| `pnpm test:coverage` | 100% lines, 98.5% stmts, 94.81% branches, 97.29% funcs | **identical, to the decimal** | **none** |
| `pnpm --filter …/mobile test` | 64 passed, 9 suites | **78 passed, 11 suites** | +14, +2 — this feature's own |
| `pnpm build` → `dist/index.html` | **7,454 B** | **7,454 B** | **none** |
| `pnpm build` → `assets/index-*.js` | 235.52 kB, hash `Dz1jTnFE` | 235.52 kB, hash **`Dz1jTnFE`** | **none — same hash** |
| `pnpm build` → `sw.js` | 3,069 B | 3,624 B | +555, the privacy page and the navigation fix |
| `dist/` file count | 9 | **10** | `privacy.html` |
| `pnpm test:e2e` | 107 passed, 39.8 s | **112 passed**, 40.1 s | +5, this feature's own |
| `verify:build-output` | OK | OK | — |
| `pnpm verify:listing` | did not exist | green but for T038 | — |
| `verify:release-bundle` | did not exist | OK | — |

**The unit numbers are not merely equal, they are the same numbers.** 430 tests, the same coverage to
two decimal places, and — the strongest single line here — `assets/index-Dz1jTnFE.js` carries the
**same content hash** as it did at T001. Vite derives that hash from the bundle's bytes, so an identical
hash is proof the tuner's entire JavaScript is byte-for-byte what it was before this feature started.
Phase 1 predicted `dist/` would go from nine files to ten; it did, and nothing else moved.

#### T061 — the file list, which is what proves there was no behaviour change to miss

`git diff --stat main...HEAD`: 47 files, +6,096 / −91.

| Assertion | Result |
| --- | --- |
| No file under `packages/` | **none** — passes |
| No file under `apps/mobile/src/components/` | **none** — passes |
| No test modified except `apps/web/e2e/metadata.spec.ts` | passes — one `M`, three `A` |

The three added test files are this feature's own: `apps/mobile/__tests__/app-config.test.ts` (T011),
`apps/mobile/__tests__/capture-audio-source.contract.test.ts` (T034), `apps/web/e2e/privacy.spec.ts`
(T044). `metadata.spec.ts` is modified **twice**, not once — the forbidden list moved to a shared file
(T007), and the sitemap assertion became a set when the site gained a second page (T043). Both are
recorded in Phase 5's deviations; V37's parenthetical said one change and should say two.

**Two modifications outside the plan's expectation, both deliberate and neither a behaviour change:**

- `specs/003-seo-discoverability/spec.md` (+13/−4), from `ac57fb8` during this feature's spec phase.
  `003` listed app-store listing optimisation and "any second content page" as out of scope; both are
  now `004`'s, so the entries say so rather than silently contradicting the repository.
- `.github/workflows/ci.yml` and `package.json`'s `engines`, from T050 — the Node 20 → 22.13 fix. Not
  in any task's text, because nobody knew CI was not running.

A green suite after a behaviour change proves the suite missed it. This list is what proves there was
no behaviour change: nothing under `packages/`, nothing under either app's components, and every
modified test file accounted for by name.

#### T062 — the de-duplication result, measured against T003's census

The plan's central claim was that this feature is **net de-duplication**. Measured with `git grep` over
tracked files, excluding `specs/` (prose *about* a value is not a copy of it):

| Fact | T003 | Now | Where it lives |
| --- | --- | --- | --- |
| Microphone purpose sentence | **2**, byte-identical | **1** | `listing/store-listing.json` |
| Marketing version | **2**, disagreeing (`0.1.0` / `0.0.0`) | **1** | `apps/mobile/package.json` |
| Application identifier | **2**, disagreeing | **1** | `listing/store-listing.json` |
| Forbidden vocabulary | **1**, heading for 3 | **1**, with 3 consumers | `listing/out-of-scope-claims.json` |
| Dark palette | **2 authors** | **1 author** | `packages/tokens` |

`apps/mobile/app.json` is gone — 0 tracked files — and with it both copies of the purpose sentence and
both disagreeing identifiers. The vocabulary list is now read by `metadata.spec.ts` and by
`verify-listing.mjs`, which applies it to both listings and the privacy page: one author, four surfaces.

**The palette row needs stating precisely, because the naive count moved the wrong way.** The committed
SVGs hold **7 colour literals each, 6 distinct — up from 5** at T002. That is not regression: the
generated mark has more parts than the hand-drawn one did (tick marks, and `--ct-no-reading` which the
old artwork never used). What changed is the number of *authors*, from two to one. Every literal is now
emitted by `generate-icons.mjs` from the built token block, every file carries the generator's
provenance marker, and the `artwork` check fails if a literal is not a current `--ct-*` value or if the
marker is missing. Before, five correct values sat in a file nothing checked; that is the D5 defect,
and correctness on the day of typing is exactly what made it invisible.

**The cost side, stated honestly.** One new directory (`listing/`: 4 data/doc files, 3 scripts, 6
committed binary artefacts) and one script outside it — `apps/mobile/scripts/verify-release-bundle.mjs`,
which the plan did not anticipate because it did not know a static import would put the capture source
in the release bundle. So **four** new scripts, not the three the plan costed.

**The claim held.** Five facts with nine occurrences between them became five facts with five, the two
disagreements are gone, and what replaced them is data with a gate over it rather than more prose.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies.
- **Phase 2 (Foundational)**: depends on Phase 1 — **blocks every user story**. Nothing in Phases 3–6 can be written before `limits.json`, `out-of-scope-claims.json`, `claims`, and the gate harness exist.
- **Phase 3 (US1)**: depends on Phase 2 only. This is the MVP.
- **Phase 4 (US2)**: depends on Phase 2. Independent of US1's copy — assets and text touch different keys and different files. T036 edits `app.config.ts`, which T012 creates.
- **Phase 5 (US3)**: depends on Phase 2. T040 depends on T012; T047 depends on T035 (there is no capture flag to assert absent until one exists).
- **Phase 6 (US4)**: depends on whichever gates exist. T051–T052 and T056 need US1; T053 and T057 need US2; the phase is only complete once all three are done.
- **Phase 7**: T060–T062 depend on everything. T063–T069 are release gates, run before submission, not before merge — T068 and T069 additionally depend on developer accounts on both stores, which the spec records as an external dependency.

### Cross-story dependencies (the only three)

| Task | Needs | Why |
| --- | --- | --- |
| T036 (US2) | T012 (Foundational) | `supportsTablet` lives in `app.config.ts` |
| T040 (US3) | T012 (Foundational) | asserts the resolved config's derived values |
| T047 (US3) | T035 (US2) | asserts the capture flag's absence from release output |

Everything else within a story is self-contained, which is what makes US1 shippable alone.

### Prerequisites that are easy to forget

- **`pnpm build` before `pnpm verify:listing`** — L7 reads `apps/web/dist/index.html`, and after Phase 5 also `dist/privacy.html`. The CI step is placed after `Build` for this reason (T010).
- **`pnpm build` before `pnpm listing:assets`** — the generator lifts the token `<style>` block from the built document (D6).
- **macOS, Xcode, and an Android emulator before `pnpm listing:screenshots`** — this cannot run on CI's Ubuntu runners, which is why the assets are committed and CI verifies the committed files (D7, FR-111).

### Parallel opportunities

- **Phase 1**: T002, T003 in parallel (T004 touches `eslint.config.js`).
- **Phase 2**: T005, T006, T011 in parallel — three different new files. T007 follows T006; T012 follows T011; T013 follows T012.
- **Phase 3**: T015, T016, T017 in parallel once T014 has established the harness's check-registration shape. T018 and T019 are the two that need care and should not be rushed alongside them.
- **Phase 4**: T027 and T028 in parallel with each other; T029–T033 (icons) and T034–T038 (screenshots) are two independent tracks that meet at T039.
- **Phase 5**: T041 in parallel with T040.
- **Phase 7**: T058, T059 in parallel; T064, T065, T066 in parallel once assets exist.

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# After T014 has established how a check registers with the harness,
# these three are independent additions to verify-listing.mjs's registry:
Task: "T015 Implement L2 — the name leads with what the tool does"
Task: "T016 Implement L4 — the description's opening stands alone"
Task: "T017 Implement L5 — no field claims a capability that is out of scope"

# Then the two that compare across surfaces, deliberately not parallel:
Task: "T018 Implement L6 — the two stores make the same claims"
Task: "T019 Implement L7 — the listings agree with the built web page"
```

---

## Implementation Strategy

### MVP: User Story 1 only (Phases 1–3, T001–T024)

A listing with words and no art is findable; a listing with art and no words is not. Stopping after
Phase 3 leaves the repository with the copy for both stores, the limits recorded in one place, the
forbidden vocabulary shared with the web suite, one identifier, one version, one purpose sentence, and a
CI gate proving all of it fits. That is a coherent increment even if nothing is ever submitted.

### Incremental delivery

1. **Phases 1–2** → the spine: shared data, the gate harness, `app.json` retired.
2. **Phase 3 (US1)** → the listing has words. **STOP and VALIDATE** with V30 and the T024 read-through.
3. **Phase 4 (US2)** → the listing has an icon and screenshots, and the web app stops carrying a second copy of the palette.
4. **Phase 5 (US3)** → the listing is submittable: privacy page, declaration, submission checklist.
5. **Phase 6 (US4)** → every gate observed failing for the right reason.
6. **Phase 7** → regression proof, then the release gates.

### What must not happen

- **No tuner behaviour changes.** FR-113 and SC-044 make this a verified claim, and T061 is the verification. If a task here seems to need a change under `packages/` or `apps/mobile/src/components/`, the task is wrong.
- **No claim the app cannot support.** `001`'s out-of-scope list is not negotiable by copy. The listing describes what exists; it never justifies building something so the listing can claim it.
- **No gate trusted unseen.** T051–T057 exist because this repository has already shipped an assertion satisfied by the wrong thing, twice.

---

## Notes

- `[P]` tasks touch different files and have no dependency on an incomplete task.
- `[USn]` maps a task to its user story; Setup, Foundational, and Polish tasks carry no story label.
- Contract guarantees are cited as **L1–L12** from [contracts/store-listing.md](./contracts/store-listing.md); validation scenarios as **V30–V38** from [quickstart.md](./quickstart.md).
- Record deviations, defects, and measurements in this file as work lands — it is the build log for `004`, as `tasks.md` was for `001`, `002`, and `003`.
