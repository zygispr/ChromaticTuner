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

- [ ] T014 [US1] Implement L1 in `listing/scripts/verify-listing.mjs` — every field in `stores.ios` and `stores.android` is non-empty after trimming and at most its limit from `limits.json`, **counted in Unicode code points** (`[...str].length`), not UTF-16 units and not bytes; the three disagree about an emoji in a 30-character store name. Failure message names the field, its actual count, and the limit: `stores.ios.subtitle is 34 characters, limit 30`. Expected first-run failure: `stores.ios is missing` (FR-109).
- [ ] T015 [P] [US1] Implement L2 — `stores.ios.name` and `stores.android.title` each contain `tuner` and at least one of `guitar`/`chromatic`, and neither equals `claims.appName` alone. The check is deliberately weak: it cannot judge copy, only catch a regression to a bare codename, which is the failure it exists for (FR-089).
- [ ] T016 [P] [US1] Implement L4 — the first `limits.ios.descriptionOpening` characters of `stores.ios.description` and the first `limits.android.descriptionOpening` of `stores.android.fullDescription` each mention the instrument, the microphone, and that the app is free (FR-091). Failure names which of the three is missing from which opening.
- [ ] T017 [P] [US1] Implement L5 over `store-listing.json` — every string value at every depth, compiled from `out-of-scope-claims.json` with `new RegExp(src, 'i')`. Failure names **both** the matched term and the field path it appeared in (`stores.ios.description matches \btuning presets?\b`); a gate that names only the term makes a 4000-character field a search problem (FR-093, FR-110).
- [ ] T018 [US1] Implement L6 — claim coverage, not string equality: every claim in `claims` appears in some phrasing in both stores' copy, and neither store asserts something absent from `claims`. Byte comparison would either fail always or force copy that wastes one store's fields (spec edge case 1). Record here how "appears in some phrasing" is decided, because that decision is the check (FR-095, FR-112).
- [ ] T019 [US1] Implement L7 — every claim in `claims` is corroborated by the **rendered text of `apps/web/dist/index.html`**: strip tags and `<script>`/`<style>` contents from the built document, then match. **Not `apps/web/src/content.ts`.** Comparing the listing against the constant that produces the web page proves two constants are equal and proves nothing about what shipped. Fail with a clear message when `dist/index.html` is absent, naming `pnpm build` as the fix (FR-094, FR-112, L7).

### Implementation for User Story 1

- [ ] T020 [US1] Author `stores.ios` in `listing/store-listing.json` — `name` (≤30, leads with the intent terms), `subtitle` (≤30, extends the name rather than repeating its words), `promotionalText` (≤170), `description` (≤4000, opening carries purpose, cost, and microphone before the fold), `keywords` (≤100, comma-separated **with no space after each comma** — the separator costs a character, and words already in `name`/`subtitle` are indexed and must not be repeated here) (FR-089–FR-092).
- [ ] T021 [US1] Author `stores.android` — `title` (≤30), `shortDescription` (≤80), `fullDescription` (≤4000, carrying the discovery terms in prose because Play has no keyword field). Same substance as iOS, phrased for Play's field structure; a substantive difference is a defect T018 must catch (FR-090–FR-092, FR-095).
- [ ] T022 [US1] Add `primaryCategory`, `secondaryCategory`, and `ageRating` to `stores.ios`, and `category` and `contentRating` to `stores.android`, each derived from the app's actual content and **recorded, not computed** — the questionnaires are answered in a console and their outcome is what lives here (FR-096).
- [ ] T023 [US1] Run `pnpm build && pnpm verify:listing` and record the printed counts here. Every check from T014–T019 green (V30).
- [ ] T024 [US1] Re-read the finished copy against `001`'s out-of-scope list by eye, including inside negations — "no presets needed" names a preset and FR-093 forbids it including inside a negation. Record the pass here; T017 catches the vocabulary, not the intent behind a sentence that dodges it.

**Checkpoint**: the listing has words. A store could be filled in from `store-listing.json` today, and the gate proves the fields fit.

---

## Phase 4: User Story 2 - The listing looks like a tuner at a glance (Priority: P2)

**Goal**: A first-party icon generated from the app's own tokens, screenshots captured from the real
running app showing a real reading, in both appearances, at sizes the stores accept.

