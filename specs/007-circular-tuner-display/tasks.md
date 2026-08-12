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

- [ ] T005 [P] Write failing tests for `dialAngleDegrees` in `packages/core/tests/dial.test.ts` covering **G1–G6** — C at 0°, A at 270° (not 90°, which is the mirror), octave invariance `f(m, c) === f(m + 12, c)`, the `0.3 × cents` displacement with sharp clockwise, `|angle − 30 × pitchClass| ≤ 15` for every reading, and the boundary identity `f(m, +50) === f(m + 1, −50)`. Use the worked table in [data-model.md §4](./data-model.md) as fixtures. Observe every one fail.
- [ ] T006 [P] Write failing tests for `unwrapDegrees` in `packages/core/tests/dial.test.ts` covering **G7–G11** — congruence mod 360, `|result − previous| ≤ 180`, the `(344.7, −14.7) → 345.3` crossing, and a monotone five-octave sweep reaching ~1800° without renormalising. Confirm the identity function fails at least three of them before writing any implementation.
- [ ] T007 Implement `dialAngleDegrees` and `unwrapDegrees` in `packages/core/src/notes/dial.ts`, reusing the existing `pitchClassOf`. No DOM, no React, no platform import — this file compiles against ES2022 only.
- [ ] T008 Re-export both functions from `packages/core/src/index.ts` and confirm `pnpm test:coverage` still clears 90% lines / 90% functions / 85% branches on `packages/core`.

### The reading channel (core)

- [ ] T009 Write failing tests for the third argument in `packages/core/tests/session.test.ts` covering **G12** and **G13** — a live reading publishes `(cents, clarity, midi)` with the analyzer's MIDI number, and a withdrawal publishes `(null, 0, null)` exactly once on the edge. **Corrected at T002**: the existing handlers are written `(cents, clarity) => …` and `(cents) => …`, and a narrower function stays assignable to a wider signature, so **every existing assertion in this file keeps passing whether `midi` is published correctly, published as `undefined`, or not published at all**. The suite is blind here by construction; only assertions written against the third parameter can see it. Capture the handler with a spy and assert `toHaveBeenCalledWith(cents, clarity, midi)` on the full argument list.
- [ ] T010 Extend `ReadingHandler` to `(cents: number | null, clarity: number, midi: number | null) => void` in `packages/core/src/tuning/session.ts`, publish `reading.midi` from `handleFrames`, and publish `null` from `withdrawReading`. Do not restructure the channel into an object — see **G14** and the allocation hazard above.
- [ ] T011 Run `pnpm vitest run packages/core/tests/allocation.test.ts` **unmodified** and record the result in this file (**G14**). If it needs editing to pass, the implementation is wrong.
- [ ] T012 Confirm `TuningLine` still compiles and behaves on both platforms with its two-parameter handler untouched (**G15**) — `apps/web/e2e/marker-rest.spec.ts` and `apps/mobile/__tests__/marker-rest.test.tsx` are the ones that would notice.

### The preference (core)

- [ ] T013 [P] Write failing tests for the stored field in `packages/core/tests/preferences.test.ts` covering **G16–G18** — `'line'` and `'dial'` accepted; absent, `null`, `42`, `''`, `'Line'`, `'circle'`, `'circular'` all yielding `'line'`; a pre-007 record loading with reference pitch, accidental style and appearance intact; and `PREFERENCES_SCHEMA_VERSION` still `1`.
- [ ] T014 [P] Write a failing test in `packages/core/tests/preferences.test.ts` for **G17** specifically — an unusable `tunerDisplay` must not disturb the other three fields, and an unusable `a4Hz` must not disturb `tunerDisplay`. This is the guarantee that silently weakens each time a field is added.
- [ ] T015 Add `TunerDisplay` and `isTunerDisplay` to `packages/core/src/types.ts`, following `isAppearancePreference`'s exact-match, case-sensitive shape.
- [ ] T016 Add `readonly tunerDisplay: TunerDisplay` to `StoredPreferences` in `packages/core/src/ports/preferences-store.ts`, with a comment recording that the **port is unchanged** — one more field inside a blob both adapters already treat as opaque.
- [ ] T017 Add the default and the repair clause in `packages/core/src/preferences.ts` — `DEFAULT_PREFERENCES.tunerDisplay = 'line'`, destructured and repaired independently alongside the other three. **Leave `PREFERENCES_SCHEMA_VERSION` at 1** and record why in a comment (an absent field is not an incompatible shape; research **D9**).
- [ ] T018 Add `tunerDisplay` round-trip and repair checks to `packages/core/testing/port-contract-tests.ts` (**G19**) and observe them fail for every implementation — `localStorage`, AsyncStorage, and the in-memory double — via `pnpm test` and `pnpm --filter @chromatic-tuner/mobile test`.
- [ ] T019 Make T018 pass. Expect **no adapter changes**; if either adapter needs one, that is a finding worth recording here, because it means something was not treating the record as opaque.

