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

- [X] T001 Confirm all gates pass on a clean checkout and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [X] T002 [P] Add a cold-start measurement to `apps/web/e2e/performance.spec.ts` — time from navigation to the tuning display being interactive — and record the baseline here; **no such measurement exists today**, and SC-028 requires before/after against the 2 s budget
- [X] T003 [P] Record baseline `dist/index.html` byte size and total bundle size from `pnpm build` in this file — the static content adds document bytes and D2 removes a runtime step, and the net must be attributable
- [X] T004 [P] Audit the existing e2e suite for assumptions this feature invalidates and record the list here — specifically `apps/web/e2e/appearance.spec.ts` "the tuning line is the dominant element of the screen (FR-021)", which may measure against the document rather than the viewport and would fail once content sits below the fold

**Checkpoint**: baselines recorded; the blast radius on the existing suite is known rather than discovered mid-implementation.

### Phase 1 results — 2026-08-04, commit `109bf67`, no source changes beyond T002's new test

**All eight gates green.**

| Gate | Result |
| --- | --- |
| `pnpm lint` | clean, `--max-warnings 0` |
| `pnpm format:check` | clean |
| `pnpm typecheck` | 5/5 projects |
| `pnpm test` | **430 passed**, 18 files, 8.04 s |
| `pnpm --filter @chromatic-tuner/mobile test` | **64 passed**, 9 suites |
| `pnpm test:coverage` | **100% lines**, 98.5% statements, 94.81% branches, 97.29% functions |
| `pnpm test:e2e` | **75 passed**, 37.4 s |
| `pnpm build` | 241,489 B excluding maps, `sw.js` emitted |

**T003 — build baseline for the before/after at T054:**

| Artefact | Bytes |
| --- | --- |
| `dist/index.html` | **669** |
| `dist/assets/index-Cv6wc-Yd.js` | 236,213 |
| `dist/sw.js` | 3,069 |
| **`dist/` total, maps excluded** | **241,489** |

`dist/` currently holds six files: the three above plus `icon.svg`, `icon-maskable.svg`, and
`manifest.webmanifest`. T026 adds `robots.txt` and `sitemap.xml` to that list, and T027 must keep both
out of the precache manifest inside `sw.js`.

**T002 — cold start, and a measurement protocol that T054 must match**

The test is new (`performance.spec.ts`, "reaches a usable tuning display within the cold-start budget").
The 2 s budget has been binding since ratification but was never measured: the suite covered frame time
and DOM growth and nothing else on this axis.

Six isolated runs (`-g "cold-start"`, one worker):

| Run | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| ms | 149.3 | 168.2 | 121.0 | 133.7 | 149.2 | 104.7 |

**Baseline: median 141.5 ms** (min 104.7, max 168.2, spread 63.5 ms).

Two things about this number that will corrupt T054's comparison if ignored:

- **A single sample is not a comparable figure.** The scatter is ±23% on unmodified code — the same
  lesson `002` recorded for frame-time `max`. Compare **medians of at least five isolated runs**; treat
  a movement under ~65 ms as measurement noise, not a regression.
- **Concurrency changes it by more than the change under test plausibly will.** Running the whole
  `performance.spec.ts` file with `fullyParallel` gave **333.9 ms** against ~141 ms isolated — 2.4×.
  T054 must re-measure the same way (isolated, `-g "cold-start"`, five runs) or it will report a
  phantom regression of ~190 ms that is purely test-harness load.

Also worth stating plainly: Playwright's `webServer` runs `pnpm dev`, so this measures the **dev server**,
not a production build. It is a relative instrument for detecting a regression between two commits, not a
statement about the 2 s budget on real hardware — that remains the on-device gate.

**One defect found while writing the test, recorded because the same trap is waiting in Phase 2.**
The first version installed its `MutationObserver` on `document.documentElement` inside
`page.addInitScript`. That runs before any page script, which is early enough that `documentElement` is
still `null` — `observe(null)` throws, the init script dies silently, and the measurement is simply never
taken. It surfaced as `__coldStartMs` being `undefined` rather than as an error. Fixed by observing
`document`. The reason it was diagnosable in one run rather than three is that the assertion carried a
message ("the cold-start observer never fired") instead of just `toBeDefined()` — which is the discipline
T048 makes an explicit deliverable.

