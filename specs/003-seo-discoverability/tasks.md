---

description: "Task list for 003-seo-discoverability"
---

# Tasks: Search & Answer-Engine Discoverability

**Feature**: `003-seo-discoverability` · **Created**: 2026-08-04

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/page-identity.md](./contracts/page-identity.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001` and `002`: record deviations, defects, and
measurements here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE. This feature carries a specific hazard that `001` already paid for
once, and every test task below is worded to avoid it.

**The hazard: assertions that are satisfied by the wrong thing.** `001` shipped
`expect(transform).not.toBe('none')` — satisfied by the constant that centres the marker — which let a
144 px positioning error through seven phases. The same shape is available all over this feature:

| Tempting assertion | Why it passes on a broken build |
| --- | --- |
| "the content section exists after `#root` in the DOM" | Passes with the tuner half off-screen. Says nothing about FR-066. |
| "`<h1>` is present" | Passes with two `<h1>`s. P2 says *exactly one*. |
| "`og:image` has a value" | Passes with a 404, a relative URL, or a 300×300 icon. |
| "canonical tag is non-empty" | Passes with the literal `%VITE_SITE_URL%`, which Vite leaves in place. |
| "`featureList` matches `content.ts`" | Passes trivially — both sides are the same constant. P10 needs the *rendered* text. |
| "the page contains the description text" | Passes when a script wrote it. P1's binding word is *before any script executes*. |

Each test task states **what failure looks like before the implementation**. If a test passes on first
run, it is wrong; fix the test before touching the implementation.

**Three tasks are deliberately "break it and watch the gate fail"** (T018, T048, T049). A gate never
observed failing is not known to work — and SC-030/SC-031/SC-032 make that an explicit deliverable, not
a nicety.

---

## Phase 1: Setup

**Purpose**: Establish the before-numbers Principle V will demand, and find out which existing tests this
feature is about to break.

- [ ] T001 Confirm all gates pass on a clean checkout and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [ ] T002 [P] Add a cold-start measurement to `apps/web/e2e/performance.spec.ts` — time from navigation to the tuning display being interactive — and record the baseline here; **no such measurement exists today**, and SC-028 requires before/after against the 2 s budget
- [ ] T003 [P] Record baseline `dist/index.html` byte size and total bundle size from `pnpm build` in this file — the static content adds document bytes and D2 removes a runtime step, and the net must be attributable
- [ ] T004 [P] Audit the existing e2e suite for assumptions this feature invalidates and record the list here — specifically `apps/web/e2e/appearance.spec.ts` "the tuning line is the dominant element of the screen (FR-021)", which may measure against the document rather than the viewport and would fail once content sits below the fold

**Checkpoint**: baselines recorded; the blast radius on the existing suite is known rather than discovered mid-implementation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The build-time assembly step every story hangs off, plus the two changes that must land
before any static content is added — otherwise the content renders unstyled (D2) and unreachable (D3).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests (write first, observe failing)

- [ ] T005 [P] Create `apps/web/e2e/no-script.spec.ts` with `test.use({ javaScriptEnabled: false })` asserting every `--ct-*` custom property resolves to a real value on `:root` — **fails today**: the token block is appended by `apps/web/src/main.tsx`, so with scripting off nothing defines them
- [ ] T006 [P] Create `apps/web/e2e/fold.spec.ts` asserting the document is scrollable (`scrollHeight > innerHeight`) once content exists, and that `#root`'s bounding box height equals exactly one viewport height — **fails today**: `overflow: hidden` and `height: 100%` make `scrollHeight === innerHeight`
- [ ] T007 [P] Create `apps/web/e2e/metadata.spec.ts` asserting `document.querySelectorAll('h1')` has length **exactly 1**, both before permission is granted and after — **fails today in the second case**: the only `<h1>` lives in `PermissionPrompt` and unmounts on grant, leaving zero

### Implementation

- [ ] T008 Create `apps/web/src/content.ts` exporting `title`, `description`, `heading`, `appName`, `sections`, and `features` per [data-model.md](./data-model.md) — plain exported constants, no class or factory (Principle II); the accuracy claim MUST carry its E1–E6 range or be softened, because "±1 cent" unqualified is false outside that band per the constitution
- [ ] T009 [P] Create `apps/web/.env` committing a development default for `VITE_SITE_URL` (absolute origin, no trailing slash) — without it Vite leaves `%VITE_SITE_URL%` **unreplaced**, shipping a URL-shaped literal rather than an obviously-empty tag (research D5)
- [ ] T010 Add a `siteIdentity()` plugin to `apps/web/vite.config.ts` alongside the existing `precache()`, using `transformIndexHtml` to inject the `themeCss` from `apps/web/src/theme.ts` as a `<style>` in `head-prepend` (D2) — this plugin is the assembly point US1/US2/US3 all extend
- [ ] T011 Remove the runtime style injection from `apps/web/src/main.tsx`, change `html, body` from `height: 100%` to `min-height: 100%`, drop `height: 100%` from `#root`, and set `history.scrollRestoration = 'manual'` (D2, D3, FR-067)
- [ ] T012 [P] Remove `overflow: 'hidden'` from `apps/web/src/components/templates/TunerLayout.tsx`, keeping `minHeight: '100dvh'` as the guarantee that the tuner owns the fold (D3) — `100dvh` not `100vh` matters more now that the page scrolls
- [ ] T013 [P] Demote the `<h1>` in `apps/web/src/components/molecules/PermissionPrompt.tsx` to a `<p>` styled identically (or an `<h2>` if it should stay in the outline), per D4 — its text names no searchable concept and its element unmounts
- [ ] T014 Run `pnpm lint && pnpm typecheck && pnpm test:e2e` and confirm T005–T007 now pass and nothing else regressed; record any fallout from T004's list here

**Checkpoint**: the build assembles the theme, the page scrolls, the heading count is correct, and `content.ts` is the single source. User stories can now begin.

---

## Phase 3: User Story 1 — A guitarist searching the web finds the tuner (P1) 🎯 MVP

**Goal**: The served document already describes itself — descriptive title, summary, one `<h1>`, and
supporting content — with the tuner still owning the fold, and crawlers told which address is canonical.

**Independent Test**: Fetch the page with scripting disabled and find the tool's name, purpose, heading,
and ≥150 words of supporting text. Load it in a browser and confirm the tuning display is fully usable
without scrolling on the smallest supported screen.

### Tests (write first, observe failing)

- [ ] T015 [P] [US1] Extend `apps/web/e2e/no-script.spec.ts` to assert the `<h1>` text, the meta description, and every section heading and body are visible with `javaScriptEnabled: false` (P1, FR-060) — fails until T023
- [ ] T016 [P] [US1] Add a raw-bytes assertion to `apps/web/e2e/no-script.spec.ts` (or a sibling node check) that reads the served HTML as text and finds the same strings — **this is the half that actually tests P1's "before any script executes"**; the Playwright half only proves a browser displays it
- [ ] T017 [P] [US1] Extend `apps/web/e2e/fold.spec.ts` to measure, at the smallest supported viewport, that every tuning-display element and control has a bounding box entirely within the first viewport height with `scrollY === 0` (FR-066, SC-029) — measure **geometry, not DOM order**, using the bounding-box discipline of `apps/web/e2e/helpers.ts`
- [ ] T018 [P] [US1] Add a fold-growth check to `apps/web/e2e/fold.spec.ts` and demonstrate it: temporarily inject a paragraph large enough to encroach, confirm the gate fails, remove it, record the observation here (FR-087, SC-032)
- [ ] T019 [P] [US1] Add a scroll-restoration test to `apps/web/e2e/fold.spec.ts`: scroll to the content, reload, assert `scrollY === 0` (FR-067) — fails until T011 lands, and would silently regress without this
- [ ] T020 [P] [US1] Add build-output assertions for `dist/robots.txt` and `dist/sitemap.xml` — sitemap lists the canonical URL and no other, robots names the sitemap's absolute URL, and a build with a non-canonical `VITE_SITE_URL` emits a disallow-all robots (P12, FR-072/073/076)
- [ ] T021 [P] [US1] Assert neither `robots.txt` nor `sitemap.xml` appears in the precache manifest inside `dist/sw.js` (P12a) — **fails on the naive implementation**: plugin-emitted files land in Rollup's bundle object and the existing manifest derivation sweeps them in automatically
- [ ] T022 [P] [US1] Extend `apps/web/e2e/metadata.spec.ts` to assert `<link rel="canonical">` is absolute, resolved, and **contains no `%` character** (P5) — a non-empty check passes on the unreplaced literal

### Implementation

- [ ] T023 [US1] Add the head identity to `apps/web/index.html` — `<title>`, `<meta name="description">`, `<link rel="canonical" href="%VITE_SITE_URL%/">`, `lang` — with values wired from `apps/web/src/content.ts` through the `siteIdentity()` plugin so no string is written twice (V-COPY-3)
- [ ] T024 [US1] Add the static content section to `apps/web/index.html` as a sibling **after** `<div id="root">` — the single `<h1>`, section `<h2>`s, and ≥150 words of body text (target ~250), rendered from `content.sections` by the plugin (D1, FR-063/064, P2–P4)
- [ ] T025 [US1] Add the scroll cue below the tuner (FR-068) — visible, and positioned so it cannot overlap the tuning display or its controls at the smallest supported width
- [ ] T026 [US1] Emit `robots.txt` and `sitemap.xml` from `siteIdentity()` in `apps/web/vite.config.ts`, both derived from `VITE_SITE_URL`, with the disallow-all variant when the origin is not canonical (D5, D9, FR-072/073/076)
- [ ] T027 [US1] Add the precache exclusion to `precache()` in `apps/web/vite.config.ts` as a **rule over the emitted set, not a list of two filenames** (P12a) — that function's own comment already records what happens when the list is hand-maintained
- [ ] T028 [US1] Fix or re-scope any existing test T004 identified as broken, notably `appearance.spec.ts`'s FR-021 dominance check — re-scope it to the viewport rather than the document; record here whether it needed the change
- [ ] T029 [US1] Run the full e2e suite and confirm T015–T022 pass and nothing regressed

**Checkpoint**: US1 is complete and independently shippable. The page is indexable, the tuner still owns the fold, and crawlers know the canonical address. **This is the MVP.**

---

## Phase 4: User Story 2 — A shared link shows what the tool is (P2)

**Goal**: Pasting the link produces a preview card with name, summary, and a legible image instead of a
naked URL.

**Independent Test**: Run the built page through link-preview tooling and confirm a card renders with
title, description, and a correctly sized image.

### Tests (write first, observe failing)

- [ ] T030 [P] [US2] Extend `apps/web/e2e/metadata.spec.ts` to assert `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `twitter:card`, `twitter:image` are all present and non-empty (P6) — all fail today
- [ ] T031 [P] [US2] Assert `og:image` is an **absolute** URL that returns `200` and is a PNG of exactly 1200 × 630 (P7) — several preview generators do not resolve relative image URLs and fail silently, so absoluteness is the assertion that matters
- [ ] T032 [P] [US2] Assert `og:title` equals `<title>` and `og:description` equals the meta description (P8) — structurally true by construction, asserted anyway because a later edit could undo it
- [ ] T033 [P] [US2] Assert `apps/web/public/manifest.webmanifest` carries `name`, `short_name`, `description`, `lang`, `dir`, `categories`, and icons (FR-080)

### Implementation

- [ ] T034 [US2] Create `apps/web/scripts/generate-og-image.mjs` rendering an HTML template at 1200 × 630 with the **installed** `@playwright/test` Chromium and screenshotting to `apps/web/public/og-image.png` (D7) — palette from `@chromatic-tuner/tokens`, no literal colours, no new dependency
- [ ] T035 [US2] Add an `og:image` script to `apps/web/package.json`, run it, and commit `apps/web/public/og-image.png` — generated-and-committed, following the `apps/web/e2e/fixtures/generate.mjs` precedent
- [ ] T036 [US2] Add the preview identity tags to `apps/web/index.html` via `siteIdentity()`, reading `title`/`description` from `apps/web/src/content.ts` and the origin from `%VITE_SITE_URL%` so absoluteness is structural (P6–P8)
- [ ] T037 [P] [US2] Complete `apps/web/public/manifest.webmanifest` per T033, reusing `content.description` rather than restating it (FR-080)
- [ ] T038 [US2] Run the full e2e suite and confirm T030–T033 pass

**Checkpoint**: US1 and US2 both work independently. A shared link renders a card.

---

## Phase 5: User Story 3 — An answer engine recommends the tuner accurately (P3)

**Goal**: The page carries a machine-readable description of itself as an application, and every claim
in it is corroborated by visible text.

**Independent Test**: Parse the JSON-LD, confirm it is a valid `SoftwareApplication`, and confirm every
`featureList` entry appears in text a person can read on the page.

### Tests (write first, observe failing)

- [ ] T039 [P] [US3] Extend `apps/web/e2e/metadata.spec.ts` to assert **exactly one** `application/ld+json` block that parses as JSON with `@type: "SoftwareApplication"`, `name`, `description`, `applicationCategory`, `operatingSystem`, `url`, and `offers` with `price: "0"` and a `priceCurrency` (P9)
- [ ] T040 [P] [US3] Assert every `featureList` entry from the **parsed JSON-LD** appears in `document.body.innerText` (P10, FR-083) — search the **rendered text**, not `content.ts` and not the HTML source; comparing the module against itself proves nothing, and a claim "corroborated" by a comment or an `aria-label` has not been corroborated for a reader
- [ ] T041 [P] [US3] Assert no denylisted out-of-scope term appears anywhere in the rendered document — tuning presets, Drop D, DADGAD, custom tuning, per-string, reference tone, capo, transposition, metronome, chord library, sign-in, account, sync (P11, FR-065)

### Implementation

- [ ] T042 [US3] Add `features` to `apps/web/src/content.ts`, each entry phrased so it can appear verbatim in a `sections[].body` — this ordering is deliberate: write the visible sentence first, then derive the claim from it, never the reverse (V-COPY-2)
- [ ] T043 [US3] Emit the JSON-LD block from `siteIdentity()` in `apps/web/vite.config.ts`, generated from the same `content.ts` values as the visible markup so the two cannot disagree (D6)
- [ ] T044 [US3] Adjust `content.sections` wherever T040 reports an uncorroborated claim — **fix the copy, not the test**; an entry no visible sentence supports must be deleted from `features`, not asserted around
- [ ] T045 [US3] Run the full e2e suite and confirm T039–T041 pass

**Checkpoint**: all three content stories are independently functional.

---

## Phase 6: User Story 4 — Discoverability does not silently rot (P4)

**Goal**: Every guarantee above is asserted automatically alongside the existing gates, and a regression
blocks a merge instead of surfacing months later as traffic that stopped arriving.

**Independent Test**: Remove a required identity item and confirm the gate fails naming that item.

- [ ] T046 [P] [US4] Add asset-reachability assertions to `apps/web/e2e/metadata.spec.ts` for every URL the page identity references — `og:image`, icons, manifest — each must return `200` (FR-085, P7)
- [ ] T047 [P] [US4] Add a sweep asserting **no** unresolved `%VITE_*%` token survives anywhere in the built `dist/index.html`, `dist/robots.txt`, or `dist/sitemap.xml` (V-ENV-2)
- [ ] T048 [US4] Demonstrate the gate fails for at least **three** different items — remove the description, empty the canonical, rename `og-image.png` — confirming each failure message **names the missing item** rather than reporting a generic assertion failure; restore afterwards and record the three messages here (FR-084, SC-031)
- [ ] T049 [US4] Verify offline is intact: `pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &` then `pnpm --filter @chromatic-tuner/web verify:offline`, plus a grep confirming `robots`/`sitemap` appear nowhere in `dist/sw.js` (FR-086, V26)
- [ ] T050 [P] [US4] Extend `apps/web/e2e/a11y.spec.ts` to cover the new content section — Axe clean, headings in order, keyboard traversal into the content and back out without stepping through every element (FR-070, FR-071)
- [ ] T051 [P] [US4] Extend `apps/web/e2e/appearance.spec.ts` to assert the content section is themed and meets AA contrast in **both** appearances (FR-070) — the palette being correct is not evidence the composited result is; `001` shipped 3.9:1 text behind a correct token
- [ ] T052 [US4] Confirm the three new specs run in CI via the existing `e2e` job in `.github/workflows/ci.yml` and need no workflow change; if they do need one, make it here
- [ ] T053 [US4] Run every gate and record the counts in this file

**Checkpoint**: all four stories complete; the guarantees are enforced rather than documented.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T054 Record the **after** cold-start number from T002's measurement and the after document/bundle sizes from T003, and state the net against the 2 s budget in this file (Principle V, SC-028) — D2 removes a runtime step and the content adds bytes, in opposite directions
- [ ] T055 [P] Capture light and dark screenshots of the fold and of the content section and attach them to the PR (Development Workflow — mandatory for any UI change)
- [ ] T056 Run the V27 human legs from [quickstart.md](./quickstart.md) — scroll cue visible and non-overlapping at the smallest width, largest platform text size still fits the fold, keyboard traversal, installed-app identity (FR-080, SC-030) — and record findings here
- [ ] T057 [P] Add a deployment checklist section to this file from research D10 and quickstart V29: set `VITE_SITE_URL`, confirm robots allows on canonical and disallows on previews, **configure the host so unknown paths return 404 rather than the SPA shell with a 200**
- [ ] T058 Run the full gate set — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build` plus `verify:offline` — and record the counts (SC-034)
- [ ] T059 [P] Record in this file that V28 (public schema validators, Lighthouse SEO) and V29 (real link previews, indexation) remain **open** and why — both need a deployment that does not exist; they are release gates, not skipped work
- [ ] T060 Create `specs/003-seo-discoverability/validation-results.md` recording V22–V27 outcomes, following the `001` and `002` convention

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story** — until `content.ts` exists, the theme is build-time, and the page scrolls, no story can be implemented or honestly tested.
- **US1 (Phase 3)**: depends on Foundational. No dependency on US2–US4.
- **US2 (Phase 4)**: depends on Foundational. Reads `content.ts` but not US1's markup — independently testable.
- **US3 (Phase 5)**: depends on Foundational. P10's corroboration check needs US1's visible content to be present, so in practice run it after US1; the JSON-LD itself does not.
- **US4 (Phase 6)**: hardens whatever exists. Every task is worth running against a partial feature, but it delivers nothing on its own.
- **Polish (Phase 7)**: depends on the stories you intend to ship.

### Within each story

- Test tasks are written and observed **failing** before the implementation beneath them.
- `content.ts` before anything that reads it.
- The `siteIdentity()` plugin (T010) before every task that emits through it — T023, T026, T036, T043.
- Copy before claims (T042 before T043), never the reverse.

### The one real serialisation

`apps/web/vite.config.ts` is touched by T010, T026, T027, T036, and T043. Those cannot run in parallel
with each other regardless of which story they belong to. Everything else in this feature parallelises
freely because the files are disjoint.

### Parallel opportunities

- Setup: T002, T003, T004 together.
- Foundational tests: T005, T006, T007 together.
- Every story's test tasks are parallel with each other.
- US2 and US3 can be built simultaneously by two people once Foundational and US1 are done — they share
  only `vite.config.ts`, which serialises at T036/T043.

---

## Parallel Example: User Story 1

```bash
# All US1 tests first; every one must fail before implementation begins:
Task: "No-script content assertions in apps/web/e2e/no-script.spec.ts"
Task: "Raw-bytes served-content assertion in apps/web/e2e/no-script.spec.ts"
Task: "Fold geometry at the smallest viewport in apps/web/e2e/fold.spec.ts"
Task: "Fold-growth gate in apps/web/e2e/fold.spec.ts"
Task: "Scroll restoration in apps/web/e2e/fold.spec.ts"
Task: "robots.txt and sitemap.xml build output assertions"
Task: "Precache exclusion assertion against dist/sw.js"
Task: "Canonical is absolute and contains no % token in apps/web/e2e/metadata.spec.ts"

# Then implementation, serialised on vite.config.ts:
Task: "Head identity in apps/web/index.html"
Task: "Static content section in apps/web/index.html"
Task: "Scroll cue"
Task: "robots.txt + sitemap.xml emission in apps/web/vite.config.ts"
Task: "Precache exclusion rule in apps/web/vite.config.ts"
```

---

## Implementation Strategy

### MVP

**US1 alone.** It is the whole point of the feature and the only story that opens a closed path rather
than improving an existing one. Every other story depends on the served-content foundation it
establishes: without it there is nothing to preview, nothing to corroborate, and nothing to gate.

### Incremental delivery

1. **Foundational** → the build assembles the page; the page scrolls
2. **US1** → the tuner is findable → **MVP, shippable**
3. **US2** → a shared link stops looking broken
4. **US3** → answer engines can describe it accurately
5. **US4** → none of it can silently rot
6. Polish → measurements, screenshots, deployment checklist

Each step is independently releasable. If the feature is cut short, cut from the bottom — but **not
below US4 for anything already shipped**: US1–US3 without US4 is exactly the regression this feature's
fourth story exists to prevent.

### Suggested split for two developers

By story, not by platform — unlike `001` and `002`, this feature has no mobile half at all. One
developer on US1 (the larger story, and the one holding `vite.config.ts` most of the time), one on US2
and US3 once Foundational lands. US4 is best done by whoever did not write the assertion being hardened.

---

## Notes

- **Test-first is constitutional** (Principle III). A test that passes on first run is a bug in the test;
  the table at the top of this file lists the six ways that is likely to happen here.
- **The fold gate must measure geometry, not structure** (T017). DOM order proves nothing about whether
  the tuner still fits.
- **Cold start must be measured before and after** (T002, T054). No such measurement exists today, so
  T002 builds it.
- **Any UI change needs light and dark screenshots** (T055). This feature adds a visible section.
- **Zero new dependencies.** The preview image uses the Chromium `@playwright/test` already installs
  (D7); adding `sharp` or a resvg binding would fail the constitution's dependency rule.
- **`packages/*` and `apps/mobile` are untouched.** No core API delta exists for this feature, unlike
  `002`. If a task seems to need one, the task is wrong.
- The `001` out-of-scope list stays binding, and here it binds the **copy**: no tuning presets, string
  targets, custom tunings, reference tones, capo, accounts, or sync may be named in text written to
  attract searches (T041, FR-065).
- Requirement numbers continue `001` and `002`: **FR-060–FR-087**, **SC-023–SC-034**, contract guarantees
  **P1–P12a**, validation **V22–V29**. Do not restart them; they are cited from source.