### The shared React layer

- [ ] T020 [P] Write failing tests in `packages/react/tests/use-preferences.test.tsx` for `tunerDisplay` and `setTunerDisplay` — published from the provider, optimistic in-memory update, persisted through the same `apply()` path, `persistenceFailed` set when the store throws, and `reset()` returning to `'line'`.
- [ ] T021 [P] Write a failing test in `packages/react/tests/use-tuner.test.tsx` for `subscribeToReading`, asserting all three arguments arrive and that `subscribeToCents` keeps its one-argument signature (**G15**).
- [ ] T022 Publish `tunerDisplay` and `setTunerDisplay` from `packages/react/src/TunerProvider.tsx` and `packages/react/src/usePreferences.ts`, following `setAccidentalStyle` exactly.
- [ ] T023 Add `subscribeToReading` to `packages/react/src/useTuner.ts`, forwarding all three scalars, and leave `subscribeToCents` exactly as it is.

**Checkpoint**: the core knows about dials but nothing draws one. `pnpm test`, `pnpm typecheck` and `pnpm test:coverage` green; both apps still build and behave identically to T004's screenshots.

---

## Phase 3: User Story 1 — Tune against a circular dial (P1) 🎯 MVP

**Goal**: a player can pick the dial on the web and tune with it.

**Independent test**: select the dial, feed the tuner a tone at a known offset from a known note, and
confirm the needle sits at the angle that offset predicts, on the right segment, reaching in-tune at
the segment's exact centre. V60–V63.

- [ ] T024 [US1] Add a `needleAngleDeg` helper to `apps/web/e2e/helpers.ts` that derives the needle's angle from its **rendered bounding box in page coordinates**, not from its computed transform — the same reason `markerOffsetPx` measures real boxes. This helper is what makes T031 able to see the D5 defect.
- [ ] T025 [P] [US1] Write failing e2e tests in `apps/web/e2e/dial.spec.ts` for the angle table in V60 — A4 at 270°, D3 at 60°, D3 ± 25 cents at 67.5°/52.5°, C4 at 0° — using the generated WAV fixtures under `apps/web/e2e/fixtures`.
- [ ] T026 [P] [US1] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for the boundary crossing (**G10**, V61) — sweep through twelve o'clock and assert the needle's accumulated angle moves a few degrees, never ~359 the other way. Assert the path, not the endpoint.
- [ ] T027 [P] [US1] Write failing e2e tests in `apps/web/e2e/dial.spec.ts` for the lapsed needle (**FR-162**, **FR-163**, V62) — no needle at all before the first reading; after a reading lapses, the needle holds its exact previous angle and takes the `noReading` colour. Mirror the structure of `apps/web/e2e/marker-rest.spec.ts`, which pins the line's opposite behaviour.
- [ ] T028 [P] [US1] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for segment labelling (**FR-155**, **FR-156**, V63) — twelve labels, C at the top, ascending clockwise, and the five accidentals respelling with the flats preference while the seven naturals and the needle do not move.
- [ ] T029 [US1] Build `apps/web/src/components/molecules/TuningDial.tsx` — rim, twelve boundary ticks at `15° + k × 30°`, twelve labels positioned by trigonometry and drawn upright, an active-segment centre tick, and the needle inside a dial-sized concentric wrapper. The wrapper is what rotates (**G21**, research **D5**); write its transform imperatively from `subscribeToReading`, never through React state.
- [ ] T030 [US1] Keep the unwrap accumulator in a `useRef` beside the transform write in `TuningDial.tsx`, never in React state — it is written ~43 times a second (**data-model §5**).
- [ ] T031 [US1] Run T024–T028. Deliberately verify the suite catches the D5 defect by temporarily moving the transform onto the needle element; confirm T025 fails, then revert. Record the observed failure in this file — this is the one check that proves the geometry tests measure geometry.
- [ ] T032 [US1] Render the dial or the line from `apps/web/src/components/organisms/TunerDisplay.tsx` with a ternary on `tunerDisplay`. Two sibling components, no shared "meter" abstraction (research **D1**). `NoteLabel`, `CentsReadout` and `DirectionCue` stay exactly where they are (**FR-168**).
- [ ] T033 [US1] Add the **Tuning display** group to `apps/web/src/components/organisms/SettingsSheet.tsx`, between Accidentals and Appearance, with **Line** and **Dial** buttons. Reuse the existing group treatment verbatim — `role="group"` + `aria-labelledby` (never fieldset/legend; Safari mis-lays-out the first layout), `aria-pressed`, the `selected` tint **fill** rather than a heavier `text` border, `flex: 1`, and `a11y.minTouchTarget`.
- [ ] T034 [US1] Confirm `006`'s focus trap still cycles correctly with two more focusables in the sheet. **Retargeted at T002**: the trap's tests are in `apps/web/e2e/a11y.spec.ts` (`FOCUSABLE_SELECTOR` `:561`, `sheetControls()` `:564`, V52 `:588`) — `settings.spec.ts` has no `Tab` assertions at all. `sheetControls()` already reads the list from the DOM on every use and asserts `length > 2` rather than a hard-coded 8, so this is expected to pass unchanged; run it and record that it did, rather than editing it.