**T004 — audit of existing e2e assumptions. The plan named the wrong test.**

The plan predicted `appearance.spec.ts`'s FR-021 dominance check would break. **It will not.** It reads
`page.viewportSize()` and compares `line.width` against `viewport.width * 0.4` — width, against the
viewport, not the document. Content below the fold does not touch it. T028 should record "no change
needed" unless something else emerges.

**The real breaker is a different test**, and there is exactly one:

> `apps/web/e2e/tuning-in-tune.spec.ts:24` — `is fully visible without scrolling (FR-018)`
>
> ```ts
> y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
> expect(scrolls.y).toBe(false);
> ```

This asserts **the document does not scroll at all**, which is precisely what D3 changes. It will fail at
T011 and stay failing. It must be **re-scoped, not deleted**: FR-018 and FR-066 require the *tuning
display* to be usable without scrolling, never that the *document* be unscrollable — and the horizontal
half of the assertion (`scrolls.x`) stays valid and should be kept. Its replacement is the geometry gate
T017 builds. Deleting a failing test to unblock a merge is prohibited (Principle III); re-scoping one
whose assertion no longer matches the requirement it cites is not the same act, and the reasoning belongs
in the diff.

**T028 is therefore mis-aimed as written.** It should re-scope `tuning-in-tune.spec.ts:24` and record
that `appearance.spec.ts` needed no change. Corrected in place below.

Two further findings, neither blocking:

- **`layout-stability.spec.ts`** measures top edges via `getBoundingClientRect().y` — viewport-relative.
  Safe at `scrollY === 0`, which every one of its tests holds, but it would silently mis-measure if any
  future test in that file scrolls first. Left alone; noted so it is not a surprise.
