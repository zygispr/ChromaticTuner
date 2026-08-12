---

description: "Task list for 007-circular-tuner-display"
---

# Tasks: Circular Tuner Display

**Feature**: `007-circular-tuner-display` · **Created**: 2026-08-12

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/tuner-display.md](./contracts/tuner-display.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001`–`006`: record deviations, defects, and
measurements here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE. Every test task below is written first and **observed failing**
before the implementation exists. If a test passes on its first run, the test is wrong — fix the test
before touching the implementation.

**The hazard this feature carries: almost every obvious assertion about a rotating needle passes on a
broken implementation.** A dial has two failure modes that a still frame cannot show (the path the
needle took) and one that a computed style cannot show (which element the transform landed on). Read
this table before writing an assertion.

| Tempting assertion | Why it passes on a broken build |
| --- | --- |
| `expect(dialAngleDegrees(midiC, 0)).toBe(0)` | C is the **fixed point** of both defects this could have. An anticlockwise dial and a clockwise one agree at C; so do a correct cents term and a sign-flipped one. Assert **A = 270°** (mirroring makes it 90°) and assert a **non-zero cents** case (**G2**, **G4**). |
| `expect(dialAngleDegrees(midiA, 25)).toBeCloseTo(277.5)` alone | Passes for an implementation that ignores pitch class entirely if you only ever test one note. Test at least four pitch classes spread around the circle. |
| `expect(unwrapDegrees(0, 10)).toBe(10)` | **Passes for `unwrapDegrees = (_, t) => t`** — the identity, which is the unfixed code. The only rows that discriminate are the wrapping ones: `unwrapDegrees(344.7, -14.7) === 345.3` (**G10**). |
| `expect(unwrapDegrees(p, t) % 360).toBeCloseTo(t % 360)` | Congruence (**G8**) is satisfied by the identity too. G8 and G9 must both be asserted; neither alone is a test of anything. |
| "play a tone, assert the needle's resting angle" | **The wrap defect is entirely about the path, not the endpoint.** A needle that spins 359° the wrong way arrives at exactly the right angle. Assert the **accumulated** value across a boundary crossing, or sample mid-transition. V61 is a human check for the same reason. |
| `getComputedStyle(needle).transform` matches the expected matrix | **Passes on the D5 defect.** Putting the transform on the needle instead of the wrapper writes the identical matrix — it is applied to an element whose centre is not the dial's centre, so the needle orbits its own midpoint while the matrix reads perfectly correct. Assert the **needle tip's bounding box in page coordinates**, the way `helpers.ts:markerOffsetPx` measures real boxes rather than trusting the transform. |
| `expect(normalizePreferences({ tunerDisplay: 'dial' }).tunerDisplay).toBe('dial')` | Passes with **no validation at all** — a pass-through would also accept `'circle'` and `'Line'`. The discriminating rows are the near-misses (**G16**). |
| "the record round-trips through the adapter" | Passes while `normalizePreferences` drops a neighbouring field. Assert the **other three preferences survive** an unusable `tunerDisplay`, and vice versa (**G17**). |
| "Settings shows a Dial button" | Passes for a button wired to nothing. Assert the **display actually changes** and that `data-testid="tuning-dial"` replaces `tuning-line`. |
| "switching to Dial does not stop capture" (component test with a mock source) | Passes trivially if the mock is never asked to stop. Assert `audioSource.start` was called **exactly once** across the switch, and that `stop` was not called at all (**G20**). |
| "`allocation.test.ts` still passes" | It will — right up until someone "tidies" the third argument into an object. The task is to run it **unmodified**; changing that file to accommodate this feature is the defect, not the fix (**G14**). |
| "the dial's colours meet contrast" measured from the tokens | The palette test cannot see an `opacity` applied at a call site, and Axe's `color-contrast` rule covers **text only** — so a dimmed needle passes both. This has shipped twice. Measure the **composited** result (**G22**, **V67**). |
| a mobile test asserting the needle's `rotate` style value | `jest-expo` has no layout engine, so it cannot tell the wrapper apart from the needle. **Mobile has no automated defence against D5** — see the recorded gap below. |

**Two guarantees no automated test can currently distinguish**, recorded here as code-review
obligations rather than pretended into tests:

1. **D5 on mobile.** `jest-expo` does not lay out or composite, so a transform on the needle and a
   transform on the wrapper produce identical trees. The only gate is the paired screenshot in T052
   and review. Web *can* catch it (T031), so the web test is written first and the mobile component is
   built to match the shape web proved.
2. **G11's unbounded accumulation.** A player would have to sweep five octaves for the difference
   between accumulating and re-normalising to `[0, 360)` to become visible on screen. The unit test
   pins the function; nothing pins the *call site* keeping its accumulator across renders.

---

## Phase 1: Setup

**Purpose**: record the starting state and the two numbers Principle V will be measured against, before
anything changes.

- [X] T001 Confirm all merge gates pass on a clean checkout of this branch and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. Note whether `pnpm verify:listing` is still red only for the missing Android screenshots it has been red for since `005`.
- [X] T002 [P] Audit the existing suites this feature can break and record the list in this file — `packages/core/tests/session.test.ts` (asserts `onReading` handler arguments and will fail on the third one), `packages/core/tests/preferences.test.ts` and `packages/core/tests/port-contracts.test.ts` (assert the exact stored record shape), `packages/react/tests/use-preferences.test.tsx`, `apps/web/e2e/settings.spec.ts` (a new group changes the sheet's control count and tab order — `006`'s focus trap counts focusables), `apps/web/e2e/a11y.spec.ts`, `apps/web/e2e/layout-stability.spec.ts`, `apps/mobile/__tests__/settings.test.tsx`, `apps/mobile/__tests__/settings-modality.test.tsx`
- [X] T003 [P] Record the "before" performance numbers for the horizontal line in this file — Chrome DevTools Performance trace over 30 s of continuous tuning on `apps/web`, reporting p95 frame time and dropped frames. Principle V requires before/after for a render-loop change, and "before" cannot be captured after the dial lands.
- [X] T004 [P] Capture "before" screenshots of the tuner in light and dark on both platforms into `specs/007-circular-tuner-display/screenshots/` — the line must be pixel-identical afterwards, since FR-149 promises a player who never opens Settings sees no change at all. **Web only; see the deviation under T004 below — the mobile half is carried to T059.**

**Checkpoint**: baselines recorded, blast radius known. ✅ (2026-08-12)

### T001 — baseline gate run (2026-08-12, clean tree at `d8907ac`)

| Gate | Result |
| --- | --- |
| `pnpm lint` | pass, 0 warnings |
| `pnpm format:check` | pass **after** the fix below |
| `pnpm typecheck` | pass — 5 projects (`core`, `tokens`, `react`, `web`, `mobile`) |
| `pnpm test` | **483 passed**, 20 files, 7.97 s (budget 60 s) |
| `pnpm test:coverage` | 98.53% stmts / 95.23% branches / 97.40% funcs / **100% lines** — clears 90/90/85 |
| `pnpm test:e2e` | **156 passed**, 48.1 s |
| `pnpm --filter @chromatic-tuner/mobile test` | **121 passed**, 17 suites, 7.68 s |
| `pnpm build` | pass — 239.00 kB js, gzip 75.89 kB |
| `pnpm verify:listing` | **red, and red for exactly the reason it has been since `005`** |

`verify:listing` reports 3 problems, all the same missing artefact: no
`listing/assets/screenshots/android/{light,dark}/`, and therefore "android is missing a light
screenshot". Everything else passes — 25 claim fields, 8 fields, 41 vocabulary strings, 7 claims × 2
stores, 5 artwork scans, 7 derived identity values. **No new failure**, and no artwork drift.

**Deviation — `format:check` was red on arrival, through no fault of the tree.** The Playwright and
Chrome DevTools MCP browser tools write page snapshots and console logs to `.playwright-mcp/`, and the
three `.yml` snapshots there failed `prettier --check`. That directory was untracked and unignored, so
*any* session that drives the app through those tools turns a merge gate red. Fixed at the root rather
than by deleting the files: `.playwright-mcp/` added to both `.prettierignore` and `.gitignore`. This
is unrelated to the dial and would have bitten any future feature the same way.

**Note — local Node is v24.14.0**, while CI pins Node 22 deliberately (research D1 of `004`: Node 22
still lacks TypeScript type stripping, which is what justifies `listing/scripts/*.mjs` being
JavaScript). Nothing in this phase depends on the difference, but a green local gate is not evidence
about Node 22.

### T002 — blast radius, and three corrections to this task list

The audit found the task list itself wrong in three places. Recorded here and fixed in the tasks above.

| Claim in the original task | What the code actually says |
| --- | --- |
| `session.test.ts` "will fail on the third one" | **Wrong, and dangerously so.** Its handlers are written `(cents, clarity) => …` and `(cents) => …` (`:168`, `:385`, `:511`, `:527`, `:542`). A function that accepts fewer parameters is assignable to a wider signature, so **every one of these keeps passing** when `ReadingHandler` gains `midi`. There is no arity failure to observe. T009 is reworded: the third argument is invisible to the existing suite and needs assertions written specifically for it — which is the "passes on a broken build" hazard in its purest form. |
| `settings.spec.ts` asserts control count and tab order | **Wrong file.** `settings.spec.ts` contains no `Tab` assertions at all. The focus trap lives in `a11y.spec.ts` — `FOCUSABLE_SELECTOR` at `:561`, `sheetControls()` at `:564`, V52 at `:588`. T034 is retargeted. |
| adding a group will break the focus-trap count | **It will not.** `sheetControls()` reads the list from the DOM on every use and asserts `length > 2` rather than `=== 8`; its own comment says this is "K5 applied to the test itself — the assertion keeps its meaning if the sheet ever gains or loses a control". `006` already paid for this. T034 becomes a confirmation, not a repair. |

What genuinely breaks or needs attention:

- **`packages/core/tests/preferences.test.ts`** — three whole-record `toEqual({…})` assertions
  (`:72`, `:165`, `:260`). These **will** fail the moment `tunerDisplay` exists, which is correct and
  wanted.
- **`packages/core/tests/port-contracts.test.ts`** and the mobile/web adapter contract tests — same
  exact-shape exposure through the shared suite.
- **`packages/react/tests/use-preferences.test.tsx`** — publishes and asserts the preference surface.
- **18 references to line-specific test ids** (`tuning-line`, `tuning-track`, `tuning-marker`,
  `tuning-rule`, `in-tune-zone`) across **8** web e2e files: `helpers.ts`, `a11y.spec.ts`,
  `appearance.spec.ts`, `fold.spec.ts`, `layout-stability.spec.ts`, `metadata.spec.ts`,
  `performance.spec.ts`, `tuning-in-tune.spec.ts`. All keep passing because the line stays the
  default — but each one silently encodes "the tuner draws a line", so any that is ever run with the
  dial selected will fail. Two are load-bearing for this feature: `performance.spec.ts:38` observes
  mutations on `[data-testid="tuning-track"]`, and `:161`/`:181` measure cold start by waiting for
  `[data-testid="tuning-line"]`. **The dial needs its own versions of both**, or its render loop and
  cold start go unmeasured.
- **`apps/web/e2e/a11y.spec.ts:528`** reads `[data-testid="tuning-tick"]` for the composited tick
  contrast — the pattern T049 must copy for the dial.
- **Mobile**: `apps/mobile/__tests__/settings.test.tsx` and `settings-modality.test.tsx` enumerate the
  settings screen.

### T003 — "before" performance baseline

**Deviation from the task as written, and an improvement on it.** The task called for a manual Chrome
DevTools trace. The repo already owns a better instrument: `apps/web/e2e/performance.spec.ts` samples
real presented frames through `requestAnimationFrame` across 20 s of live tuning against a fixture WAV,
prints p50/p95/max, and is already a CI gate. A hand-driven DevTools trace would be less reproducible
and would not be comparable to what T055 will run. Three consecutive runs, `e2-in-tune.wav`:

| Run | p50 | p95 | max | cold start |
| --- | --- | --- | --- | --- |
| 1 | 8.3 ms | 9.1 ms | 10.5 ms | 276.5 ms |
| 2 | 7.9 ms | 10.7 ms | **27.7 ms** | 294.1 ms |
| 3 | 8.3 ms | 9.1 ms | 11.3 ms | 265.5 ms |

**Baseline for T055: p50 ≈ 8.2 ms, p95 ≈ 9.1–10.7 ms, cold start ≈ 265–294 ms** against budgets of
17.5 ms / 33.4 ms / 2000 ms. Run 2's 27.7 ms max is machine load, not the app — it is the reason three
runs were taken rather than one, and it is why T055 must compare **p50 and p95**, not `max`. The
appearance-switch measurement tracks the session number to within 0.1 ms, as expected.

### T004 — "before" screenshots

Captured four web shots into `specs/007-circular-tuner-display/screenshots/`:
`before-web-tuner-{light,dark}.png` and `before-web-settings-{light,dark}.png` (the sheet is
photographed too, since 007 adds a row to it).

Driven by a throwaway Playwright script using the same fake-audio flags as
`apps/web/e2e/helpers.ts:audioArgs`, replaying `e2-in-tune.wav` at a 1200×900 viewport, with appearance
set through the app's own Settings sheet rather than by emulating `prefers-color-scheme`. **The
resulting state is deterministic — E2, "+0 cents", in tune, marker centred — so T052's comparison can
be a genuine pixel diff.** Reproduce with the same fixture, viewport and route.

**Deviation — the mobile half is not captured, and one part of it cannot be.**

- **Android is impossible on this machine**: there is no Android SDK (`~/Library/Android/sdk` absent).
  This is the same gap that has kept `verify:listing` red since `005`, now confirmed as a machine
  limitation rather than an oversight.
- **iOS is possible but was deliberately deferred.** Xcode 26.6 and five iPhone simulators are
  available and `apps/mobile/ios/` is already prebuilt. It was not run because (a) nothing before
  Phase 5 changes what mobile draws — Phase 2 touches `packages/core` and `packages/react` but alters
  no mobile rendering — so a baseline taken now and one taken before T045 are the same picture, and
  (b) the simulator has no fake-audio device, so it captures the room rather than a fixture and the
  shot is **not** reproducible the way the web ones are. That second point matters for T052: the
  mobile comparison must be structural, not a pixel diff.
- `005`'s `mobile-tuner-{light,dark}.png` cannot be reused as the baseline: three commits have changed
  the mobile ruler since it was taken — `5f4bedd` (dimmed below the contrast floor), `ca8ca78` (a
  different drawing from web), `38f4caa` (320 pt wide on every phone).

Carried forward as **T059**, which must run before T045.

---

## Phase 2: Foundational

**Purpose**: everything the dial needs to exist. **Blocks all three user stories.** No presentation
work starts until this phase is green.

### Angle maths (core)

- [X] T005 [P] Write failing tests for `dialAngleDegrees` in `packages/core/tests/dial.test.ts` covering **G1–G6** — C at 0°, A at 270° (not 90°, which is the mirror), octave invariance `f(m, c) === f(m + 12, c)`, the `0.3 × cents` displacement with sharp clockwise, `|angle − 30 × pitchClass| ≤ 15` for every reading, and the boundary identity `f(m, +50) === f(m + 1, −50)`. Use the worked table in [data-model.md §4](./data-model.md) as fixtures. Observe every one fail.
- [X] T006 [P] Write failing tests for `unwrapDegrees` in `packages/core/tests/dial.test.ts` covering **G7–G11** — congruence mod 360, `|result − previous| ≤ 180`, the `(344.7, −14.7) → 345.3` crossing, and a monotone five-octave sweep reaching ~1800° without renormalising. Confirm the identity function fails at least three of them before writing any implementation.
- [X] T007 Implement `dialAngleDegrees` and `unwrapDegrees` in `packages/core/src/notes/dial.ts`, reusing the existing `pitchClassOf`. No DOM, no React, no platform import — this file compiles against ES2022 only.
- [X] T008 Re-export both functions from `packages/core/src/index.ts` and confirm `pnpm test:coverage` still clears 90% lines / 90% functions / 85% branches on `packages/core`.

### The reading channel (core)

- [X] T009 Write failing tests for the third argument in `packages/core/tests/session.test.ts` covering **G12** and **G13** — a live reading publishes `(cents, clarity, midi)` with the analyzer's MIDI number, and a withdrawal publishes `(null, 0, null)` exactly once on the edge. **Corrected at T002**: the existing handlers are written `(cents, clarity) => …` and `(cents) => …`, and a narrower function stays assignable to a wider signature, so **every existing assertion in this file keeps passing whether `midi` is published correctly, published as `undefined`, or not published at all**. The suite is blind here by construction; only assertions written against the third parameter can see it. Capture the handler with a spy and assert `toHaveBeenCalledWith(cents, clarity, midi)` on the full argument list.
- [X] T010 Extend `ReadingHandler` to `(cents: number | null, clarity: number, midi: number | null) => void` in `packages/core/src/tuning/session.ts`, publish `reading.midi` from `handleFrames`, and publish `null` from `withdrawReading`. Do not restructure the channel into an object — see **G14** and the allocation hazard above.
- [X] T011 Run `pnpm vitest run packages/core/tests/allocation.test.ts` **unmodified** and record the result in this file (**G14**). If it needs editing to pass, the implementation is wrong.
- [X] T012 Confirm `TuningLine` still compiles and behaves on both platforms with its two-parameter handler untouched (**G15**) — `apps/web/e2e/marker-rest.spec.ts` and `apps/mobile/__tests__/marker-rest.test.tsx` are the ones that would notice.

### The preference (core)

- [X] T013 [P] Write failing tests for the stored field in `packages/core/tests/preferences.test.ts` covering **G16–G18** — `'line'` and `'dial'` accepted; absent, `null`, `42`, `''`, `'Line'`, `'circle'`, `'circular'` all yielding `'line'`; a pre-007 record loading with reference pitch, accidental style and appearance intact; and `PREFERENCES_SCHEMA_VERSION` still `1`.
- [X] T014 [P] Write a failing test in `packages/core/tests/preferences.test.ts` for **G17** specifically — an unusable `tunerDisplay` must not disturb the other three fields, and an unusable `a4Hz` must not disturb `tunerDisplay`. This is the guarantee that silently weakens each time a field is added.
- [X] T015 Add `TunerDisplay` and `isTunerDisplay` to `packages/core/src/types.ts`, following `isAppearancePreference`'s exact-match, case-sensitive shape.
- [X] T016 Add `readonly tunerDisplay: TunerDisplay` to `StoredPreferences` in `packages/core/src/ports/preferences-store.ts`, with a comment recording that the **port is unchanged** — one more field inside a blob both adapters already treat as opaque.
- [X] T017 Add the default and the repair clause in `packages/core/src/preferences.ts` — `DEFAULT_PREFERENCES.tunerDisplay = 'line'`, destructured and repaired independently alongside the other three. **Leave `PREFERENCES_SCHEMA_VERSION` at 1** and record why in a comment (an absent field is not an incompatible shape; research **D9**).
- [X] T018 Add `tunerDisplay` round-trip and repair checks to `packages/core/testing/port-contract-tests.ts` (**G19**) and observe them fail for every implementation — `localStorage`, AsyncStorage, and the in-memory double — via `pnpm test` and `pnpm --filter @chromatic-tuner/mobile test`.
- [X] T019 Make T018 pass. Expect **no adapter changes**; if either adapter needs one, that is a finding worth recording here, because it means something was not treating the record as opaque.

### The shared React layer

- [X] T020 [P] Write failing tests in `packages/react/tests/use-preferences.test.tsx` for `tunerDisplay` and `setTunerDisplay` — published from the provider, optimistic in-memory update, persisted through the same `apply()` path, `persistenceFailed` set when the store throws, and `reset()` returning to `'line'`.
- [X] T021 [P] Write a failing test in `packages/react/tests/use-tuner.test.tsx` for `subscribeToReading`, asserting all three arguments arrive and that `subscribeToCents` keeps its one-argument signature (**G15**).
- [X] T022 Publish `tunerDisplay` and `setTunerDisplay` from `packages/react/src/TunerProvider.tsx` and `packages/react/src/usePreferences.ts`, following `setAccidentalStyle` exactly.
- [X] T023 Add `subscribeToReading` to `packages/react/src/useTuner.ts`, forwarding all three scalars, and leave `subscribeToCents` exactly as it is.

**Checkpoint**: the core knows about dials but nothing draws one. ✅ (2026-08-12)

| Gate | Before Phase 2 | After Phase 2 |
| --- | --- | --- |
| `pnpm test` | 483 | **517** (+34) |
| `pnpm --filter @chromatic-tuner/mobile test` | 121 | **122** (+1, the G19 check against AsyncStorage) |
| `pnpm test:e2e` | 156 | **156**, unchanged |
| `pnpm test:coverage` | 98.53 / 95.23 / 97.40 / 100 lines | 98.55 / 95.23 / 97.46 / **100 lines** |
| `pnpm lint`, `format:check`, `typecheck` | pass | pass |

**The "behaves identically" half of this checkpoint was measured, not asserted.** The T004 capture was
re-run and compared byte-for-byte: `tuner-dark`, `settings-light` and `settings-dark` are **identical**
after decompression. `tuner-light` differs by 43 bytes of 3,240,900 — decoded, that is **13 sub-pixels
at x = 603-604, y = 458-528**, which is the anti-aliased right edge of the tuning marker and nothing
else. The reading is live, so a fraction of a cent that still prints "+0" moves the marker a fraction
of a pixel. Phase 2 changed no rendering.

**This refines T052.** "Pixel-identical" is achievable to within the marker's own anti-aliased edge,
not absolutely. T052 must either allow a small per-pixel tolerance or exclude the marker's two-pixel
column — a strict `cmp` will fail on a build where nothing has changed.

### T005-T008 — the angle maths

**The tests were proved to discriminate before the real implementation existed**, which for this
feature is the whole game. A deliberately defective `dial.ts` was written first — cents sign flipped,
and `unwrapDegrees` as the identity function — and run:

| | Result |
| --- | --- |
| Failed | **6**: the two G4 displacement tests, G6, and G9/G10/G11 |
| **Passed** | **8** — every C-based assertion, every pitch-class assertion, both purity tests |

Eight green tests against an implementation that draws the dial mirrored and spins the needle a full
turn backwards at the top. That is the hazard table's claim, demonstrated rather than argued.

**Defect found in the test, not the code.** `unwrapDegrees(-14.7, 344.7)` was written expecting
`-14.7` — the *input* typed again in place of the answer, which is easy when the two are 0.6 apart.
The correct value is `-15.3`. Caught by running it.

**Contract G6 was wrong and has been corrected.** It said the two sides of a boundary are "the same
angle". Eleven of the twelve boundaries are equal as raw numbers; the twelfth is not. B +50 is `345°`
and C -50 is `-15°` — the same direction, **exactly 360 apart**. G6 now states congruence modulo 360,
and a second test pins the B/C case explicitly, because that discrepancy is precisely what §2 exists
to resolve.

### T009-T012 — the reading channel

T002's correction held exactly. The three new tests fail on **arity** (`expected [ …2 items ] to have
a length of 3`) only because they spy on `handler.mock.calls`; every pre-existing handler in the file
is written `(cents, clarity) => …` and none of them noticed the change in either direction.

- **T011**: `allocation.test.ts` passes **unmodified** — `git diff --stat` on it is empty (G14).
- **T012**: G15 confirmed on both platforms — `apps/web/e2e/marker-rest.spec.ts` (3 passed) and
  `apps/mobile/__tests__/marker-rest.test.tsx` (4 passed), with `TuningLine` untouched on either.

### T013-T019 — the preference

**No adapter needed changing**, which is research D9's claim checked rather than assumed. The mobile
suite gained exactly one test (121 → 122): the new G19 check running against AsyncStorage, passing
with no adapter edit.

**A test that passes immediately is not evidence, so G19 was mutation-tested.** The in-memory store was
temporarily changed to `this.value = { ...prefs, tunerDisplay: 'line' }` — the exact defect the check
exists for, an adapter that silently drops the user's choice. Result: **2 failures**, G19 among them.
Restored, and `git diff` on that file is empty.

**Finding — one adapter is not under contract at all.** `apps/web`'s `LocalStoragePreferences` runs
the port contract suite **nowhere**: `pnpm test` is Vitest over `packages/*` only, and `apps/web` has
no unit-test project, so its sole coverage is end-to-end through a real browser. The adapter is a
whole-record `JSON.stringify`/`JSON.parse` and is genuinely opaque, so 007 needs nothing from it — but
contract G19 claimed `localStorage` was checked and it was not. **G19 has been corrected.** Closing the
gap means giving `apps/web` a unit-test project, which is a build-config change outside this feature.

**The exact-shape exposure was larger than T002 predicted.** T002 found 3 whole-record assertions;
adding a required field broke **13 stored-record literals across 5 files** — `preferences.test.ts` (4),
`port-contracts.test.ts` (2), `use-preferences.test.tsx` (2 + 5), and three mobile suites
(`async-storage-preferences.contract.test.ts`, `settings.test.tsx`, `first-frame.test.tsx`). All are
type errors rather than silent passes, which is the outcome to want: `StoredPreferences` is a closed
record, so the compiler enumerates every construction site.

### T020-T023 — the shared React layer

`tunerDisplay` and `setTunerDisplay` follow `setAccidentalStyle` exactly, and `subscribeToReading` is
added beside `subscribeToCents` rather than replacing it (G15). One test is worth naming: *"leaves the
other three preferences alone when it changes"* — the setter spreads the whole record, and a spread
that dropped a sibling would be invisible to any test that reads back only the field it just set.

---

## Phase 3: User Story 1 — Tune against a circular dial (P1) 🎯 MVP

**Goal**: a player can pick the dial on the web and tune with it.

**Independent test**: select the dial, feed the tuner a tone at a known offset from a known note, and
confirm the needle sits at the angle that offset predicts, on the right segment, reaching in-tune at
the segment's exact centre. V60–V63.

- [X] T024 [US1] Add a `needleAngleDeg` helper to `apps/web/e2e/helpers.ts` that derives the needle's angle from its **rendered bounding box in page coordinates**, not from its computed transform — the same reason `markerOffsetPx` measures real boxes. This helper is what makes T031 able to see the D5 defect.
- [X] T025 [P] [US1] Write failing e2e tests in `apps/web/e2e/dial.spec.ts` for the angle table in V60 — A4 at 270°, D3 at 60°, D3 ± 25 cents at 67.5°/52.5°, C4 at 0° — using the generated WAV fixtures under `apps/web/e2e/fixtures`.
- [X] T026 [P] [US1] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for the boundary crossing (**G10**, V61) — sweep through twelve o'clock and assert the needle's accumulated angle moves a few degrees, never ~359 the other way. Assert the path, not the endpoint.
- [X] T027 [P] [US1] Write failing e2e tests in `apps/web/e2e/dial.spec.ts` for the lapsed needle (**FR-162**, **FR-163**, V62) — no needle at all before the first reading; after a reading lapses, the needle holds its exact previous angle and takes the `noReading` colour. Mirror the structure of `apps/web/e2e/marker-rest.spec.ts`, which pins the line's opposite behaviour.
- [X] T028 [P] [US1] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for segment labelling (**FR-155**, **FR-156**, V63) — twelve labels, C at the top, ascending clockwise, and the five accidentals respelling with the flats preference while the seven naturals and the needle do not move.
- [X] T029 [US1] Build `apps/web/src/components/molecules/TuningDial.tsx` — rim, twelve boundary ticks at `15° + k × 30°`, twelve labels positioned by trigonometry and drawn upright, an active-segment centre tick, and the needle inside a dial-sized concentric wrapper. The wrapper is what rotates (**G21**, research **D5**); write its transform imperatively from `subscribeToReading`, never through React state.
- [X] T030 [US1] Keep the unwrap accumulator in a `useRef` beside the transform write in `TuningDial.tsx`, never in React state — it is written ~43 times a second (**data-model §5**).
- [X] T031 [US1] Run T024–T028. Deliberately verify the suite catches the D5 defect by temporarily moving the transform onto the needle element; confirm T025 fails, then revert. Record the observed failure in this file — this is the one check that proves the geometry tests measure geometry.
- [X] T032 [US1] Render the dial or the line from `apps/web/src/components/organisms/TunerDisplay.tsx` with a ternary on `tunerDisplay`. Two sibling components, no shared "meter" abstraction (research **D1**). `NoteLabel`, `CentsReadout` and `DirectionCue` stay exactly where they are (**FR-168**).
- [X] T033 [US1] Add the **Tuning display** group to `apps/web/src/components/organisms/SettingsSheet.tsx`, between Accidentals and Appearance, with **Line** and **Dial** buttons. Reuse the existing group treatment verbatim — `role="group"` + `aria-labelledby` (never fieldset/legend; Safari mis-lays-out the first layout), `aria-pressed`, the `selected` tint **fill** rather than a heavier `text` border, `flex: 1`, and `a11y.minTouchTarget`.
- [X] T034 [US1] Confirm `006`'s focus trap still cycles correctly with two more focusables in the sheet. **Retargeted at T002**: the trap's tests are in `apps/web/e2e/a11y.spec.ts` (`FOCUSABLE_SELECTOR` `:561`, `sheetControls()` `:564`, V52 `:588`) — `settings.spec.ts` has no `Tab` assertions at all. `sheetControls()` already reads the list from the DOM on every use and asserts `length > 2` rather than a hard-coded 8, so this is expected to pass unchanged; run it and record that it did, rather than editing it.

**Checkpoint**: US1 is independently shippable on web. ✅ (2026-08-12)

| Gate | After Phase 2 | After Phase 3 |
| --- | --- | --- |
| `pnpm test:e2e` | 156 | **170** (+10 dial, +4 for defect 1) |
| `pnpm test` | 517 | 517, unchanged |
| `pnpm --filter @chromatic-tuner/mobile test` | 122 | 122, unchanged |
| `pnpm lint`, `format:check`, `typecheck` | pass | pass |

V60–V63 pass, and the dial was looked at in both appearances rather than only
asserted: D3 +25 cents puts the needle just clockwise of D's centre tick, with the
D label highlighted, twelve labels upright, C at the top and the boundary ticks
between segments. The settings row sits between Accidentals and Appearance.

### T024 — two instruments, not one

**Deviation, and a necessary one.** The task specified a single `needleAngleDeg`.
Two were written, because the two defects this feature can carry are invisible to
each other's instrument:

| Helper | Reads | Catches |
| --- | --- | --- |
| `needleAngleDeg` | the needle's rendered bounding box, in page coordinates | the transform landing on the wrong element (D5) |
| `needleAccumulatedDeg` | the wrapper's inline `rotate(...)` value | a missing unwrap (G10) |

The bounding box is bounded to `[0, 360)` and cannot distinguish 345 from 705, so
it is blind to the wrap. The inline value says which number was handed to the
animation but nothing about where the needle was drawn. Asserting only one of
them leaves half the feature unmeasured.

### T025–T028 — six spec files, and seven new fixtures

**Deviation: one spec file became six.** `helpers.ts` already records why —
`launchOptions` cannot be set per `describe`, because Playwright forces a new
worker for it — so the fixture decides the file. This is the convention
`tuning-flat` / `tuning-sharp` / `tuning-in-tune` already follow. The result is
`dial`, `dial-mirror`, `dial-detune`, `dial-silent`, `dial-rest`, `dial-sweep`.

Seven fixtures added to `generate.mjs`, chosen for their ANGLE rather than for the
guitar. Every existing fixture is E2, which is pitch class 4 and therefore 120° —
one angle, which cannot tell a correct dial from a mirrored one:

- `c4`, `d3`, `d3-sharp-25`, `d3-flat-25`, `a4` — four pitch classes spread round
  the circle. **`a4` is the one that matters**: A is 270°, and a mirrored dial puts
  it at 90° while agreeing with a correct one at C, at the octave, and on every
  assertion about label order.
- `b3-to-c4-sweep` — the only boundary that can catch a missing unwrap. The other
  eleven are continuous in the raw value (C +50 and C♯ −50 are both 15°).
- `silence` — FR-163 needs a session in which nothing has *ever* been heard, and
  every other fixture starts sounding immediately and loops.

**Defect found in the test helper, for the second time this feature.**
`expectNeedleAt` asserted `180 - difference` where `difference` was already the
shortest angular distance, inverting the comparison. The failure read `needle at
60.0°, expected ~60°` — the message was right and the assertion was not, and the
implementation had been correct all along. Angle arithmetic in test helpers has
now been wrong twice; both times the code under test was fine.

### T031 — the mutations, which are the point of this phase

Both defects were deliberately introduced and observed:

| Mutation | Result |
| --- | --- |
| transform moved onto the needle instead of its wrapper (**D5**) | `needleAngleDeg` reads **0.0° for every tone** — 60, 67.5 and 270 all report 0. Three angle tests fail. The needle orbits its own midpoint, so its box centre never leaves twelve o'clock. |
| `unwrapDegrees` removed, raw angle straight to the transform (**G10**) | `largest backwards jump was **-359.4°**` — the exact number `contracts/tuner-display.md` §2 predicts. One test fails. |

Both restored; `git status` shows only the intended new files. Without these two
runs the suite's green would mean nothing, because a correct-looking matrix and a
correct resting angle are precisely what both defects produce.

### T032–T034 — wiring, and two canaries the T002 audit missed

T034 confirmed as predicted: `a11y.spec.ts` passes **unchanged** with two more
focusables in the sheet — 29 tests green, no edit. `sheetControls()` reads the list
from the DOM and asserts `length > 2`, which `006` wrote that way on purpose.

**But two OTHER hard-coded counts did break, and T002 found neither:**

| Canary | Was | Now |
| --- | --- | --- |
| `press-affordance.spec.ts:64` — buttons in the sheet | 7 | **9** |
| `layout-stability.spec.ts:126` — `role="group"` elements | 3 | **4**, with `Tuning display` asserted at index 2 |

Both are deliberate canaries — the first says so in its own comment — and both did
exactly their job: they failed because the sheet grew. The audit was the thing at
fault. It searched for line-specific **test ids** and never for hard-coded
**counts**, which is a different query and one worth running whenever a control is
added to a shared surface.

**Process note worth keeping.** The first full `test:e2e` run appeared to show one
failure, because the tail of the output listed only the last line of the failure
summary. Re-running with a filter that printed the whole summary showed **two**.
A truncated tail is not a result; the run has to be read, not glanced at.

### Defect 1 — the dial pushed the microphone control off the screen

**Reported by the maintainer against the committed Phase 3 build**, from a screenshot: the dial fitted,
"Start listening" did not. Found before T053/V69, which is where it would eventually have been caught.

Measured at 900px wide, both displays:

| | line | dial | delta |
| --- | --- | --- | --- |
| tuner column height | 574px | **798px** | +224px, exactly the dial's 320 minus the line's 96 |
| smallest viewport that fits | 622px | **846px** | |
| overflow at a 700px viewport | none | **122px below the fold** | |

**Root cause**: the dial sized itself from WIDTH alone — `width: 100%; max-width: 320px;
aspect-ratio: 1` — so its height was unbounded by what was actually left. `TunerLayout` is
`min-height: 100dvh` with `overflow: hidden`, so a column taller than the viewport grows and the
bottom of it leaves the screen. This is FR-018, which requires the primary display to be usable
without scrolling because the player's hands are on the instrument.

The dial is the **first element in this app whose height competes with the viewport**. Every other row
is small enough that width-only sizing was never wrong, which is why no existing component had a
pattern to copy.

**Fix**: the dial takes the smallest of its cap, the width it is given, and the height left over —
`min(320px, 100%, calc(100dvh - 526px))` — with `aspect-ratio` deriving the height so it stays square
whichever term wins. The height term must not be a percentage: percentage heights resolve against the
parent, whose height is `auto`, so it would silently do nothing.

`COLUMN_CHROME_PX = 526` is measured (574 − 96, plus the layout's 2 × 24px padding), not guessed, and
four `fits the viewport` cases at 900/800/700/640 are what will say so if a row above or below the dial
ever changes height.

**A property worth keeping**: at 622px — the viewport where the LINE's column stops fitting — the
formula leaves the dial 96px, exactly the height the line occupies. Choosing the dial can therefore
never cost a player a control that the line would have left on screen.

**Carried to T053/V69**: at a 640px viewport the dial is 114px and the twelve labels crowd — legible,
but not the metre FR-017 asks for. At 700px (174px) it reads cleanly. Scaling the label size with the
dial is the obvious next move and was deliberately NOT bundled into this fix; T053 is where legibility
at the extremes gets judged.

### Deviation from research D7 — no in-tune wedge

D7 proposed a tinted wedge on the active segment. It is not drawn, on D6's own
arithmetic: the in-tune band is ±1.5°, an arc of roughly seven pixels, so a wedge
that size is invisible and a visible one would lie about the tolerance. The target
is carried by three things instead — the twelve labels (always visible, at their
segment centres), the active segment's centre tick in the tuning-state colour, and
the active label taking that colour and bold weight. Tolerance stays where FR-160
puts it: in the colour, and in the cents readout FR-168 keeps on screen.

---

## Phase 4: User Story 2 — Pick the display, and keep the one you had (P2)

**Goal**: the choice persists, the default protects existing players, and nothing about switching
touches the microphone.

**Independent test**: change the setting, close and reopen the app, confirm the chosen display returns;
press Reset to defaults and confirm the line comes back. V58, V59, V64, V65.

- [X] T035 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for **FR-149** and V58 — a profile with no stored record shows the **line**, and the Settings group shows **Line** selected.
- [X] T036 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for **FR-152**, **G20** and V59 — switch displays while a reading is live and assert capture is uninterrupted: no permission prompt, `start` called exactly once, `stop` never called, and the cents readout never blanks.
- [X] T037 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for the upgrade path (**G18**, V64) — seed `localStorage` with a pre-007 record of `{ a4Hz: 432, accidentalStyle: 'flat', appearance: 'dark', schemaVersion: 1 }`, reload, and assert 432 Hz, flats, dark **and** the line, with every field preserved.
- [X] T038 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for the garbage path (**G16**, **G17**) — the same record with `tunerDisplay: 'circle'` loads as the line with 432/flat/dark still intact.
- [X] T039 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for reload persistence and reset (**FR-150**, V64) — select Dial, reload, assert the dial is present on the first painted frame with no flash of the line; then Reset to defaults and assert the line returns alongside 440/Sharps/Match device.
- [X] T040 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for **FR-153** and V65 — with `localStorage.setItem` stubbed to throw, switching to Dial still switches the display and raises the existing `persistence-warning`.
- [X] T041 [US2] Make T035–T040 pass. Expect most of them to pass on the Phase 2 plumbing alone; record in this file which ones needed new code and which were inherited, because "inherited" is the claim [research D9](./research.md) makes and it should be checked rather than assumed.

**Checkpoint**: US2 independently verifiable. V58, V59, V64, V65 pass. ✅ (2026-08-12)

| Gate | After Phase 7 | After Phase 4 |
| --- | --- | --- |
| `pnpm test:e2e` | 183 | **189** (+6) |
| `pnpm test` | 517 | 517, unchanged |
| `pnpm lint`, `format:check`, `typecheck` | pass | pass |

### T041 — every one of the six was inherited, and that is the finding

**Not one line of `src/` changed in this phase.** All six passed on the Phase 2 plumbing at their first
run, which is research **D9**'s claim — a fourth field in one JSON blob inherits repair, persistence,
reset and the not-saved warning for free — checked rather than assumed.

**Which is exactly the situation Principle III warns about.** Six tests that have never been observed
failing are six tests that might assert nothing at all, so each was run against a deliberately broken
build. Three mutations, all reverted with an empty `git diff`:

| Mutation | Models | Result |
| --- | --- | --- |
| `DEFAULT_PREFERENCES.tunerDisplay = 'dial'` | the default protecting existing players is wrong | **4 failed** — T035, T037, T038 and the reset half of T039 |
| the repair clause replaced by a pass-through (`tunerDisplay ?? default`, no `isTunerDisplay`) | **G16** never implemented | **1 failed** — T038, and only on the assertion added below |
| `stop(); start();` in `TunerGate`'s effect, keyed on `tunerDisplay` | a display switch rebuilding the audio source | **1 failed** — T036, `getUserMedia` **8** rather than 1 |

**The second mutation found a hole in T038 and it is worth keeping.** As first written, the garbage-path
test could not see a missing validation at all: `TunerDisplay` renders the dial for the exact string
`'dial'` and the line for *everything else*, so `'circle'` passed straight through draws precisely the
same screen as `'circle'` repaired to `'line'`. Every assertion about the tuner passes either way. The
two only part company in Settings, where the repaired value selects **Line** and the raw one selects
neither — so the test now asserts `aria-pressed` there. Without that line the mutation ran green.

**A test-only defect found by the first run, worth recording because it reads as a product bug.** T036
samples the note label on an interval to prove the readout never blanks across a switch. Sampling
starts at document start, so the buffer already held **five** placeholder samples from before the first
reading ever arrived, and the test failed a correct build saying *"the readout blanked while the
display was switched"*. Confirmed by probing the indexes — all five were samples 0–4, and
`waitForNote` returned at sample 6. The window now opens after the first reading. This is the third
time this feature has produced a test that accused correct code; all three were arithmetic or timing in
the test, never the app.

**Two assertions in T036 that are not obvious**: capture is proved by wrapping `getUserMedia` and every
track's `stop` before any page script runs, because "uninterrupted" is a claim about the stream rather
than the picture — a source torn down and rebuilt redraws faster than any assertion could see, and the
only tell is a second `getUserMedia`. And the 150ms pause after each of the seven switches is not
padding: without it the loop passes through the sampler in a handful of ticks, and "the readout never
blanked" would be a claim about almost no observation.

**T039's "no flash of the line" is asserted from a `MutationObserver` installed before any page
script**, for the same reason FR-120 puts appearance on the first painted frame: a build that mounts the
default and corrects itself once preferences load is indistinguishable from a correct one by the time
any ordinary assertion could run.

---

## Phase 5: User Story 3 — The same dial on the phone (P2)

**Goal**: the phone offers the same choice in the same words and draws the same dial.

**Independent test**: put both apps on the same reference tone with the same preferences and confirm
the segment labels, their order, and the needle angle match. V58/V59/V63/V64 on mobile, plus V70.

- [X] T059 [US3] **Run this before T045.** Capture the deferred mobile half of T004 — "before"
  screenshots of the mobile tuner in light and dark on an iOS simulator, into
  `specs/007-circular-tuner-display/screenshots/` as `before-mobile-tuner-{light,dark}.png`. Deferred
  from Phase 1 deliberately: nothing before this phase changes what mobile draws, so the picture is the
  same either way. `005`'s mobile shots are **not** a usable baseline — `5f4bedd`, `ca8ca78` and
  `38f4caa` each redrew the ruler after they were taken. Android cannot be captured on this machine at
  all (no SDK), so its half of T052 stays a release-gate formality with nothing to compare.
- [X] T042 [P] [US3] Write failing tests in `apps/mobile/__tests__/dial-geometry.test.tsx` for the dial's structure — twelve labels in ascending order starting at C, twelve boundary ticks, and the needle's rotation derived from `dialAngleDegrees`. Model it on `apps/mobile/__tests__/ruler-geometry.test.tsx`, and note in the file that this cannot see **D5** (no layout engine).
- [X] T043 [P] [US3] Write a failing test in `apps/mobile/__tests__/settings.test.tsx` for the **Tuning display** group — present, labelled identically to web, two options in the same order, `accessibilityState.selected` on the chosen one, and `a11y.minTouchTarget` honoured.
- [X] T044 [P] [US3] Write a failing test in `apps/mobile/__tests__/dial-rest.test.tsx` for **FR-162**/**FR-163** on mobile, mirroring `apps/mobile/__tests__/marker-rest.test.tsx` — no needle before the first reading; hold angle and recolour on lapse.
- [X] T045 [US3] Build `apps/mobile/src/components/molecules/TuningDial.tsx` with the same geometry as web — the needle's angle in a Reanimated shared value driven from `subscribeToReading`, animated with `withTiming` on the **wrapper**, and the unwrap accumulator in a ref beside it. Never route the angle through React state.
- [X] T046 [US3] Render the dial or the line from `apps/mobile/src/components/organisms/TunerDisplay.tsx` with the same ternary as web.
- [X] T047 [US3] Add the **Tuning display** group to `apps/mobile/src/components/screens/SettingsScreen.tsx`, with the option list in the same order and the same words as `SettingsSheet.tsx`. Both vocabularies are hand-maintained copies, which is exactly how the platforms drift — assert the pairing, as the appearance options already are.
- [ ] T048 [US3] Verify SC-071 by hand — both apps on one steady tone with matching preferences; segment labels, order, and needle angle agree within 1°. Record the comparison in this file. **Blocked on one human tap; see below.**

**Checkpoint**: all three stories complete on both platforms. Code and tests ✅ (2026-08-12); the
by-hand comparison in T048 is outstanding.

| Gate | After Phase 4 | After Phase 5 |
| --- | --- | --- |
| `pnpm --filter @chromatic-tuner/mobile test` | 122 | **139** (+17) |
| `pnpm test` | 517 | 517, unchanged |
| `pnpm test:e2e` | 189 | 189, unchanged |
| `pnpm lint`, `format:check`, `typecheck` | pass | pass |

### T059 — the deferred mobile baseline, captured

`before-mobile-tuner-{light,dark}.png`, iPhone 17 Pro simulator, iOS 26.5, taken **before** any of
T045–T047 existed in the running bundle.

**They are not reproducible, and T004 predicted exactly why.** The simulator has no fake-audio device,
so it captures the room through the Mac's microphone: both shots show a live reading of **A4 +6 cents**
that nothing in this repo chose. The appearance is switched with `xcrun simctl ui booted appearance`
rather than through the app's own sheet — legitimate here, because the stored preference is `'system'`
on a fresh install, so the device setting is what the app is following.

**T052's mobile comparison must therefore be structural, not a pixel diff**, which is what T004 already
recorded and this run confirms.

### T042–T047 — the mobile dial, built from the CORRECTED requirement

**Deviation, and the reason T067 exists.** These tasks were written before Phase 7 and describe a dial
this repo no longer has: a needle pivoting at the centre, a lapse that "holds angle and recolours", and
a note name and cents readout left outside the circle. Building them as written would have re-created
**Defect 2** on the phone and then needed the same fix again. Mobile is built from the corrected
requirement instead — the hub, the fade to zero, the fractional face (**G25**), and
`pointerEvents="none"` for **G24a** — so the two platforms are one drawing on the day mobile lands
rather than two months later.

**One genuine platform difference, and it is in the hub.** Web sizes the hub's text in `cqw`, a
percentage of the dial's own width resolved by the browser, so `TunerDisplay` hands the dial finished
elements. React Native has no container units: the only place that number exists is inside the
component. `hub` is therefore a **render prop** on mobile — `(noteSize) => ReactNode` — and a plain
node on web. Everything else in the two files is the same arithmetic in the same order.

**Three defects found in the new tests by running them, none in the component:**

1. **`unwrapDegrees` collides with opacity.** The lapse test told the two shared values apart by
   value — "opacity is only ever 0 or 1" — which is wrong, and the test caught it: the unwrap returns
   the SHORT way round, so a needle crossing twelve o'clock is asked for exactly `0`. They are now
   told apart by **duration**, `markerMs` against `colorMs`, which cannot collide.
2. **An un-awaited `act` corrupts every later test in the file.** The first reading flips the state
   that mounts the needle, so `emit` has to be wrapped — and the wrapper has to be awaited. Un-awaited,
   React reported "overlapping act() calls" and the *subscription effect never ran* in the following
   tests, so three of them failed with no timing calls at all rather than with a wrong value.
3. **RNTL's automatic cleanup does not register under this jest-expo setup** — `settings.test.tsx`
   already records this — and here it is worse than a stale query: the leftover component keeps its
   subscription and leaks its `act` scope into the next test. `afterEach(cleanup)` added.

**Mutation-tested, because tests written after a component that already works prove nothing:**

| Mutation | Result |
| --- | --- |
| the lapse's opacity write removed | **2 failed** — the fade and the fade-back-in |
| `unwrapDegrees` replaced by the raw angle | **1 failed** — the short-way crossing |

Both reverted.

**What `jest-expo` still cannot see**, restated because the new file is easy to over-trust: no layout
engine and no compositor, so it cannot catch **D5** (a transform on the needle rather than on a
concentric wrapper produces an identical tree), cannot measure contrast, and cannot tell whether the
hub text fits inside the hub. The test asserts only that the needle carries no rotation of its own. The
screenshot in T052 is the other half of that gate.

### T048 — blocked on one tap, and worth stating precisely

The comparison needs the mobile dial on screen with a live reading. Everything up to that point is
automatable and was done — the app builds, launches, and reads a seeded preference — but the last step
is not:

- **The simulator will not skip the microphone explainer.** `useMicrophonePermission` asks
  `AudioManager.checkRecordingPermissions()`, which reports `Undetermined` however `xcrun simctl
  privacy booted grant microphone` (and `grant all`) is applied, before or after install, and across a
  full simulator shutdown/boot cycle. It appears to read `AVAudioApplication.recordPermission`, which
  the simulator only populates once the app has genuinely requested it. So the explainer stands, and
  clearing it needs a real tap on "Use the microphone".
- **Synthetic clicks were tried and abandoned.** `xcrun simctl` has no tap command; driving the
  Simulator through System Events means clicking at global screen coordinates, and the first attempt
  landed in an unrelated application's window. That is not a safe thing to do to someone's desktop for
  a screenshot, and it was stopped there rather than tuned.

**What IS verified of SC-071 without the tap**, and it is the structural half:

- Both platforms take the needle's angle from the **same** `dialAngleDegrees`, asserted on each side;
  a mobile dial that recomputed `pitchClass * 30 + cents * 0.3` locally would agree today and drift the
  first time the shared function is corrected — which has already happened once, at **G6**.
- The twelve labels are asserted against the same expected array on both platforms, in both accidental
  spellings, in order.
- Tick and target angles are asserted from `DIAL_SEGMENT_DEGREES` on both.

**What is not**: that the two draw the same needle at the same angle on a real screen. That is one tap
plus a tone played to both apps, and it belongs with **T052**, which needs the same simulator session.

### A note for whoever runs the simulator next

The dev client caches its JS bundle. `xcrun simctl terminate` + `launch` relaunches the app on the
**cached** bundle, which cost an hour here: the app showed the line while Metro was serving a bundle
that contained the dial, and a seeded `a4Hz: 432` proved the preference was being read the whole time.
Reload with the URL the CLI uses —
`xcrun simctl openurl booted "exp+chromatic-tuner://expo-development-client/?url=http%3A%2F%2F<host>%3A8081"` —
which forces a fetch. AsyncStorage can be seeded from the host, which is the mobile equivalent of the
web specs' `useDial`: write `{"chromatic-tuner:preferences": "<json>"}` to
`$(xcrun simctl get_app_container booted com.chromatictuner.app data)/Library/Application
Support/com.chromatictuner.app/RCTAsyncLocalStorage_V1/manifest.json` with the app not running.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T049 [P] Assert the **composited** contrast of the needle, ticks, rim and labels in both appearances in `apps/web/e2e/a11y.spec.ts` (**G22**, **FR-167**, V67) — ≥ 4.5:1 for the labels, ≥ 3:1 for the graphics, measured as the ruler's already are. Then grep both `TuningDial.tsx` files for `opacity` and confirm there is none.
- [ ] T050 [P] Verify reduced motion on both platforms (**FR-165**, **D11**, V66) — Playwright's `reducedMotion: 'reduce'` for web, `AccessibilityInfo` mocked for mobile. The transition is **removed**, not shortened, and V61's short-way crossing still holds with no animation at all.
- [ ] T051 [P] Verify the dial is silent to assistive technology (**G24**, **FR-164**, V70) — `aria-hidden` on web, `accessibilityElementsHidden` plus `importantForAccessibility="no-hide-descendants"` on mobile, and the announcer unchanged. Confirm with VoiceOver that the twelve labels are not reachable and the needle is never spoken.
- [ ] T052 [P] Capture "after" screenshots of both displays in light and dark on both platforms into `specs/007-circular-tuner-display/screenshots/`. The **line** shots must be pixel-identical to T004 (**SC-068**). The dial shots are the only gate on **D5** for mobile — look at where the needle's pivot actually is.
- [ ] T053 [P] Verify layout and text size (V69) — narrowest supported phone width in portrait and landscape, largest text step, dial not clipped, twelve labels not overlapping each other or the needle, and the note name, cents readout, direction cue and microphone control all still on screen. **Defect 1 (Phase 3) already fixed the fitting half and left a specific question here**: at a 640px viewport the dial shrinks to 114px and the twelve labels crowd. Decide whether the label size should scale with the dial, and judge it on both platforms.
- [ ] T054 [P] Verify greyscale (**SC-070**, V68) — sharp, flat and in-tune each identifiable on the dial with colour removed.
- [ ] T055 Record the "after" performance numbers in this file and compare against T003 (**Principle V**, **SC-067**, V71) — 30 s trace on the dial, p95 frame time and dropped frames. A regression above 10% blocks merge.
- [ ] T056 Run the full gate set and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. Confirm `pnpm build && pnpm verify:listing` reports **no artwork drift**; the dial adds no colour, so drift here means a token changed and that is a defect rather than a reason to regenerate.
- [ ] T057 Update `CLAUDE.md` with what a future reader cannot derive from the code — the rotation-origin trap and why the transform is on the wrapper (**D5**), the ~11× angular resolution finding (**D6**), and the third scalar on the reading channel with the one-frame boundary flick that forced it (**D2**).
- [ ] T058 Update `packages/core` contract references — `specs/001-chromatic-guitar-tuner/contracts/core-api.md` §3 gains a pointer to **G12**/**G13**, since the reading channel it documents now publishes three arguments.

**Checkpoint**: every gate green, both platforms screenshotted, performance measured.

---

## Phase 7: The hub, and the needle that would not go away

Both items **reported by the maintainer against the running Phase 3 build**, on the same viewing. The
first is a defect against a requirement that was written correctly and built halfway; the second is a
design change the maintainer approved before any of it was written.

### Defect 2 — the lapsed needle never faded

**FR-162 has always read "hold its last angle _and visibly fade_".** The built dial holds the angle and
takes the `noReading` colour, and there the sentence stopped being implemented. A player who damps a
string is left with a grey needle aimed squarely at a note that is no longer sounding — indefinitely,
because the dial deliberately has no rest position to return to.

**Three things conspired to make it look finished**, and all three are worth writing down:

1. `contracts/tuner-display.md` **G22** said "the lapsed needle changes colour to `noReading`; it is
   not dimmed" — a clause written to forbid an opacity multiplier that ended up forbidding the fade
   the FR asked for. A guarantee that rules out one failure mode must not mandate another.
2. `dial-rest.spec.ts` pinned it: `expect(Number(opacity)).toBe(1)` after a lapse. A green test over a
   half-built requirement.
3. The needle's colour genuinely does change, so a screenshot pair at the lapse edge shows something
   happening. It is only watching the app for a few seconds that shows it is the wrong something.

**Fix**: on the lapse edge the wrapper's opacity goes to 0 and the next valid reading puts it back to
1, both written imperatively from the continuous channel beside the angle — no React state on either
path (**R1**). The angle ref is untouched, so the needle fades back in where it left rather than
sweeping from anywhere (**FR-162b**). No new timer: the edge is the same lapse that returns the line's
marker to rest, which is what makes "at the same time as the line" (**FR-162a**) true by construction
rather than by two durations that happen to match.

- [X] T060 Amend **FR-162** and add **FR-162a**/**FR-162b** to `spec.md`; add **SC-072**; rewrite
      **G22** in `contracts/tuner-display.md` to permit a fade to exactly zero and record why its old
      wording shipped a defect; add **G27**.
- [X] T061 Rewrite the second case in `apps/web/e2e/dial-rest.spec.ts` — it asserted the defect. The
      angle-holding case above it is unchanged and still guards **FR-162**'s first half. Add the
      resume case (**FR-162b**) and an effective-opacity helper that multiplies wrapper by needle, so
      "invisible" cannot be faked by moving the alpha between the two elements.
- [X] T062 Implement the fade in `apps/web/src/components/molecules/TuningDial.tsx`.

### The hub — the note name and the cents readout move inside the dial

**Reported as "the dial tuner is too small".** It is: the dial is capped by `calc(100dvh - 526px)`, and
208px of that chrome is the note label (128), the cents readout (32) and their two `space.lg` gaps.
Those two rows are what the player looks at anyway, so they move to the centre of the circle and the
circle takes the room back — `COLUMN_CHROME_PX` 526 → **318**, cap 320 → **464**.

**464 is derived, not chosen.** It is the smallest dial whose hub holds the note name at the full
`type.noteSize` of 128px, so the largest element on the screen never gets smaller than the horizontal
display already draws it (**G26**). Below that the note scales with the dial via container units, and
`27cqw` is likewise arithmetic rather than taste: the hub is a circle, so the constraint is the text
block's **half-diagonal** against the hub radius, not its width.

The needle gives up the centre and becomes an outer band, which forces the whole face onto fractions of
the radius (**G25**) — including the label ring and the ticks, which move outward to leave the band
contiguous. That also settles the question **Defect 1 carried forward to T053**: the labels now scale
with the dial instead of crowding at 640px.

- [X] T063 Amend **FR-157**, **FR-168**; add **FR-169**, **FR-170**, **SC-073**, the *face rings*
      entity and two assumptions; add **G25** and **G26**, and the note on **G24** that the hub changes
      nothing for assistive technology because both atoms are already `aria-hidden`.
- [X] T064 Write the failing geometry cases in `apps/web/e2e/dial-hub.spec.ts` — the hub text's
      measured box inside the hub circle, clear of the needle band, at several viewport heights; the
      dial measurably larger than the 320 cap; the note never larger than `type.noteSize`. Measured
      boxes, never computed styles: a `clamp()` that computes correctly and a text block that overflows
      its circle are the same computed style.
- [X] T065 Give `NoteLabel` and `CentsReadout` an optional size; add the `hub` prop to `TuningDial`;
      convert the face to fractional radii with `container-type: inline-size`; re-baseline
      `COLUMN_CHROME_PX` and the cap; route the atoms from `TunerDisplay`.
- [X] T066 Re-baseline the four `fits the viewport` cases in `dial.spec.ts` against the new chrome, and
      add the shortest supported viewport to them — the old numbers were computed from 526.
- [X] T067 **Mobile inherits this, and is unbuilt.** Phase 5 builds the dial with the hub and the fade
      from the start; T042–T048 predate both and describe the centre-pivot needle. Read this section
      before starting them. **Done in Phase 5** — the mobile dial was built from the corrected
      requirement, so Defect 2 was never re-created on the phone.

### Defect 3 — the dial swallowed the settings badge's clicks

**Reported by the maintainer against the Phase 7 build**: with the dial selected, the settings badge
was clickable only at its two extreme ends.

Measured at a 489px dial: **25 of 27** points sampled across the badge hit a `dial-tick` rather than
the badge. The microphone control, 152px below the dial, was clear — with 51px to spare.

**Root cause is geometric, and invisible in a screenshot.** Every rotated mark — the twelve ticks, the
target, the needle — is drawn by an `inset: 0` wrapper, a square the size of the whole dial, which is
then rotated, because **G21** requires the transform to go on a dial-sized concentric element rather
than on the mark itself. A rotated square hit-tests over its **rotated** area, which overhangs the
dial's own box by up to `((√2 − 1) / 2) × size` = 101px at the 45° ticks. Those corners are
transparent and paint nothing, so nothing on screen suggests the dial reaches a hand's width past its
own rim.

**Latent since Phase 3; Phase 7 exposed it rather than caused it.** At a 320px dial the overhang was
66px, and the note name and the cents readout stood between the badge and the dial and absorbed all of
it. Moving them into the hub (**FR-168**) left the badge 24px from the dial's edge. The overhang also
grew with the dial. Note what this means for the future: it is a function of the dial's SIZE, so the
microphone control's 51px of clearance is not a safety margin anyone should rely on.

**Fix**: `pointer-events: none` on the dial's root, inherited by every mark inside it. Preferred to
`overflow: hidden`, which would also clip the reach but would describe the dial as a viewport when what
is true is that it is decoration — the same thing `aria-hidden` already says to a different audience.
The `pointer-events: none` that the hub carried is removed; it was half of this rule, applied to the
one part of the dial that was never the problem.

- [X] T068 Write the failing cases in `dial.spec.ts` — hit-test a grid across the reference badge and
      the microphone control and assert nothing outside them is on top, plus one case that clicks the
      badge and opens the sheet. Hit-testing rather than clicking alone, so a failure names the element
      that is covering the control instead of reporting a timeout. Both failed as reported; Playwright's
      own message read `<div data-testid="dial-tick"> … intercepts pointer events`.
- [X] T069 Add `pointer-events: none` to the dial root; add **G24a** to the contract.

### Phase 7 results

**Gates**: `lint` ✓ · `format:check` ✓ · `typecheck` ✓ (5 projects) · `test` ✓ 517 in 21 files ·
`test:coverage` ✓ 98.56 / 95.32 / 100 · `test:e2e` ✓ **183** (was 173: +4 hub geometry, +2 fade,
+1 viewport height, +3 pointer events) · mobile `test` ✓ 122 · `build` ✓.

**The defect was observed failing before the fix**, per Principle III. With the opacity write removed,
`dial-rest.spec.ts` reports `timed out waiting for the needle to fade out after the tone stopped; last
effective needle opacity was 1.000` — which is the reported defect, in the failure message.

**Performance (Principle V)** — the dial's own render loop, which this changes twice: the dial is 1.7×
wider, and one extra style write joins the angle on every frame. Same instrument as T003, `useDial`
seeded, 20 s each:

| | p50 | p95 | max |
| --- | --- | --- | --- |
| before (Phase 3 dial) | 8.3 ms | 9.1 / 9.2 ms | 9.4–9.8 ms |
| after | 8.3 ms | 9.1 ms | 10.6–11.1 ms |

No regression in p50 or p95 against budgets of 17.5 / 33.4 ms. The larger `max` is within the run-to-run
spread T003 already recorded, which is why that baseline says to compare p50 and p95 rather than `max`.

**Two test-robustness defects found by running the new specs under `--repeat-each`**, both in
assertions that were correct on a quiet machine and wrong under load. Recorded because they are the
same species as the ones already in this file:

1. **The poll bound and the assertion bound must be the same number.** The fade case polled for
   `opacity > 0.99` and then asserted `toBeCloseTo(1, 2)`, so it returned mid-fade at 0.9935 and
   rejected what it had just accepted. `marker-rest.spec.ts` carries this exact lesson for the marker's
   travel; the new file re-learned it. Both are now `=== 1` and `=== 0`.
2. **`holds the last angle` compared two samples three seconds apart at five decimal places.** The
   needle tracks a live signal for the whole of that stretch, so the assertion was bit-identity across
   a window in which the needle is *supposed* to move; it passed only because the fixture is steady.
   Under load one final reading landed between the samples and moved it 0.03°. It now samples the last
   angle held before the readout blanks, and allows 1° — ~3 cents, against a failure mode that moves
   the needle by tens of degrees.

**One design decision taken against the screenshot rather than in advance.** Confined to the outer
face, the needle at its old fixed 6px read as a dash rather than the dominant mark FR-021 asks for, so
it is the one stroke on the dial with a proportional width (`max(6px, 1.7cqw)`), and it runs out to
0.96R — into the tick ring — instead of stopping at 0.93R.

**Screenshots**: `after-web-dial-{light,dark}.png`, same fixture, viewport and route as T004's
baselines, so the states are comparable (E2, in tune). Mobile is unbuilt; see T067.

**Checkpoint**: the needle disappears when the string stops, and the dial is ~1.8× the area it was.

---

## Dependencies

```text
Phase 1 (Setup)
  └─> Phase 2 (Foundational)          ← blocks everything
        ├─> Phase 3 (US1, P1)  web dial + settings row        🎯 MVP
        │     └─> Phase 4 (US2, P2)  persistence guarantees
        └─────> Phase 5 (US3, P2)  mobile
                    └─> Phase 6 (Polish)
```

**Within Phase 2**: the three groups — angle maths (T005–T008), the reading channel (T009–T012), the
preference (T013–T019) — are independent of each other and can run in parallel. The React layer
(T020–T023) depends on all three.

**US1 → US2**: US2's tests live in the same spec file as US1's and exercise the settings row US1
builds, so US1 lands first. US2 is otherwise almost entirely inherited behaviour.

**US1 → US3**: not a hard dependency, but deliberate. Web can catch the D5 defect and mobile cannot,
so the web dial is proved first and the mobile component is built to the shape web proved.

## Parallel execution examples

**Phase 1**: T002, T003, T004 — three different kinds of measurement, no shared files.

**Phase 2**: T005 + T006 (same new file, coordinate) ∥ T009 ∥ T013 + T014 ∥ nothing else. Then T007,
T010, T015–T017 in parallel. Then T020 ∥ T021.

**Phase 3**: T025, T026, T027, T028 all write to `dial.spec.ts` — write them as one sitting, not four
parallel agents. T024 must land first.

**Phase 4**: T035–T040 are six independent test cases and can be written in parallel by anyone who
accepts they share a file.

**Phase 5**: T042 ∥ T043 ∥ T044, then T045–T047 in sequence.

**Phase 6**: T049–T054 are six independent verifications across six different surfaces — genuinely
parallel.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That is a working dial a player can choose on the web, tuning
correctly, with the line still the default for everyone who does not. It is demonstrable and shippable
without Phases 4–6.

**Increment 2** = Phase 4, which is mostly proving that inherited behaviour is genuinely inherited.

**Increment 3** = Phase 5, the phone.

**Do not defer Phase 6.** The contrast task (T049) and the performance task (T055) are constitution
gates, not polish in the optional sense: Principle IV sets the contrast floors and Principle V requires
before/after numbers for any render-loop change. T003 is in Phase 1 precisely because T055 cannot be
done without it.