**Checkpoint**: US1 is independently shippable on web. V60–V63 pass.

---

## Phase 4: User Story 2 — Pick the display, and keep the one you had (P2)

**Goal**: the choice persists, the default protects existing players, and nothing about switching
touches the microphone.

**Independent test**: change the setting, close and reopen the app, confirm the chosen display returns;
press Reset to defaults and confirm the line comes back. V58, V59, V64, V65.

- [ ] T035 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for **FR-149** and V58 — a profile with no stored record shows the **line**, and the Settings group shows **Line** selected.
- [ ] T036 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for **FR-152**, **G20** and V59 — switch displays while a reading is live and assert capture is uninterrupted: no permission prompt, `start` called exactly once, `stop` never called, and the cents readout never blanks.
- [ ] T037 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for the upgrade path (**G18**, V64) — seed `localStorage` with a pre-007 record of `{ a4Hz: 432, accidentalStyle: 'flat', appearance: 'dark', schemaVersion: 1 }`, reload, and assert 432 Hz, flats, dark **and** the line, with every field preserved.
- [ ] T038 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for the garbage path (**G16**, **G17**) — the same record with `tunerDisplay: 'circle'` loads as the line with 432/flat/dark still intact.
- [ ] T039 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for reload persistence and reset (**FR-150**, V64) — select Dial, reload, assert the dial is present on the first painted frame with no flash of the line; then Reset to defaults and assert the line returns alongside 440/Sharps/Match device.
- [ ] T040 [P] [US2] Write a failing e2e test in `apps/web/e2e/dial.spec.ts` for **FR-153** and V65 — with `localStorage.setItem` stubbed to throw, switching to Dial still switches the display and raises the existing `persistence-warning`.
- [ ] T041 [US2] Make T035–T040 pass. Expect most of them to pass on the Phase 2 plumbing alone; record in this file which ones needed new code and which were inherited, because "inherited" is the claim [research D9](./research.md) makes and it should be checked rather than assumed.

**Checkpoint**: US2 independently verifiable. V58, V59, V64, V65 pass.

---

## Phase 5: User Story 3 — The same dial on the phone (P2)

**Goal**: the phone offers the same choice in the same words and draws the same dial.

**Independent test**: put both apps on the same reference tone with the same preferences and confirm
the segment labels, their order, and the needle angle match. V58/V59/V63/V64 on mobile, plus V70.

- [ ] T059 [US3] **Run this before T045.** Capture the deferred mobile half of T004 — "before"
  screenshots of the mobile tuner in light and dark on an iOS simulator, into
  `specs/007-circular-tuner-display/screenshots/` as `before-mobile-tuner-{light,dark}.png`. Deferred
  from Phase 1 deliberately: nothing before this phase changes what mobile draws, so the picture is the
  same either way. `005`'s mobile shots are **not** a usable baseline — `5f4bedd`, `ca8ca78` and
  `38f4caa` each redrew the ruler after they were taken. Android cannot be captured on this machine at
  all (no SDK), so its half of T052 stays a release-gate formality with nothing to compare.