**Independent Test**: View the icon at store-search size among unrelated icons and confirm it reads as a
tuner; run `pnpm listing:assets` and `pnpm listing:screenshots` from a clean checkout and confirm
`git status --porcelain listing/assets apps/web/public` reports nothing.

### Checks for User Story 2 ⚠️ Write these first and observe them failing

- [ ] T025 [US2] Add the `assets` section to `listing/limits.json` per data-model.md §4 — for each artefact its pixel dimensions, format, and whether an alpha channel is required, forbidden, or ignored; for Android screenshots the range form (320–3840 per side, **longest side ≤ 2× shortest**). The Android aspect rule is data here rather than folklore in the capture script because a default phone emulator profile boots at 1080×2400 (2.22:1) and Play rejects it.
- [ ] T026 [US2] Implement L8 in `verify-listing.mjs` — for every entry in `limits.assets`: the file exists, and its dimensions, colour type, and alpha are read **from the PNG header directly** (bytes 16–24 of the IHDR give width and height; byte 25 is the colour type — 2 is RGB, 6 is RGBA), no image dependency (Principle II). Failure names the file, what was expected, and what was found, plus which store requires it. Expected first-run failure: every asset missing (FR-111).
- [ ] T027 [P] [US2] Implement L9 — for each platform at least one screenshot under `light/` and one under `dark/`, and the two are **not byte-identical**. The inequality is the point: a capture script whose appearance switch silently failed produces two directories of the same image, which passes a presence check and fails Principle IV (FR-101).
- [ ] T028 [P] [US2] Implement L11 — no `#rrggbb`, `rgb(`, or `hsl(` literal appears in `listing/scripts/*.mjs` or in `apps/web/public/*.svg`. Expected first-run failure: the five literals in `apps/web/public/icon.svg` recorded at T002. This check is what closes the gap D5 found — the `apps/**` hex rule is an ESLint rule and does not reach SVG in `public/` (FR-098).

### Implementation for User Story 2