- **`a11y.spec.ts:124`** asserts the **first** `Tab` lands on `reference-badge` ("the only control on the
  tuner screen"). This constrains T025: if the scroll cue is focusable and precedes the badge in DOM
  order, this test breaks. A non-focusable visual cue, or one placed after the tuner in DOM order, keeps
  it green. Recorded as a design constraint on T025 rather than a change to the test.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The build-time assembly step every story hangs off, plus the two changes that must land
before any static content is added — otherwise the content renders unstyled (D2) and unreachable (D3).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests (write first, observe failing)

- [X] T005 [P] Create `apps/web/e2e/no-script.spec.ts` with `test.use({ javaScriptEnabled: false })` asserting every `--ct-*` custom property resolves to a real value on `:root` — **fails today**: the token block is appended by `apps/web/src/main.tsx`, so with scripting off nothing defines them
- [X] T006 [P] Create `apps/web/e2e/fold.spec.ts` asserting the document is scrollable (`scrollHeight > innerHeight`) once content exists, and that `#root`'s bounding box height equals exactly one viewport height — **fails today**: `overflow: hidden` and `height: 100%` make `scrollHeight === innerHeight`
- [X] T007 [P] Create `apps/web/e2e/metadata.spec.ts` asserting `document.querySelectorAll('h1')` has length **exactly 1**, both before permission is granted and after — **fails today in the second case**: the only `<h1>` lives in `PermissionPrompt` and unmounts on grant, leaving zero

### Implementation

- [X] T008 Create `apps/web/src/content.ts` exporting `title`, `description`, `heading`, `appName`, `sections`, and `features` per [data-model.md](./data-model.md) — plain exported constants, no class or factory (Principle II); the accuracy claim MUST carry its E1–E6 range or be softened, because "±1 cent" unqualified is false outside that band per the constitution
- [X] T009 [P] ~~Create `apps/web/.env`~~ — **blocked by `.gitignore`; design changed, see log.** The committed default moves into `vite.config.ts` and lands with T023, which is the first task that consumes it
- [X] T010 Add a `siteIdentity()` plugin to `apps/web/vite.config.ts` alongside the existing `precache()`, using `transformIndexHtml` to inject the `themeCss` from `apps/web/src/theme.ts` as a `<style>` in `head-prepend` (D2) — this plugin is the assembly point US1/US2/US3 all extend
- [X] T011 Remove the runtime style injection from `apps/web/src/main.tsx` and set `history.scrollRestoration = 'manual'` (D2, FR-067). **The height changes were not made** — measurement showed they are not needed; see log
- [X] T012 [P] ~~Remove `overflow: 'hidden'` from `TunerLayout.tsx`~~ — **no change needed, and removing it is actively risky.** See log
- [X] T013 [P] Demote the `<h1>` in `apps/web/src/components/molecules/PermissionPrompt.tsx` to a `<p>` styled identically (or an `<h2>` if it should stay in the outline), per D4 — its text names no searchable concept and its element unmounts
- [X] T014 Run `pnpm lint && pnpm typecheck && pnpm test:e2e` and confirm T005–T007 now pass and nothing else regressed; record any fallout from T004's list here

**Checkpoint**: the build assembles the theme, the page scrolls, the heading count is correct, and `content.ts` is the single source. User stories can now begin.

### Phase 2 results — 2026-08-04

**Gates: lint clean, format clean, typecheck 5/5, unit 430 passed, e2e 81 passed / 1 known-red.**

The one red test is `metadata.spec.ts` "the document has exactly one top-level heading". It is red **by
sequencing, not by defect** — see the correction below. Everything else is green with zero regressions.

**Three planning assumptions were wrong, all found by measuring rather than reading.**

**1. D3's premise is false: the page was never prevented from scrolling.**

Research D3 states that three rules "conspire to make the document unscrollable". They do not.
`overflow: hidden` sits on `<main>` *inside* `#root`, so it clips main's own overflow and never the
document; `height: 100%` sets a box height without clipping anything. Probed on unmodified code by
appending a content block after `#root`:

```
docScrolls: true      bodyOverflow: visible    htmlOverflow: visible
mainOverflow: hidden  bodyHeight: 720px        scrolled to: 2104px
```

So of T011's four changes, only `history.scrollRestoration = 'manual'` was needed — and it was the one
genuinely broken thing, since browsers restore scroll position by default and a returning reader would
land on prose with the tuner off-screen. **The height changes were not made**: they fix nothing, and
Principle II asks for the smallest change that satisfies the spec.

**T012 was not done either, and should not be.** Removing `overflow: hidden` from `TunerLayout` is not
merely unnecessary — it is the rule currently preventing *horizontal* overflow, which
`tuning-in-tune.spec.ts` asserts and FR-018 requires. Removing it to satisfy a premise that was false
would have risked a real regression for no benefit.

**Consequence for the tests.** Two of `fold.spec.ts`'s three tests pass on unmodified code. By this
file's own rule that is a defect in the test, so it is stated plainly in the file: they are
characterisation tests pinning properties that were never broken, not red-to-green ones. The
scroll-restoration test is the only Phase 2 assertion that actually failed first, and it did:
`"the browser restored the previous scroll position"`.

**2. `.env` cannot be committed — `.gitignore:25` ignores it (T009).**

The repo ignores `.env` and `.env.*`, permitting only `.env.example`, which Vite does not read. So D5's
committed development default is unreachable as specified. Un-ignoring `apps/web/.env` was rejected: that
path is the conventional home for secrets, and a negation rule there invites a key into the repo later.

**The replacement is better than the original.** The fallback origin becomes an explicit constant in
`vite.config.ts`, resolved by the plugin, with `VITE_SITE_URL` overriding it. A public URL is not a
secret and belongs in reviewable source rather than a dotfile. It is also fail-safe in a way the `.env`
plan was not: a deploy that forgets to set the variable falls back to a localhost origin, which is *not*
canonical, so FR-076's disallow-all `robots.txt` fires automatically. The `.env` version would have
shipped a plausible-looking wrong canonical instead.

No code was written for this at T009, deliberately: the value has no consumer until T023, and an unused
constant is dead code (Principle I). The decision is recorded; the implementation is T023's.

This also removes `%VITE_SITE_URL%` from the design. The plugin substitutes resolved absolute URLs
directly, so the "unreplaced token ships to production" failure class disappears at the source rather
than being caught by P5's no-`%` clause. That clause stays as a guard.

**3. `vite.config.ts` cannot import the tokens package (T010).**

Importing `themeCss` from `src/theme.ts` failed the entire build:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../packages/tokens/src/colors'
  imported from .../packages/tokens/src/index.ts
```

Vite loads the config through Node, which treats bare specifiers as external and then rejects the
extensionless imports inside the workspace package. Any module reachable from the config via a bare
workspace specifier hits this — including `src/theme.ts`, transitively.

`configLoader: 'runner'` / `'native'` were rejected: both are experimental and would change config
loading for every Vite invocation in the project, which is a large blast radius for one import.

The fix took three specific choices, each of which fails differently if reverted, so they are documented
inline at the import site:

- **relative path**, so the config bundler resolves it instead of Node;
- **`src/colors.js` rather than the package barrel**, because `src/index.ts` re-exports extensionlessly
  and Vite warns on every build about it — not worth editing a shared package over;
- **`.js` on a `.ts` file**, because Vite's coming native loader requires an explicit extension while
  `.ts` fails typecheck with TS5097 (`allowImportingTsExtensions`, which conflicts with
  `declaration: true` in `tsconfig.base.json`). `.js` is the one spelling both tools accept.

**The generator moved rather than being duplicated.** `themeCss` and its `block`/`kebab` helpers are gone
from `src/theme.ts`, which no longer imports the palette at all; it keeps `themedVar()` and
`stateColorVar` for components. Keeping a second copy would have put the palette in two places with
nothing to keep them in step — the exact drift D2 exists to prevent.

**Sequencing correction: T007's second assertion belongs to US1, not Phase 2.**

`metadata.spec.ts` has two tests:

- *heading count is invariant across the permission transition* — **green**. It failed first with exactly
  the D4 defect, empirically confirmed: `"the document had 1 <h1> before permission and 0 after"`.
- *exactly one `<h1>`* — **red, and stays red until T024** adds the static heading.

This is a sequencing error in the task list, not a defect. T013 demotes the explainer's heading because
the static one takes over; between T013 and T024 the page has **zero** `<h1>`, which is briefly worse
than before. Both tasks are correct and they simply have to land together to satisfy FR-063.

The test is left **written and red** rather than skipped or deleted. Principle III forbids removing a
failing test to unblock a merge, and `test.fixme` would be exactly that move wearing a different hat. A
test written ahead of its implementation and observed failing is test-first working as intended; the only
error was filing it under Phase 2.

**Measurements**

| | Before (T002/T003) | After Phase 2 | Net |
| --- | --- | --- | --- |
| Cold start, median of 5 isolated runs | 141.5 ms | **118.0 ms** | −23.5 ms |
| `dist/index.html` | 669 B | **1,735 B** | +1,066 B |
| `dist/assets/*.js` | 236,213 B | **235,516 B** | −697 B |
| `dist/` total, maps excluded | 241,489 B | **241,870 B** | +381 B |

The cold-start move is **within the noise band** and must not be reported as an improvement: T002
measured ±23% scatter on unmodified code, and 23.5 ms is smaller than that. It is consistent with D2
removing a runtime step, not evidence of it. T054 re-measures with content in place.

The document grew by the token block (~1 kB) and the bundle shrank by almost as much, because the
generator left the app's module graph — the same bytes, moved from JavaScript that must execute into
markup that does not.

**Still true after Phase 2**: `appearance.spec.ts`, `a11y.spec.ts`, `layout-stability.spec.ts` and
`tuning-in-tune.spec.ts`'s FR-018 check are all green and untouched. The last of those still passes
because the document has nothing below the fold yet; T028 re-scopes it when T024 changes that.

---

## Phase 3: User Story 1 — A guitarist searching the web finds the tuner (P1) 🎯 MVP

**Goal**: The served document already describes itself — descriptive title, summary, one `<h1>`, and
supporting content — with the tuner still owning the fold, and crawlers told which address is canonical.

**Independent Test**: Fetch the page with scripting disabled and find the tool's name, purpose, heading,
and ≥150 words of supporting text. Load it in a browser and confirm the tuning display is fully usable
without scrolling on the smallest supported screen.

### Tests (write first, observe failing)

- [X] T015 [P] [US1] Extend `apps/web/e2e/no-script.spec.ts` to assert the `<h1>` text, the meta description, and every section heading and body are visible with `javaScriptEnabled: false` (P1, FR-060) — fails until T023
- [X] T016 [P] [US1] Add a raw-bytes assertion to `apps/web/e2e/no-script.spec.ts` (or a sibling node check) that reads the served HTML as text and finds the same strings — **this is the half that actually tests P1's "before any script executes"**; the Playwright half only proves a browser displays it
- [X] T017 [P] [US1] Extend `apps/web/e2e/fold.spec.ts` to measure, at the smallest supported viewport, that every tuning-display element and control has a bounding box entirely within the first viewport height with `scrollY === 0` (FR-066, SC-029) — measure **geometry, not DOM order**, using the bounding-box discipline of `apps/web/e2e/helpers.ts`
- [X] T018 [P] [US1] Add a fold-growth check to `apps/web/e2e/fold.spec.ts` and demonstrate it: temporarily inject a paragraph large enough to encroach, confirm the gate fails, remove it, record the observation here (FR-087, SC-032)
- [X] T019 [P] [US1] **Already done in Phase 2** — its implementation (T011) landed there, so the test was written alongside it. Add a scroll-restoration test to `apps/web/e2e/fold.spec.ts`: scroll to the content, reload, assert `scrollY === 0` (FR-067) — fails until T011 lands, and would silently regress without this
- [X] T020 [P] [US1] Add build-output assertions for `dist/robots.txt` and `dist/sitemap.xml` — sitemap lists the canonical URL and no other, robots names the sitemap's absolute URL, and a build with a non-canonical `VITE_SITE_URL` emits a disallow-all robots (P12, FR-072/073/076)
- [X] T021 [P] [US1] Assert neither `robots.txt` nor `sitemap.xml` appears in the precache manifest inside `dist/sw.js` (P12a) — **fails on the naive implementation**: plugin-emitted files land in Rollup's bundle object and the existing manifest derivation sweeps them in automatically
- [X] T022 [P] [US1] Extend `apps/web/e2e/metadata.spec.ts` to assert `<link rel="canonical">` is absolute, resolved, and **contains no `%` character** (P5) — a non-empty check passes on the unreplaced literal

### Implementation

- [X] T023 [US1] Add the head identity to `apps/web/index.html` — `<title>`, `<meta name="description">`, `<link rel="canonical" href="%VITE_SITE_URL%/">`, `lang` — with values wired from `apps/web/src/content.ts` through the `siteIdentity()` plugin so no string is written twice (V-COPY-3)
- [X] T024 [US1] Add the static content section to `apps/web/index.html` as a sibling **after** `<div id="root">` — the single `<h1>`, section `<h2>`s, and ≥150 words of body text (target ~250), rendered from `content.sections` by the plugin (D1, FR-063/064, P2–P4). **This closes the one red test left by Phase 2** — `metadata.spec.ts` "the document has exactly one top-level heading", which has had zero to count since T013 demoted the explainer's. Also: `<main>` currently paints the page background and only covers the fold, so the content section needs the background applied to a box that covers it too, or the area below the fold renders on the default canvas in dark mode
- [X] T025 [US1] Add the scroll cue below the tuner (FR-068) — visible, and positioned so it cannot overlap the tuning display or its controls at the smallest supported width
- [X] T026 [US1] Emit `robots.txt` and `sitemap.xml` from `siteIdentity()` in `apps/web/vite.config.ts`, both derived from `VITE_SITE_URL`, with the disallow-all variant when the origin is not canonical (D5, D9, FR-072/073/076)
- [X] T027 [US1] Add the precache exclusion to `precache()` in `apps/web/vite.config.ts` as a **rule over the emitted set, not a list of two filenames** (P12a) — that function's own comment already records what happens when the list is hand-maintained
- [X] T028 [US1] Re-scope `apps/web/e2e/tuning-in-tune.spec.ts:24` "is fully visible without scrolling (FR-018)" — T004 found this is the **only** existing test D3 breaks: it asserts the *document* does not scroll vertically, where FR-018/FR-066 require the *tuning display* to be usable without scrolling. Keep the horizontal half (`scrolls.x`), replace the vertical half with the geometry gate from T017, and state the reasoning in the diff — this is a re-scope, not a deletion (Principle III). Record that `appearance.spec.ts`'s FR-021 check needed **no** change, contrary to the plan's prediction
- [X] T029 [US1] Run the full e2e suite and confirm T015–T022 pass and nothing regressed

**Checkpoint**: US1 is complete and independently shippable. The page is indexable, the tuner still owns the fold, and crawlers know the canonical address. **This is the MVP.**

### Phase 3 results — 2026-08-04

**All gates green. e2e 91 passed, 0 failed** — including the test Phase 2 left red. lint clean, format
clean, typecheck 5/5, unit 430, `verify:offline` passes, `verify:build-output` passes.

The served document now carries the title, description, canonical address, one `<h1>`, and **254 words**
of supporting content, all before any script runs. `robots.txt` and `sitemap.xml` are emitted at build
and served in development.

**T019 was already done.** Its implementation (T011) landed in Phase 2, so the scroll-restoration test
was written there rather than here. No work remained.

**The scroll cue landed on the microphone button, and the test caught it (T025, FR-068).**

First attempt sized the cue at `space.xl` (40px) in the last 40px of the fold. `fold.spec.ts` failed with
`the scroll cue overlaps: tuner-display, microphone-toggle`. Measured at 360×640:

| Element | Occupies |
| --- | --- |
| viewport | 0–640 |
| `tuner-display` | 29–611 |
| `microphone-toggle` | **567–611** |
| `scroll-cue` (first attempt) | **600–640** |

So the cue sat on eleven pixels of the primary control. Fixed by sizing it to `space.lg` (24px), which
places it at 616–640 with five pixels of clearance.

**The more useful finding is why it was tight**: at the smallest supported viewport the tuner column
measures **582px inside 592px of available height — ten pixels of slack.** Reserving room by adding
bottom padding to `<main>`, which was the first instinct, would have overflowed the column and been
clipped by that element's `overflow: hidden`. There is no space to reserve; the cue had to fit the gap
that already existed. Recorded because anything else added inside the fold later faces the same ten
pixels.

**One assertion was narrowed, deliberately.** `tuner-display` is excluded from the overlap check: it is
the flex container holding the other elements, paints nothing of its own — no background, no border — and
its box spans the whole column, so overlapping it obscures no pixel a player can see. Every element that
actually paints stays in the check, including the control that caught the defect.

**Two test-harness errors of my own, both worth recording.**

*The fold-growth probe pushed nothing (T018).* It prepended a 400px block to `<main>` and reported that
nothing left the fold — apparently proving the gate could not detect encroachment. `<main>` is a flex
**row**, so the filler landed *beside* the tuner rather than above it. The probe was wrong, not the gate.
Retargeted at `[data-testid="tuner-display"]`, which is the column, and it discriminates.

*`transformIndexHtml` returning `html` replaces the document.* The first version of the content injection
returned `{ html: contentHtml, tags: [...] }`, which does not append the markup — it substitutes the
entire document, deleting `#root` and the module script. Caught before running. The hook now returns tag
descriptors only, with `injectTo: 'body'`, and the comment says why.

**robots.txt in development is disallow-all, and that is correct (T020).**

The test first asserted robots names the sitemap, and failed. The dev server runs on the fallback origin,
which is by definition not canonical, so the correct output there is the disallow-all variant — the
FR-076 fail-safe working exactly as Phase 2 designed it. Asserting *that* is a real check rather than a
workaround: if it ever starts allowing crawlers, a preview deployment would compete with the live site.

The canonical variant cannot be reached through the dev server at all, so it moved to a new
`scripts/verify-build-output.mjs`, which drives both builds itself. Verifying one origin proves nothing
about the other, and the non-canonical branch only ever runs on preview deploys — precisely the branch
nobody notices is broken.

**The precache exclusion was observed failing (T021, T027).** Removing the filter and re-running the
verifier gives:

```
the service worker precaches crawler-only files: robots.txt, sitemap.xml
  — exclude them from the manifest
```

The exclusion is stated as a rule over emitted file extensions (`.txt`, `.xml`) rather than the two
filenames, so a future `ads.txt` or feed is covered without anyone remembering. Emitted precache manifest
is now exactly `["/","/index.html","/manifest.webmanifest","/icon.svg","/assets/index-*.js"]`.

**T028: the plan's prediction was wrong, as Phase 1 forecast.** `appearance.spec.ts`'s FR-021 dominance
check needed **no change** — it measures `line.width` against `page.viewportSize()`. The one test that
needed re-scoping was `tuning-in-tune.spec.ts`, which asserted the *document* does not scroll
vertically. Re-scoped, not deleted: the horizontal half is unchanged and still binding, and the vertical
half became "the page opens at the tuner", with the real FR-018 geometry measured properly in
`fold.spec.ts`. The old assertion was a fair proxy while the tuner was the only thing on the page; it was
never what FR-018 says.

**Measurements**

| | Baseline (T003) | After Phase 2 | **After Phase 3** |
| --- | --- | --- | --- |
| Cold start, median of 5 isolated runs | 141.5 ms | 118.0 ms | **131.2 ms** |
| `dist/index.html` | 669 B | 1,735 B | **5,725 B** |
| `dist/assets/*.js` | 236,213 B | 235,516 B | **235,516 B** |
| `dist/` total, maps excluded | 241,489 B | 241,870 B | **246,051 B** |

Cold start is **unchanged within measurement noise** — 131.2 ms against a 141.5 ms baseline, well inside
the ±65 ms band T002 established. The correct statement is that adding 254 words and ~4 kB of markup had
no measurable effect on cold start, not that it improved anything.

The document is now 5,725 B, up 5,056 B from baseline: the token block (~1 kB) plus the content, its
stylesheet, and the head identity. The JavaScript bundle is unchanged from Phase 2 — none of this
feature's content reaches the app's module graph, which is the point of D1.

---

## Phase 4: User Story 2 — A shared link shows what the tool is (P2)

**Goal**: Pasting the link produces a preview card with name, summary, and a legible image instead of a
naked URL.

**Independent Test**: Run the built page through link-preview tooling and confirm a card renders with
title, description, and a correctly sized image.

### Tests (write first, observe failing)

- [X] T030 [P] [US2] Extend `apps/web/e2e/metadata.spec.ts` to assert `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `twitter:card`, `twitter:image` are all present and non-empty (P6) — all fail today
- [X] T031 [P] [US2] Assert `og:image` is an **absolute** URL that returns `200` and is a PNG of exactly 1200 × 630 (P7) — several preview generators do not resolve relative image URLs and fail silently, so absoluteness is the assertion that matters
- [X] T032 [P] [US2] Assert `og:title` equals `<title>` and `og:description` equals the meta description (P8) — structurally true by construction, asserted anyway because a later edit could undo it
- [X] T033 [P] [US2] Assert `apps/web/public/manifest.webmanifest` carries `name`, `short_name`, `description`, `lang`, `dir`, `categories`, and icons (FR-080)

### Implementation

- [X] T034 [US2] Create `apps/web/scripts/generate-og-image.mjs` rendering an HTML template at 1200 × 630 with the **installed** `@playwright/test` Chromium and screenshotting to `apps/web/public/og-image.png` (D7) — no literal colours, no new dependency. **Palette and headline are lifted from `dist/index.html`**, not imported: a `.mjs` script cannot import `.ts` on the repo's Node 20 floor
- [X] T035 [US2] Add an `og:image` script to `apps/web/package.json`, run it, and commit `apps/web/public/og-image.png` — generated-and-committed, following the `apps/web/e2e/fixtures/generate.mjs` precedent
- [X] T036 [US2] Add the preview identity tags to `apps/web/index.html` via `siteIdentity()`, reading `title`/`description` from `apps/web/src/content.ts` and the origin from `%VITE_SITE_URL%` so absoluteness is structural (P6–P8)
- [X] T037 [P] [US2] **Generated, not edited** — `public/manifest.webmanifest` was deleted and `siteIdentity()` now emits it from `content.ts`, so the description cannot drift from the page's. Complete the manifest per T033 (FR-080)
- [X] T038 [US2] Run the full e2e suite and confirm T030–T033 pass

**Checkpoint**: US1 and US2 both work independently. A shared link renders a card.

### Phase 4 results — 2026-08-04

**All gates green. e2e 95 passed, 0 failed.** lint, format, typecheck, unit 430, `verify:offline` and
`verify:build-output` all clean. No new dependency.

The page now carries the full preview identity, and `apps/web/public/og-image.png` is generated and
committed at 1200×630 (21,685 B).

**The manifest is now generated, not static (T037).**

`public/manifest.webmanifest` was deleted; `siteIdentity()` emits it from the same `content.ts`
constants the page and the card use. The old file restated the description in its own words — "A
chromatic guitar tuner. Pluck a string, see the note. Works offline." against the page's own sentence —
which is precisely the drift this feature exists to remove. Someone installing the app and someone
reading a shared link should not be told two different things.

It is served in development by the same middleware as `robots.txt` and `sitemap.xml`, so the test asserts
the served document rather than a file on disk. Worth noting for T027's rule: `.webmanifest` is
deliberately **not** excluded from the precache — unlike the crawl directives it is part of the app, and
the emitted manifest still appears in `sw.js`'s precache list alongside `/index.html` and `/icon.svg`.

**The generator reads the built page rather than importing anything (T034).**

D7 asks for the palette to come from `@chromatic-tuner/tokens` with no literal colours. A `.mjs` script
cannot import either the tokens or `content.ts`: importing a `.ts` module needs Node's type stripping,
and **CI pins Node 20** while this machine runs 24. Writing the generator against local Node would have
produced a script that works here and fails for anyone on the repo's stated floor.

So it lifts the `<style data-chromatic-tuner="tokens">` block wholesale out of `dist/index.html` and
drops it into the template, then reads the headline from the built `<h1>`. Both the palette and the copy
come from the same generated document the app ships, on any Node version, with nothing duplicated. The
cost is a documented precondition — run `pnpm build` first — and the script says so if `dist/` is
missing.

**Three assertions timed out instead of failing, and that was worth fixing (T030–T032).**

The first run of the preview tests failed correctly but took **32.9 s**, with three of them reporting
`locator.getAttribute: Test timeout of 30000ms exceeded`. A Playwright locator *waits* for its element,
so a missing meta tag costs the full timeout and then reports nothing about which tag was absent.

Rewritten to read through `page.evaluate`, the same failures report instantly and name the item:

```
missing or empty preview tags: og:title, og:description, og:image, og:url,
  og:type, og:site_name, twitter:card, twitter:image
the manifest is missing: lang, dir, categories
```

Whole file now runs in **3.6 s**. This matters beyond speed: FR-084 and T048 require a failing gate to
name what is missing, and a timeout cannot. Any assertion in this feature that reaches for a locator on
something that may not exist has the same problem.

**The image is checked by header bytes, not by decoding (T031).** PNG stores width and height as
big-endian `uint32` at offsets 16 and 20, after the 8-byte signature and the `IHDR` chunk header. Reading
those also proves the file really is a PNG — `og:image has a value` would pass on a 404, a relative URL,
or a 300×300 icon, and all three render a card with no image or a uselessly cropped one.

**Measurements**

| | Baseline (T003) | After Phase 3 | **After Phase 4** |
| --- | --- | --- | --- |
| Cold start, median of 5 isolated runs | 141.5 ms | 131.2 ms | **108.7 ms** |
| `dist/index.html` | 669 B | 5,725 B | **6,578 B** |
| `dist/assets/*.js` | 236,213 B | 235,516 B | **235,516 B** |
| `dist/` total, maps excluded | 241,489 B | 246,051 B | **268,747 B** |

Cold start remains **unchanged within measurement noise**: 108.7 ms against a 141.5 ms baseline is a
32.8 ms move, inside the ±65 ms band T002 established, and three of this phase's five samples sat within
2 ms of each other while one outlier hit 167 ms. Nothing in this phase touches the runtime path at all —
the JavaScript bundle is byte-identical for the third phase running.

`dist/` grew 22,696 B, almost entirely the preview image (21,685 B). It is a crawler- and
platform-facing asset that no user of the app ever downloads: it lives in `public/`, so it never enters
Rollup's bundle object and is therefore never precached.

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