- [ ] T042 [P] [US3] Write failing tests in `apps/mobile/__tests__/dial-geometry.test.tsx` for the dial's structure — twelve labels in ascending order starting at C, twelve boundary ticks, and the needle's rotation derived from `dialAngleDegrees`. Model it on `apps/mobile/__tests__/ruler-geometry.test.tsx`, and note in the file that this cannot see **D5** (no layout engine).
- [ ] T043 [P] [US3] Write a failing test in `apps/mobile/__tests__/settings.test.tsx` for the **Tuning display** group — present, labelled identically to web, two options in the same order, `accessibilityState.selected` on the chosen one, and `a11y.minTouchTarget` honoured.
- [ ] T044 [P] [US3] Write a failing test in `apps/mobile/__tests__/dial-rest.test.tsx` for **FR-162**/**FR-163** on mobile, mirroring `apps/mobile/__tests__/marker-rest.test.tsx` — no needle before the first reading; hold angle and recolour on lapse.
- [ ] T045 [US3] Build `apps/mobile/src/components/molecules/TuningDial.tsx` with the same geometry as web — the needle's angle in a Reanimated shared value driven from `subscribeToReading`, animated with `withTiming` on the **wrapper**, and the unwrap accumulator in a ref beside it. Never route the angle through React state.
- [ ] T046 [US3] Render the dial or the line from `apps/mobile/src/components/organisms/TunerDisplay.tsx` with the same ternary as web.
- [ ] T047 [US3] Add the **Tuning display** group to `apps/mobile/src/components/screens/SettingsScreen.tsx`, with the option list in the same order and the same words as `SettingsSheet.tsx`. Both vocabularies are hand-maintained copies, which is exactly how the platforms drift — assert the pairing, as the appearance options already are.
- [ ] T048 [US3] Verify SC-071 by hand — both apps on one steady tone with matching preferences; segment labels, order, and needle angle agree within 1°. Record the comparison in this file.

**Checkpoint**: all three stories complete on both platforms.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T049 [P] Assert the **composited** contrast of the needle, ticks, rim and labels in both appearances in `apps/web/e2e/a11y.spec.ts` (**G22**, **FR-167**, V67) — ≥ 4.5:1 for the labels, ≥ 3:1 for the graphics, measured as the ruler's already are. Then grep both `TuningDial.tsx` files for `opacity` and confirm there is none.
- [ ] T050 [P] Verify reduced motion on both platforms (**FR-165**, **D11**, V66) — Playwright's `reducedMotion: 'reduce'` for web, `AccessibilityInfo` mocked for mobile. The transition is **removed**, not shortened, and V61's short-way crossing still holds with no animation at all.
- [ ] T051 [P] Verify the dial is silent to assistive technology (**G24**, **FR-164**, V70) — `aria-hidden` on web, `accessibilityElementsHidden` plus `importantForAccessibility="no-hide-descendants"` on mobile, and the announcer unchanged. Confirm with VoiceOver that the twelve labels are not reachable and the needle is never spoken.
- [ ] T052 [P] Capture "after" screenshots of both displays in light and dark on both platforms into `specs/007-circular-tuner-display/screenshots/`. The **line** shots must be pixel-identical to T004 (**SC-068**). The dial shots are the only gate on **D5** for mobile — look at where the needle's pivot actually is.
- [ ] T053 [P] Verify layout and text size (V69) — narrowest supported phone width in portrait and landscape, largest text step, dial not clipped, twelve labels not overlapping each other or the needle, and the note name, cents readout, direction cue and microphone control all still on screen.
- [ ] T054 [P] Verify greyscale (**SC-070**, V68) — sharp, flat and in-tune each identifiable on the dial with colour removed.
- [ ] T055 Record the "after" performance numbers in this file and compare against T003 (**Principle V**, **SC-067**, V71) — 30 s trace on the dial, p95 frame time and dropped frames. A regression above 10% blocks merge.
- [ ] T056 Run the full gate set and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. Confirm `pnpm build && pnpm verify:listing` reports **no artwork drift**; the dial adds no colour, so drift here means a token changed and that is a defect rather than a reason to regenerate.
- [ ] T057 Update `CLAUDE.md` with what a future reader cannot derive from the code — the rotation-origin trap and why the transform is on the wrapper (**D5**), the ~11× angular resolution finding (**D6**), and the third scalar on the reading channel with the one-frame boundary flick that forced it (**D2**).
- [ ] T058 Update `packages/core` contract references — `specs/001-chromatic-guitar-tuner/contracts/core-api.md` §3 gains a pointer to **G12**/**G13**, since the reading channel it documents now publishes three arguments.

**Checkpoint**: every gate green, both platforms screenshotted, performance measured.

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
