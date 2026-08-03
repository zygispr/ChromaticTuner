# Tasks: Tuner UX Refinements

**Feature**: `002-tuner-ux-refinements` · **Created**: 2026-08-03

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/core-api-delta.md](./contracts/core-api-delta.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001`'s convention: record deviations, defects, and
measurements here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE, and it binds this feature harder than most because **five of the six
items are defects**. The constitution's rule is explicit: *every bug fix MUST add a regression test that
fails on the unfixed code*. So for US2–US5, "observe the test failing first" is not a process nicety —
a test that passes before the fix has not tested the fix, and `001` shipped exactly that mistake once
(`expect(transform).not.toBe('none')`, satisfied by the constant that centres the marker, which let a
144 px positioning error through seven phases).

Each test task below states **what failure looks like before the fix**. If a test passes on first run,
it is wrong; fix the test before touching the implementation.

---

## Phase 1: Setup

**Purpose**: Establish the before-numbers that Principle V will demand at the end.

- [X] T001 Confirm all eight gates pass on a clean checkout of `002-tuner-ux-refinements` and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [X] T002 [P] Record baseline latency numbers from `packages/core/tests/latency.test.ts` (first movement and settle, in ms) in this file, before any source change — US2 modifies the render path and the constitution requires before/after numbers in the PR
- [X] T003 [P] Record baseline frame-time numbers (p50/p95/max) from `apps/web/e2e/performance.spec.ts` in this file, before any source change

### Phase 1 results — 2026-08-03, commit `778237b`, no source changes

**All eight gates green.**

| Gate | Result |
| --- | --- |
| `pnpm lint` | clean, `--max-warnings 0` |
| `pnpm format:check` | clean |
| `pnpm typecheck` | 5/5 projects |
| `pnpm test` | **414 passed**, 18 files |
| `pnpm --filter @chromatic-tuner/mobile test` | **45 passed**, 5 suites |
| `pnpm test:coverage` | **100% lines**, 98.46% statements, 94.76% branches, 97.26% functions |
| `pnpm test:e2e` | **46 passed** |
| `pnpm build` | 233.04 kB, `sw.js` emitted |

**Baselines for the Principle V before/after comparison (T028 supplies the "after"):**

| Measurement | Baseline |
| --- | --- |
| First marker movement | **66.6 ms** (66.576) |
| Settle | **136.2 ms** (136.236) |
| Frame time p50 | **8.3 ms** |
| Frame time p95 | **9.2 ms** |
| Frame time max | **13.6 ms** |

Two notes on these numbers, both of which matter when T028 compares against them:

- **Latency reproduces `001`'s figures exactly** (66.6 / 136.2), which is the expected result: nothing in
  the DSP path has changed since they were recorded. It also confirms the measurement is deterministic
  rather than machine-dependent, so a difference at T028 will be attributable to the change rather than to
  the host.
- **Frame-time `max` is noisy and is not a comparable figure.** Two runs of the same unmodified code
  produced 10.0 ms and 13.6 ms. Compare **p50 and p95** at T028; treat a `max` movement alone as
  measurement scatter, not a regression. The 16.7 ms budget is what `max` is actually gated on.

One process note recorded because it will recur at T028: `latency.test.ts` asserts against budgets but does
not print its measurements, and Vitest 4 discards `console.log` from this project's test runs — both from
the `describe` body and from inside an `it`, with `--silent=false` making no difference. The values were
extracted by temporarily asserting them into a failing diff, then restoring the file with
`git checkout --`. If before/after numbers are going to be a recurring obligation, the honest fix is for
the test to report them itself rather than for each measurement to re-derive this workaround.

---

## Phase 2: Foundational

**None.** Stated explicitly rather than padded.

Every item in this feature is independently implementable against the code as it stands today. The one
shared change — the `ReadingHandler` widening — serves US2 alone and lives in that phase, because
promoting it here would make four unrelated stories falsely appear to depend on it. There is no shared
scaffolding, no new dependency, no schema, and no migration.

---

## Phase 3: User Story 1 — Stop and restart the microphone on demand (P1)

**Goal**: A persistent control that stops and starts capture, and a stop that survives backgrounding.

**Independent test**: Grant access, confirm readings, press stop → OS recording indicator clears and
readings cease. Press start → readings resume with no reload. Background and return → still stopped.

### Tests (write first, observe failing)

- [X] T004 [P] [US1] Write `apps/web/e2e/microphone-toggle.spec.ts` covering stop → no readings → start → readings resume, and that the control's accessible name changes between states (FR-036–FR-039, FR-042). **Before the fix**: no such control exists, so the locator finds nothing and every case fails
- [X] T005 [P] [US1] Add a case to `apps/web/e2e/microphone-toggle.spec.ts` that stops capture, dispatches a real `visibilitychange` to hidden and back to visible, and asserts capture is still stopped (FR-040). **Before the fix**: `useMicrophoneLifecycle` calls `start()` on return, so this fails even once a toggle exists — this is the case most likely to be faked by a mocked flag, so it must drive the real event
- [X] T006 [P] [US1] Write `apps/mobile/__tests__/microphone-toggle.test.tsx` mirroring T004 and T005, driving `AppState` rather than `visibilitychange`. **Before the fix**: same failures as T004/T005
- [X] T007 [P] [US1] Add a test to `packages/react/tests/announcement.test.ts` for the capture-control announcement strings. **Before the fix**: the function does not exist

### Implementation

- [X] T008 [US1] Add capture-control announcement text to `packages/react/src/announcement.ts`, stating what activating the control will do rather than its current state (FR-039)
- [X] T009 [P] [US1] Create `apps/web/src/components/molecules/MicrophoneToggle.tsx` — a two-state button using `a11y.minTouchTarget` and token colours only, with `aria-pressed` or an equivalent state exposure (FR-036, FR-042)
- [X] T010 [P] [US1] Create `apps/mobile/src/components/molecules/MicrophoneToggle.tsx` mirroring T009 with `Pressable` and `accessibilityState`
- [X] T011 [US1] Add `captureEnabled` state to `apps/web/src/components/organisms/TunerGate.tsx`, gate the `start()` effect on it, and pass `useMicrophoneLifecycle(ready && captureEnabled)` (FR-040, data-model.md)
- [X] T012 [US1] Make the same change in `apps/mobile/src/components/organisms/TunerGate.tsx`, keeping the two gates structurally identical — they are required to mirror, and drift here is the accepted risk of not extracting a shared hook (research D1)
- [X] T013 [P] [US1] Render `MicrophoneToggle` in `apps/web/src/components/organisms/TunerDisplay.tsx` without pushing the tuning line below the fold (FR-018 still binds)
- [X] T014 [P] [US1] Render `MicrophoneToggle` in `apps/mobile/src/components/organisms/TunerDisplay.tsx`
- [X] T015 [US1] Verify the stopped state is visually distinguishable from listening-but-silent in both apps (FR-039) — a control label alone is not sufficient, since a player glancing from a metre away reads the display, not the button

**Checkpoint**: ✅ **US1 COMPLETE (2026-08-03)**. **417 unit** (+3), **49 mobile Jest** (+4), **50
Playwright** (+4), all green. `packages/core` coverage unchanged at **100% lines** / 94.76% branches — US1
touches no core code. Lint, format, typecheck and build clean.

Every one of the eight new tests was observed failing before its implementation existed.

Three things worth recording:

- **The label names the action, not the state, and that ruled out `aria-pressed`.** T009 offered
  "`aria-pressed` or an equivalent state exposure"; the two are mutually exclusive here. A control
  announced as "Stop listening, pressed" leaves a screen-reader user unable to tell which of the two facts
  the "pressed" modifies. A changing accessible name is unambiguous by itself and is the state exposure
  FR-042 asks for. The reasoning lives in `captureControlLabel`, which owns the copy for both platforms so
  they cannot land on opposite sides of the choice.

- **A user-initiated stop showed "Starting…".** Not in the plan, and found only because T004 asserted on
  what the screen says rather than on what the button says. `session.stop()` lands in `idle`, and `idle`'s
  copy is "Starting…" — so a deliberate stop reported the exact opposite of what had happened. Fixed with a
  `captureStopped` prop on `StatusBanner` in both apps; the alternative, a new `TunerStatus` kind, would
  have pushed a presentation concern into `packages/core` for a distinction only the UI can make.

- **The FR-040 test failed for the wrong reason first, and the defect was in the test.** The mobile harness
  spies on `AppState.addEventListener` to drive a real foreground transition, and its `remove()` was stubbed
  as `jest.fn()` — a no-op. That left the handler from a previous effect run in the array, so the test
  invoked a subscription React had already torn down and reported a lifecycle bug that did not exist. After
  fixing the stub the test was re-verified against unfixed code (`useMicrophoneLifecycle(ready)`) and still
  fails there, so the fix did not make it vacuous. **A stubbed teardown that does not tear down is a test
  that measures the wrong program.**

Not verified here, and deliberately deferred to Phase 8: the OS recording-indicator check (V14, T050) needs
a device, and the light/dark screenshots (T048) are a cross-cutting task. T015's "distinguishable from a
metre away" was checked through the status copy and the cleared readout, both asserted by tests — **not by
eye**. That check belongs with T048.

---

## Phase 4: User Story 2 — A stale reading clears itself (P2)

**Goal**: The marker returns to rest when the reading lapses, on the existing 400 ms filter release.

**Independent test**: Sound a fixture tone, let the marker settle off-centre, stop the tone, and measure
the marker's position against its startup position.

**Read [contracts/core-api-delta.md](./contracts/core-api-delta.md) before starting.** The `null`-not-`0`
decision is the whole point of the design and is easy to undo by accident.

### Tests (write first, observe failing)

- [X] T016 [P] [US2] Add lapse tests to `packages/core/tests/session.test.ts`: a lapse fires the reading handler exactly once with `(null, 0)`; a second lapse with no intervening reading fires nothing; re-acquisition then lapsing fires again (guarantee R3). **Before the fix**: no lapse event is emitted at all, so all three fail
- [X] T017 [US2] Add the negative cases to `packages/core/tests/session.test.ts`: a tone sustained past `holdMs` never fires a lapse (FR-045), and a dropout shorter than `holdMs` never fires one (FR-046). **Before the fix**: these pass vacuously — no event exists to fire wrongly — so write them to fail by asserting against a spy that also counts live readings, or they will not be testing anything
- [X] T018 [P] [US2] Extend `packages/core/tests/allocation.test.ts` to run 10,000 cycles across live→lapse→live transitions and assert no steady-state heap growth (Principle V)
- [X] T019 [P] [US2] Extend `packages/core/tests/latency.test.ts` to assert re-acquisition after a lapse is no slower than first detection (FR-047)
- [X] T020 [P] [US2] Write `apps/web/e2e/marker-rest.spec.ts` using `apps/web/e2e/helpers.ts:markerOffsetPx` to assert the marker returns to its startup coordinate within 1 second of the tone stopping (FR-043, FR-044, SC-018). **Before the fix**: the marker holds its displaced position indefinitely, so the measured offset stays non-zero. Do **not** weaken `markerOffsetPx` to make this pass — it samples across a second and takes a median precisely because a single sample disagreed by 44 px on correct code
- [X] T021 [P] [US2] Add a mobile equivalent to `apps/mobile/__tests__/tuner-flow.test.tsx` asserting the shared value returns to 0 on lapse

### Implementation

- [X] T022 [US2] Widen `ReadingHandler` to `(cents: number | null, clarity: number)` in `packages/core/src/tuning/session.ts` and wherever it is re-exported from `packages/core/src/types.ts`
- [X] T023 [US2] Emit the lapse event in `packages/core/src/tuning/session.ts` — in `handleFrames`, when `analyze()` returns `null`, call every reading handler once with `(null, 0)`, tracking the transition so it fires on the edge and not per frame (guarantee R3)
- [X] T024 [US2] Widen the `subscribeToCents` handler type in `packages/react/src/useTuner.ts` to match; the hook forwards and needs no behavioural change
- [X] T025 [P] [US2] Handle `null` in `apps/web/src/components/molecules/TuningLine.tsx` by animating the track to the rest transform through the same path a real reading takes, so a lapse reads as a return rather than a jump
- [X] T026 [P] [US2] Handle `null` in `apps/mobile/src/components/molecules/TuningLine.tsx` by setting the shared value to 0 through the same `withTiming` path, honouring the existing reduced-motion branch
- [X] T027 [US2] Update `packages/core/src/tuning/session.ts`'s class-level contract comment to cite guarantee R3, so the code states the new behaviour rather than leaving it only in `contracts/`
- [X] T028 [US2] Measure and record after-numbers for latency and frame time in this file, against the T002/T003 baselines (Principle V requires both in the PR)

**Checkpoint**: ✅ **US2 COMPLETE (2026-08-03)**. **425 unit** (+8), **52 mobile Jest** (+3), **53
Playwright** (+3), all green. Lint, format, typecheck clean. `packages/core` coverage **100% lines**,
94.81% branches — above every threshold.

### T028 — Principle V before/after

| Measurement | Before (T002/T003) | After | Verdict |
| --- | --- | --- | --- |
| First marker movement | 66.576 ms | **66.576 ms** | identical |
| Settle | 136.236 ms | **136.236 ms** | identical |
| Frame time p50 | 8.3 ms | **8.1 ms** | no regression |
| Frame time p95 | 9.2 ms | **9.3 ms** | no regression |
| Frame time max | 13.6 ms | 15.5 ms | scatter — see T003's note; both well inside 16.7 ms |

Latency is unchanged **to the digit**, which is the expected and desirable result: US2 changes when the
session *publishes*, not how the analyzer *computes*. A latency movement here would have meant the lapse
tracking had leaked into the DSP path.

### What this phase found

- **Both `TuningLine` implementations already handled `null` — by accident.**
  `Math.min(50, null)` coerces to `0`, so the clamp landed on the rest position without anyone having
  considered the case. The end-to-end defect was entirely that the session never *sent* a lapse. Both
  components now say `cents === null ? 0 : cents` explicitly: correct-by-coercion is indistinguishable
  from correct-by-intent to the next reader, and only one of them survives a refactor.

- **`CentsReadout` would have printed the string "null".** Not in the plan. It writes the readout
  imperatively from the continuous channel, so the widened type reached it too. Both platforms now render
  the placeholder on a lapse, and both **skip the 10 Hz throttle for it** — that throttle exists to stop
  the last digit strobing on a held note, and waiting up to 100 ms to stop showing a number the tuner no
  longer stands behind is the wrong trade.

- **A near-miss in the mobile readout.** The first attempt gated the display on `live === null`, which is
  also the initial state before any reading arrives — it would have shown the placeholder over a perfectly
  good first frame. Reverted to gating on the discrete snapshot, which is sufficient because a lapse drives
  the status to `listening` in the same frame it fires on the continuous channel.

### Two test-quality notes

- **T019's tests passed on first run, and that is correct here.** FR-047 is a non-regression requirement —
  re-acquisition must not become slower — and the existing filter already satisfied it. They are guard
  tests, and they would fail if the implementation reset more state than the filter already does. Worth
  distinguishing from a *vacuous* test: these assert real measured behaviour that merely happened to
  already hold.

- **The first mobile marker test was vacuous and had to be rewritten twice.** Draft one asserted the
  rendered `transform`, which cannot work: the marker's position lives in a Reanimated shared value written
  from the continuous channel, and that channel deliberately never triggers a render (guarantee R1) — so
  the rendered style reflects the last render, not the lapse. Draft two used an in-tune tone, so the marker
  never left rest and the assertion was trivially true. The final version (`marker-rest.test.tsx`, a
  **deviation** from T021's stated file, because it needs a file-local Reanimated mock) spies on
  `withTiming` and asserts on the targets requested, after first proving the marker was displaced.

### Process note, recorded because it cost work

Extracting the latency numbers uses the T002 workaround — assert them into a failing diff, then restore the
file. **On this run `git checkout --` also wiped the uncommitted T019 tests from the same file**, which had
to be rewritten. The workaround is only safe on a file with no pending changes. This is the second time the
missing measurement output has cost real time; the durable fix remains making `latency.test.ts` report its
own numbers.

---

## Phase 5: User Story 3 — The settings sheet closes only when the user means it (P3)

**Goal**: One dismissal rule — a backdrop press must begin *and* end on the backdrop — expressed on both
platforms.

**Independent test**: Press the reference-pitch control, drag outside the sheet, release; the sheet stays
open with the value retained. Tap the mobile backdrop; the sheet closes.

### Tests (write first, observe failing)

- [X] T029 [P] [US3] Add a drag-out case to `apps/web/e2e/settings.spec.ts`: `mouse.down()` on the reference-pitch slider, move beyond the sheet bounds, `mouse.up()`, then assert the sheet is still open and the adjusted value is retained (FR-048, FR-051). **Before the fix**: the `click` resolves to the backdrop and the sheet closes, so both assertions fail
- [X] T030 [US3] Add cases to `apps/web/e2e/settings.spec.ts` proving the routes that *should* dismiss still do — a press starting and ending on the backdrop, "Done", and Escape (FR-050). **Before the fix**: these pass; they are guard tests against over-correcting T029, so state that in a comment
- [X] T031 [P] [US3] Add a backdrop-press case to `apps/mobile/__tests__/settings.test.tsx` (FR-049). **Before the fix**: the backdrop is a plain `View` with no handler, so nothing closes

### Implementation

- [X] T032 [US3] In `apps/web/src/components/organisms/SettingsSheet.tsx`, record the press origin on `onPointerDown` in a **ref** and dismiss on click only when the origin was the backdrop — a ref rather than state because setting state mid-gesture re-renders the controlled slider being dragged (data-model.md)
- [X] T033 [US3] In `apps/mobile/src/components/screens/SettingsScreen.tsx`, make the backdrop a `Pressable` calling `onClose`, with the sheet swallowing presses so a touch inside it never reaches the backdrop
- [X] T034 [US3] Confirm the web backdrop's existing `stopPropagation` on the sheet is still needed or now redundant, and delete it if redundant — Principle I forbids leaving dead code in place

**Checkpoint**: ✅ **US3 COMPLETE (2026-08-03)**. **425 unit** (unchanged — no core work), **55 mobile
Jest** (+3), **58 Playwright** (+5), all green. Lint, format, typecheck clean.

### The reported gesture does not reproduce, and the defect is real anyway

Worth stating plainly because it changed what got tested. The report named the **pitch slider**: press it,
drag out of the sheet, release, sheet vanishes. That specific gesture was probed directly and **left the
sheet open**. Chromium takes pointer capture on a range input being dragged, so the `mouseup` is retargeted
back to the slider, the `click` lands inside the sheet, and the old `stopPropagation` caught it.

Three gestures were probed against the unfixed build:

| Gesture | Sheet after | Reproduces |
| --- | --- | --- |
| down on the **slider** → up on the backdrop | open | no — pointer capture |
| down on the **sheet body** → up on the backdrop | **closed** | yes |
| down on the **backdrop** → up on the **sheet** | **closed** | yes |

So the behaviour reported is real, the mechanism is press-origin rather than the slider, and the tests are
written around the two gestures that actually demonstrate it. The slider case is kept as an FR-051 test
that the adjusted value survives.

### One thing the plan got wrong

Research D4 and T032 both said to record the press **origin**. That is insufficient on its own. The click's
target is the backdrop for *every* mixed gesture — it is the common ancestor in both directions — so
checking `event.target === event.currentTarget` alongside a stored origin still dismissed on
backdrop-down → sheet-up. Both ends have to be recorded: `onPointerDown` sets the flag,
`onPointerUp` narrows it, and the click handler deliberately does **not** test its own target, because that
check passes for exactly the cases it is meant to reject.

### Two implementation notes

- **T034: the sheet's `stopPropagation` is now genuinely dead and was deleted.** The gesture check
  subsumes it — a press with either end inside the sheet no longer dismisses, whichever direction it went.
- **`accessibilityElementsHidden` on the mobile backdrop hid the entire sheet.** The backdrop is the
  sheet's parent, so that prop took every control inside it out of the accessibility tree, and eleven
  existing tests failed instantly. Replaced with `accessible={false}`, which un-groups the wrapper without
  hiding its descendants. Screen-reader users dismiss with Done or the platform back gesture — the same
  position as the web, where the backdrop is not keyboard-reachable and Escape does the job.

React Native needed no press-origin tracking: its responder system grants a touch to one view for the whole
gesture rather than resolving to a common ancestor on release, so a touch starting inside the sheet never
reaches the backdrop.

---

## Phase 6: User Story 4 — The reference-pitch control looks like a control (P4)

**Goal**: The standard state reads as pressable without flattening the non-standard state's emphasis.

**Independent test**: Axe over both states in light and dark; greyscale check; and a human who has not
seen the app identifies the control unprompted.

### Tests (write first, observe failing)

- [X] T035 [P] [US4] Extend `apps/web/e2e/a11y.spec.ts` to run Axe over the tuner screen with the reference pitch at 440 **and** at a non-standard value, in light and dark, asserting the composited contrast of the control's text and border (FR-054). **Before the fix**: the standard state's border is `transparent` and the text sits at `opacity: 0.6` — assert the border is visible and this fails
- [X] T036 [P] [US4] Extend `apps/web/e2e/appearance.spec.ts` to assert the control is distinguishable as interactive under greyscale, and that the non-standard state remains more prominent than the standard one (FR-053, FR-015)
- [X] T037 [P] [US4] Add a mobile assertion to `apps/mobile/__tests__/settings.test.tsx` that the standard state renders a visible border

### Implementation

- [X] T038 [P] [US4] Give the standard state a visible border from the `line` token in `apps/web/src/components/atoms/ReferenceBadge.tsx` and **remove** the `opacity: 0.6` multiplier rather than raising it — opacity is the mechanism that defeated a correct token at 3.9:1 in `001`, and the tokens package's own contrast test cannot see it (research D5)
- [X] T039 [P] [US4] Make the same change in `apps/mobile/src/components/atoms/ReferenceBadge.tsx`
- [X] T040 [US4] Verify the non-standard state is still louder than the standard state on **two** channels — colour and weight — so FR-022's "never a silent surprise" survives the standard state gaining a border

**Checkpoint**: ✅ **US4 COMPLETE (2026-08-03)**. **425 unit** (unchanged — no core work), **57 mobile
Jest** (+2), **64 Playwright** (+6), all green. Lint, format, typecheck clean.

### The change

Both states now carry a border; the standard one uses the `line` token and **loses its `opacity: 0.6`
entirely** rather than having it raised. That is research D5's point and `001`'s hard-won lesson: opacity is
the mechanism that defeated a *correct* colour token at 3.9:1, and the tokens package's contrast test
cannot see it, because it checks the palette while Axe checks the composite.

The measurement is on the composited result, in both appearances: border ≥ 3:1 against the first
non-transparent ancestor background (the AA floor for a meaningful graphic), text ≥ 4.5:1, and computed
opacity exactly 1.

### T040 was a verification task, so it was verified rather than asserted

The prominence guard passes both before and after the fix, which makes it exactly the kind of test that can
be silently vacuous. It was checked by flattening the distinction — non-standard given the same colour and
weight as standard — and the guard **failed**, so it is measuring what it claims. FR-022's emphasis is
carried on two channels, colour and weight, so it survives greyscale on weight alone.

### A flaky test of my own making, found here and fixed

`marker-rest.spec.ts` from US2 failed once during this phase's full run and passed on re-run — 2 of 3, then
1 of 3. Not caused by US4: the badge change is confined to the reference control and does not move the
marker.

The bug was in the test. It polled until the marker was within **3 px** of rest and then asserted
**sub-pixel** equality, so a poll that returned mid-flight — the marker travels back over `motion.markerMs`
by design — failed on correct code. Both bounds are now the same 0.5 px number, so the poll cannot return
before the assertion can hold. Verified across five consecutive runs. **The fix tightens the wait rather
than loosening the assertion**, which matters: FR-044's claim is that the rest position *is* the startup
position, not merely near it, and relaxing the tolerance would have quietly deleted the requirement to make
a flake go away.

---

## Phase 7: User Story 5 — The settings sheet appears without the backdrop sliding (P5)

**Goal**: The mobile dim reaches full extent immediately; only the sheet slides.

**Independent test**: Open settings on mobile and compare against the web sheet, which is the reference.

### Tests (write first, observe failing)

- [X] T041 [P] [US5] Add a case to `apps/mobile/__tests__/settings.test.tsx` asserting the `Modal` no longer uses `animationType="slide"` and that the sheet carries its own entering animation (FR-055, FR-056). **Before the fix**: the prop is `"slide"`, so the assertion fails
- [X] T042 [US5] Add a case to `apps/mobile/__tests__/settings.test.tsx` asserting the sheet's animation is dropped entirely — not merely shortened — when reduced motion is enabled (FR-057), matching the convention already in `apps/mobile/src/components/molecules/TuningLine.tsx`

### Implementation

- [X] T043 [US5] In `apps/mobile/src/components/screens/SettingsScreen.tsx`, set `animationType="none"`, render the backdrop at full opacity immediately, and animate only the sheet with Reanimated — already a dependency and already driving the marker, so no new install cost (research D6)
- [X] T044 [US5] Read `AccessibilityInfo.isReduceMotionEnabled` in `apps/mobile/src/components/screens/SettingsScreen.tsx` and skip the sheet animation when enabled, copying the pattern in `TuningLine.tsx` rather than inventing a second one

**Checkpoint**: ✅ **US5 COMPLETE (2026-08-03)**. **425 unit** (unchanged), **60 mobile Jest** (+3), **64
Playwright** (unchanged — US5 is mobile-only), all green. Lint, format, typecheck, build clean.

`animationType="none"` on the `Modal`, backdrop at full extent immediately, and the sheet carrying its own
Reanimated slide — the same `useSharedValue` + `withTiming` shape `TuningLine.tsx` already uses, so no
second animation idiom enters the codebase.

### A real defect found by writing the reduced-motion test

`AccessibilityInfo.isReduceMotionEnabled()` is **async**, and the naive `useState(false)` default means the
open animation fires in the gap before it resolves. On a device with reduced motion enabled the sheet would
animate exactly once, on every open, for the users who asked it not to.

The state is now `boolean | null`, and the sheet holds off-screen until the preference is known. This was
not in the plan and would not have been caught by inspection — the test failed with one recorded
`withTiming` call where it expected none, which is precisely the one-frame window the bug lives in.
`TuningLine.tsx` has the same async shape but is not exposed to it, because it only consults the preference
when a reading arrives, by which time the promise has long resolved.

### Test-harness notes

- **Deviation from T041/T042**, which named `settings.test.tsx`: both assertions need a Reanimated mock that
  **records** what it was asked to animate, and the shared mock in `jest.setup.js` resolves `withTiming`
  straight to its target — under it an animated sheet and a static one render identically. `marker-rest.test.tsx`
  set the precedent for a file-local mock; this follows it.

- **The reduced-motion test was vacuous first, in the same shape as the US2 negatives.** With no animation
  yet to suppress, "expect zero timing calls" passed against unfixed code. It now asserts the positive
  first — a normal open *does* animate — then re-renders with the preference on and asserts none.

- **`Promise.resolve()` is the wrong settle here.** A microtask settle after `render` overlaps RNTL's own
  act scope, React reports "overlapping act() calls", and the symptom is a render that produced *nothing*
  — `toJSON()` returns null and every query fails with a misleading "unable to find" message. The
  timer-based `settle()` that `settings.test.tsx` already uses is the working form; that cost a debugging
  cycle to trace from the symptom back to the cause.

- **One assertion moved rather than kept in its own test.** A standalone "the sheet still renders when the
  animation is skipped" case renders an empty tree under RNTL whenever the spy is active on a test's
  *first* render — a harness interaction, not a product fault. The assertion now lives inside the
  reduced-motion test, which reaches the same state through a shape that works. Coverage is unchanged;
  only the harness is.

Not verified here: **V21 is on-device only** (T051). An assertion on `animationType` proves the platform
slide is off; it cannot prove the result looks right, which is the whole complaint this story started from.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T045 Run the full gate suite and record the counts in this file — all eight must be green
- [X] T046 [P] Confirm `packages/core` coverage has not regressed below the 90% line / 90% function / 85% branch thresholds, and record the numbers
- [X] T047 [P] Run the complete Axe sweep across every new and changed control state in `apps/web/e2e/a11y.spec.ts` (V20)
- [X] T048 [P] Capture light and dark screenshots of both apps — required by this repo for any UI change, and this feature is entirely UI — **partial: web only**, in [screenshots/](./screenshots/), reviewed by eye and it **found a defect the whole suite missed** (see below). The mobile half needs the device
- [X] T049 Confirm cold start to first reading is still within the 2-second budget (FR-026, SC-022) — US1 adds a control to the first screen the user sees
- [ ] T050 Run quickstart **V14** and **V15** on a physical device, including the OS recording-indicator check, which cannot be verified in a browser — **NOT RUN: no device connected for this run**
- [ ] T051 Run quickstart **V21** on a physical device and record a screen capture, since the defect is an animation and an assertion on props does not prove it looks right — **NOT RUN: device only, and the one item where an assertion genuinely cannot substitute for looking**
- [ ] T052 Run quickstart **V20**'s human leg — someone who has not used the app is asked to change the reference pitch (SC-020) — and record the outcome either way — **NOT RUN: needs a person who has not seen the app**
- [X] T053 Record V14–V21 results in a `validation-results.md` for this feature, following `001`'s format, naming the device used and stating clearly what was not verified
- [X] T054 Update the root `README.md` if the microphone control changes the described first-run experience — **no change needed**: the README is developer-facing (setup, gates, layout, testing) and never described the first-run UX or the old one-shot button

**Checkpoint**: ⚠️ **AUTOMATED WORK COMPLETE; THREE MANUAL GATES OUTSTANDING (2026-08-03)**.

**428 unit** (+14 over the feature), **60 mobile Jest** (+15), **65 Playwright** (+19). All eight gates
green. `packages/core` coverage **100% lines** / 94.81% branches. Cold start **875 ms** against a 2000 ms
budget. Full results in [validation-results.md](./validation-results.md).

### The screenshot found a defect the whole suite missed

The most important thing in this phase, and the second time this project has learned it the same way.

T048's stopped-state capture showed **the marker still sitting at the −20 cents position it held when
capture stopped**, while the readout beside it had cleared to its placeholder and the banner read "The
microphone is off". The tuner was asserting a pitch it was no longer measuring, on the one element the
whole product is built around.

Same cause as US2, on a path US2 did not cover: `stop()` cleared `hasLiveReading` **without publishing the
withdrawal**, so the discrete channel cleared itself as it always has and the continuous channel said
nothing. `doInterrupt` had the identical hole — the platform seizing the microphone froze the marker too.

**Every gate was green when this was found.** 64 Playwright tests, 425 unit tests, Axe clean, and not one
of them looks at the screen. Fixed by extracting `withdrawReading()` and calling it from all three paths
that end a reading; three core regression tests plus one end-to-end, each verified failing against the
unfixed code first. One pre-existing test legitimately broke and was updated rather than weakened — it
asserted the last continuous event was a live reading, which stopped being true once `stop()` withdraws.

### Frame-time `max` is reported, not gated

Worth correcting the earlier phases' framing: `performance.spec.ts` asserts **p50 ≤ 17.5 ms** and
**p95 ≤ 33.4 ms** only. `max` is printed for diagnosis and ranged 9.5–25.1 ms across runs of identical
code. p50 and p95 are unchanged across the entire feature.

### What is left, and why

Three tasks cannot be done from here, and none is blocked by the code:

- **T050** (V14/V15 on device) — the OS recording indicator is the user-facing point of US1 and no browser
  can show it.
- **T051** (V21 on device) — the mobile backdrop animation. The only item in this feature where an
  assertion genuinely cannot substitute for looking, which is precisely what the screenshot lesson above
  is about.
- **T052** (V20 human leg) — whether someone who has not seen the app finds the reference control.

T048 is marked done for the web half only; the mobile screenshots need the device too.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. T002 and T003 **must** complete before any Phase 4 source change, or the before/after comparison Principle V requires is unrecoverable.
- **Foundational (Phase 2)**: empty — see the phase note.
- **User Stories (Phases 3–7)**: all independent of one another. Any subset ships.
- **Polish (Phase 8)**: after the stories being shipped.

### User story dependencies

**All five stories are genuinely independent** — an unusual property worth stating plainly, since it means
priority order here is a value judgement rather than a technical constraint.

- **US1 (P1)**: touches the gates, the displays, and a new molecule. No overlap with US2–US5.
- **US2 (P2)**: the only story touching `packages/core` and `packages/react`. Independent of US1 — the
  marker rests on a lapse whether or not the user can stop capture.
- **US3 (P3)** and **US5 (P5)**: both touch `apps/mobile/src/components/screens/SettingsScreen.tsx`.
  **The one source-file collision in the feature.** T033 and T043 must not run in parallel; sequence US3
  before US5 if both are in scope.
- **US4 (P4)**: touches only the two `ReferenceBadge` files. No source collision.

**One shared test file spans three stories.** `apps/mobile/__tests__/settings.test.tsx` is written by
T031 (US3), T037 (US4), T041 and T042 (US5). Those four are `[P]` only *within* their own phase against
other files — they must not be run concurrently with each other. The same applies to
`apps/web/e2e/settings.spec.ts` (T029, T030) and `packages/core/tests/session.test.ts` (T016, T017),
which is why the second task in each of those pairs carries no `[P]`.

### Within each story

- Test tasks are written and observed **failing** before the implementation tasks beneath them.
- Core before the React layer before app components (US2 only — the rest have no core work).
- Web and mobile halves are parallel throughout; they share no files.

### Parallel opportunities

- Setup: T002 and T003 together.
- Every story's test tasks are parallel with each other.
- **The whole feature parallelises by platform**, as in `001`: one developer on `packages/*` + `apps/web`,
  one on `apps/mobile`. The only cross-platform serialisation is US2's core change (T022–T024), which both
  `TuningLine` implementations consume — so T025 and T026 wait on T024, then run in parallel.

---

## Parallel Example: User Story 2

```bash
# All US2 tests first; every one must fail before implementation begins:
Task: "Lapse event tests in packages/core/tests/session.test.ts"
Task: "Sustained-tone and short-dropout negatives in packages/core/tests/session.test.ts"
Task: "Allocation across lapse transitions in packages/core/tests/allocation.test.ts"
Task: "Re-acquisition latency in packages/core/tests/latency.test.ts"
Task: "Marker rest position in apps/web/e2e/marker-rest.spec.ts"
Task: "Shared value returns to 0 in apps/mobile/__tests__/tuner-flow.test.tsx"

# Then core, which both platforms depend on:
Task: "Widen ReadingHandler and emit the lapse in packages/core/src/tuning/session.ts"
Task: "Forward the widened type in packages/react/src/useTuner.ts"

# Then split by platform:
Task: "Handle null in apps/web/src/components/molecules/TuningLine.tsx"
Task: "Handle null in apps/mobile/src/components/molecules/TuningLine.tsx"
```

---

## Implementation Strategy

### MVP

**US1 alone.** It is the only story that adds a capability, the only one with a privacy dimension, and it
ships without touching `packages/core` at all — so it carries none of US2's measurement obligation.

### Incremental delivery

1. **US1** → a tuner you can switch off → demo
2. **US2** → the display stops asserting things it no longer knows
3. **US3** → settings stop closing themselves
4. **US4** → settings become discoverable
5. **US5** → the mobile sheet stops looking broken
6. Polish → gates, screenshots, on-device legs

Each step is independently releasable. If the feature is cut short, cut from the bottom.

### Suggested split for two developers

Platform, not story — every item has a web half and a mobile half sharing no files, except US2's core
change, which lands once and is consumed by both.

---

## Notes

- **Test-first is constitutional** (Principle III), and five of six items are defects, each of which MUST
  add a regression test that fails on the unfixed code. A test that passes on first run is a bug in the
  test.
- **US2 must report before/after latency and frame-time numbers** in the PR (Principle V). T002/T003
  capture the "before"; T028 captures the "after".
- **Any UI change needs light and dark screenshots** (T048). This feature is entirely UI.
- **US4 must be checked with Axe, not by eye.** The palette being correct is not evidence the composited
  result is — `001` shipped 3.9:1 text behind a correct token.
- The `001` out-of-scope list stays binding: no tuning presets, string targets, custom tunings, reference
  tones, accounts, or sync.
- Requirement numbers continue `001`: **FR-036–FR-057**, **SC-016–SC-022**, validation **V14–V21**. Do not
  restart them; they are cited from source.