- [ ] T029 [US2] Write `listing/scripts/generate-icons.mjs` (D6) — read `apps/web/dist/index.html`, lift the `<style data-chromatic-tuner="tokens">` block, render an HTML template whose every colour is a `var(--ct-*)` reference, and screenshot it with the `@playwright/test` Chromium already installed. Follow `apps/web/scripts/generate-og-image.mjs` deliberately, including its failure path when `dist/index.html` is absent or has changed shape. No new dependency.
- [ ] T030 [US2] Design the mark itself inside that template — it must read as a tuner at 48 px among unrelated icons (SC-040), not as an unlabelled shape or a wordmark, and compose all meaning inside the **centre 66% safe zone** so an adaptive-icon mask cannot cut it. Record the reasoning here; this is the one task in the feature whose output a gate cannot judge.
- [ ] T031 [US2] Emit `listing/assets/icon-play-512.png` (512×512, 32-bit PNG, ≤1 MB), `icon-adaptive-foreground.png` (1024×1024, alpha, safe-zone composed), and `feature-graphic-1024x500.png` (1024×500, **no alpha** — Play will not publish without this asset and it is the one most easily forgotten because no other store has an equivalent).
- [ ] T032 [US2] Emit `listing/assets/icon-ios-1024.png` with **no alpha channel and no pre-applied corner rounding** — Apple rejects both. Chromium's PNG encoder writes colour type 6 (RGBA) even for a fully opaque screenshot, so the raster must be re-encoded to colour type 2. Do it with `node:zlib` (`inflateSync` the IDAT, drop the alpha byte per pixel, re-filter, `deflateSync`, recompute the CRC32) rather than adding an image dependency; if that proves unworkable, record the reason here and raise it rather than shipping an alpha channel Apple will reject. T026 is what makes the failure loud.
- [ ] T033 [US2] Regenerate `apps/web/public/icon.svg` and `apps/web/public/icon-maskable.svg` from the same generator as `var(--ct-*)`-free resolved output, replacing the hand-transcribed literals (D5). Confirm the web app's icon and manifest still render, and that T028 now passes.
- [ ] T034 [US2] Write `apps/mobile/src/adapters/captureAudioSource.ts` — an `AudioSource` emitting a generated tone, mirroring the reference-signal approach `apps/web/e2e/fixtures/generate.mjs` already uses. Add a contract test at `apps/mobile/__tests__/capture-audio-source.contract.test.ts` running `packages/core/testing/port-contract-tests.ts` against it, exactly as `rn-audio-source.contract.test.ts` does — a port implementation that skips the contract suite is the thing that suite exists to prevent.
- [ ] T035 [US2] Select the capture source in `apps/mobile/src/App.tsx` behind one `EXPO_PUBLIC_*` boolean, read at one call site (the plan's single Complexity Tracking entry). Comment it with why it exists and that T047 asserts its absence from release output; a flag whose justification lives only in a spec file gets copied.
- [ ] T036 [US2] Set `ios.supportsTablet: false` in `apps/mobile/app.config.ts` (D4, FR-099) and record the consequence here — iPad users get the phone app letterboxed, which is what a tablet-declared app with no tablet layout gives them anyway, minus the review risk and minus a screenshot axis. Reversible; D3's identifier is not.
- [ ] T037 [US2] Write `listing/scripts/capture-screenshots.mjs` (D7) — boot a simulator and an emulator, set appearance with `xcrun simctl ui booted appearance {light,dark}` and `adb shell cmd uimode night {no,yes}`, launch the capture build, capture with `xcrun simctl io booted screenshot` and `adb exec-out screencap -p`, and verify each captured file against `limits.assets` before writing it. Pin the Android profile to **1080×1920** (1.78:1); the common 1080×2400 default is 2.22:1 and is rejected. Add `listing:assets` and `listing:screenshots` scripts to the root `package.json`. Document that this cannot run on CI's Ubuntu runners.
- [ ] T038 [US2] Capture and commit the screenshot set under `listing/assets/screenshots/{ios,android}/{light,dark}/`, each showing the tuner displaying a note — not an empty state and not the permission prompt. Then run `pnpm listing:screenshots` again and confirm `git status --porcelain listing/assets/screenshots` is empty (V33, SC-039). Compare one light against one dark capture: byte-identical means the appearance switch silently failed.
- [ ] T039 [US2] Run `pnpm build && pnpm listing:assets && pnpm verify:listing`; confirm T026–T028 green and `git diff --stat apps/web/public listing/assets` is empty on a second run (V34). Record the asset counts here.

**Checkpoint**: the listing has an icon and screenshots, both regenerable from a clean checkout, and the web app no longer carries a second hand-hexed copy of the dark palette.

---

## Phase 5: User Story 3 - The listing passes review the first time (Priority: P3)

**Goal**: Every artefact both stores require of a microphone app exists, is reachable, and states
something true of the built app — and the boundary where version control ends is written down rather
than assumed away.

**Independent Test**: Walk each store's submission requirements for an app requesting microphone access
and confirm every required artefact exists in the repository, is reachable, and matches the app.

### Checks for User Story 3 ⚠️ Write these first and observe them failing

- [ ] T040 [US3] Implement L12.1 and L12.2 in `verify-listing.mjs` — shell out to `pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild`, parse the resolved config, and assert both iOS purpose strings and the Android permission rationale equal `claims.purposeSentence` verbatim, and that `ios.bundleIdentifier` and `android.package` both equal `claims.identifier`. Reading the **resolved config** rather than the source is the point: `.mjs` cannot import `app.config.ts` (D1), and the resolved output is what actually reaches `Info.plist` and `AndroidManifest.xml`. Because T012 already made this true, **observe it failing by temporarily altering one purpose string in `app.config.ts`**, then revert — a check never seen red is not known to work.
- [ ] T041 [P] [US3] Extend L5 to the privacy page — scan the rendered text of `apps/web/dist/privacy.html` with the same compiled patterns. Expected first-run failure: the file does not exist, and the message must say so rather than silently scanning nothing. A check that passes over an absent file is the quietest way to lose this gate.

### Implementation for User Story 3

- [ ] T042 [US3] Create `apps/web/privacy.html` (D9) — the policy prose **in the served document**, no React, no runtime injection: a store reviewer must not have to run a script to read a privacy policy. It states in plain language what the app does with audio, reproduces `claims.purposeSentence`'s terms, and agrees with the in-app privacy statement (FR-031, FR-104, FR-105).
- [ ] T043 [US3] Register the page in `apps/web/vite.config.ts` in **all three** places, each of which ships quietly when missed: `build.rollupOptions.input` (or the page is not built), `sitemapXml()` (or the policy is unlisted — `003`'s FR-073 named this as the registration point), and the precache array at `vite.config.ts:528` (or the policy is the one page that breaks offline and FR-030's guarantee gets a hole in it). `siteIdentity()`'s `transformIndexHtml()` has no filter, so the token `<style>` block and canonical handling come free.
- [ ] T044 [US3] Add `apps/web/e2e/privacy.spec.ts` — the policy text is present in the response **with scripting disabled** (following `no-script.spec.ts`'s method), the page has exactly one `<h1>`, its canonical tag resolves, and it passes the same axe check `a11y.spec.ts` applies to the tuner. Write it before T042 is finished if possible; if T042 landed first, observe it failing by emptying the page body, then revert.
- [ ] T045 [US3] Add the `privacy` object to `listing/store-listing.json` per data-model.md §5 — `policyUrl` **derived from the canonical origin** (`003` FR-075) rather than written literally, `dataCollected` empty, `permissions` microphone-only with `claims.purposeSentence` as the stated reason. Record here that FR-103's correctness rests on `apps/web/e2e/no-network.spec.ts` staying green: if analytics, crash reporting, or an update ping is ever added, that gate goes red and this declaration becomes false in the same commit (SC-042).
- [ ] T046 [US3] Run `pnpm build && pnpm verify:listing && grep -c privacy apps/web/dist/sitemap.xml && grep -c privacy apps/web/dist/sw.js`, then `pnpm --filter @chromatic-tuner/web preview --port 4173 &` and `pnpm --filter @chromatic-tuner/web verify:offline` (V36). Record both grep counts and the offline result here; the two greps exist because the sitemap function and the precache array are separate hand-edits.
- [ ] T047 [US3] Implement L12.3 — a build-output assertion, following `apps/web/scripts/verify-build-output.mjs`'s precedent, that a release-configuration bundle contains no capture-mode flag and no reference to `captureAudioSource`. `EXPO_PUBLIC_*` values are inlined at build time, so "it is only set locally" describes a shell, not an artefact. Observe it failing by building with the flag set, then rebuild without (V35, FR-113).
- [ ] T048 [US3] Write `listing/submission.md` (FR-108) — one row per store console field naming the repository artefact that fills it, plus a section for every field **no artefact can fill**: the age-rating and IARC questionnaires, account-level settings, and the re-check of `limits.json` against current store documentation. Include D10's rule that `BUILD_NUMBER` increments on every submission including a resubmission of an unchanged version (FR-107), and D3's caveat that `com.chromatictuner.app` must be confirmed against whatever origin `VITE_SITE_URL` eventually takes, **before first submission**, because it is permanent afterwards.
- [ ] T049 [US3] Capture light and dark screenshots of the privacy page for the pull request (the plan's obligation 4 — Development Workflow requires both appearances for any UI change) and attach them. The privacy page is subject to the same contrast, text-size, and appearance obligations as everything else (Principle IV).

**Checkpoint**: a submission could be prepared end to end from the repository, with the manual steps named rather than discovered at the console.

---

## Phase 6: User Story 4 - The listing does not silently rot (Priority: P4)

**Goal**: Every gate written in Phases 3–5 is observed failing on a real break and observed staying
green on innocent prose, and the rest of the project is proven unchanged.

**Independent Test**: Overrun a length limit, delete a required asset, and introduce a forbidden claim;
confirm the gates fail and each failure names the specific field or file at fault.

- [ ] T050 [US4] Confirm `pnpm verify:listing` runs in CI on a pull request and fails the `gates` job when the listing is broken — push a deliberate break and confirm the job goes red, then revert. T010 wired the step; this proves the wiring, and `003`'s T052 found `pnpm build` had been listed as a gate since `001` without ever being in the workflow.
- [ ] T051 [US4] **Break 1 (SC-043)**: append 8 characters to `stores.ios.subtitle`, run the gate, and record the failure message **verbatim** here. It must name `stores.ios.subtitle`, its actual count, and the limit 30. Revert.
- [ ] T052 [US4] **Break 2**: set `stores.android.shortDescription` to `""`, run, record verbatim. It must name the field as empty, not merely report the listing invalid. Revert.
- [ ] T053 [US4] **Break 3**: delete `listing/assets/feature-graphic-1024x500.png`, run, record verbatim. It must name the missing file and which store requires it. Restore.
- [ ] T054 [US4] **Break 4**: add "supports Drop D" to `stores.ios.description`, run, record verbatim. It must name the matched term **and** the field it appeared in. Revert.
- [ ] T055 [US4] **The inverse, which matters as much as the four**: add a sentence containing `asynchronous` and `accounting` to a description, run, and confirm the gate stays **green** — L5's word boundaries are the half most likely to be written as substrings, and a gate that fires on innocent prose gets muted. Revert.
- [ ] T056 [US4] **V32, both directions**: (a) edit a claim in `store-listing.json` to something the web page does not say → gate fails; (b) revert, remove a corroborating sentence from `apps/web/src/content.ts`, **rebuild**, re-run → gate fails; (c) revert and rebuild. Direction (b) is the one that matters: if it passes, T019 is reading `content.ts` on both sides and proving a constant equals itself. Record both messages here.
- [ ] T057 [US4] Delete one platform's `dark/` screenshot directory and re-run; confirm L9 fails naming the platform and the missing appearance. Then copy a `light/` capture over a `dark/` one and confirm L9's byte-inequality check fails — that is the silently-failed-appearance-switch case, and presence alone would pass it. Restore both.

**Checkpoint**: every automated guarantee in this feature has been seen red for the right reason and green for the right reason.

---

## Phase 7: Polish, Regression, and Manual Release Gates

**Purpose**: Prove nothing about the tuner changed, then the four outcomes no repository can assert.

- [ ] T058 [P] Update `CLAUDE.md`'s Commands section with `pnpm verify:listing`, `pnpm listing:assets`, and `pnpm listing:screenshots`, noting which of them cannot run in CI and why (macOS/Xcode/emulator, D7). Note also that `app.json` is gone and `app.config.ts` derives identity from `listing/store-listing.json`.
- [ ] T059 [P] Add a header comment to `listing/store-listing.json`'s companion — since JSON carries no comments, put the orientation in `listing/submission.md`: what is authored here, what derives from it, and that `claims.identifier` is permanent from first publication.
- [ ] T060 Run the full suite: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm --filter @chromatic-tuner/mobile test && pnpm build && pnpm test:e2e && pnpm verify:listing`. Record every count against T001's baseline (V37, FR-113).
- [ ] T061 **The half of V37 that is the real assertion** — run `git diff --stat main...HEAD` and confirm the diff modifies no file under `packages/`, no file under `apps/mobile/src/components/`, and no test anywhere except `apps/web/e2e/metadata.spec.ts` (whose only change is where it reads its forbidden list from) plus the new test files this feature adds. A green suite after a behaviour change proves the suite missed it; the file list is what proves there was no behaviour change to miss (SC-044).
- [ ] T062 Record the de-duplication result against T003's census — purpose sentence 2→1, palette 2→1, marketing version 2→1, identifier 2→1, forbidden vocabulary 1-heading-for-3→1 — against one new directory of data and three scripts. This is the plan's central claim; state whether it held.
- [ ] T063 **manual, release gate** (L3, SC-036): show the store name and short summary alone — no icon, no description — to reviewers using the same human-validation method as `001`–`003`'s UX gates. Pass when they state what the app does and that it is free. Record the responses verbatim here.
- [ ] T064 [P] **manual, release gate** (SC-040): show `listing/assets/icon-play-512.png` scaled to store-search size among unrelated app icons. Pass when a majority identify it as a tuner. Record the count here.
- [ ] T065 [P] **manual, release gate** (L10, FR-102, SC-039): view every screenshot at store thumbnail size and confirm the note readout is legible and the tuner is showing a real reading. Record which, if any, needed recapture.
- [ ] T066 [P] **manual, release gate**: re-read both stores' published metadata specifications, confirm no limit has tightened below a current field's length, and update `limits.json`'s `lastChecked` dates. A limit that silently tightened is a truncated store name nobody sees until it is live.
- [ ] T067 **manual, release gate** (D3): confirm the origin chosen for `VITE_SITE_URL` agrees with `com.chromatictuner.app`, or record the accepted mismatch **in writing before submission** — it is permanent afterwards.
- [ ] T068 **manual, release gate** (SC-041): submit both listings. Pass with zero rejections attributable to metadata, privacy declarations, missing assets, or claims not matching the app. Record any rejection and its cause here.
- [ ] T069 **manual, release gate** (SC-045): 30 days after publication, search each store for the app's own name and for its primary intent term. Pass when it is returned for its name and appears on the first page for the intent term. Record the results here.

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
