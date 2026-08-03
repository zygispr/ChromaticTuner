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

- [ ] T001 Confirm all eight gates pass on a clean checkout of `002-tuner-ux-refinements` and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [ ] T002 [P] Record baseline latency numbers from `packages/core/tests/latency.test.ts` (first movement and settle, in ms) in this file, before any source change — US2 modifies the render path and the constitution requires before/after numbers in the PR
- [ ] T003 [P] Record baseline frame-time numbers (p50/p95/max) from `apps/web/e2e/performance.spec.ts` in this file, before any source change

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

- [ ] T004 [P] [US1] Write `apps/web/e2e/microphone-toggle.spec.ts` covering stop → no readings → start → readings resume, and that the control's accessible name changes between states (FR-036–FR-039, FR-042). **Before the fix**: no such control exists, so the locator finds nothing and every case fails
- [ ] T005 [P] [US1] Add a case to `apps/web/e2e/microphone-toggle.spec.ts` that stops capture, dispatches a real `visibilitychange` to hidden and back to visible, and asserts capture is still stopped (FR-040). **Before the fix**: `useMicrophoneLifecycle` calls `start()` on return, so this fails even once a toggle exists — this is the case most likely to be faked by a mocked flag, so it must drive the real event
- [ ] T006 [P] [US1] Write `apps/mobile/__tests__/microphone-toggle.test.tsx` mirroring T004 and T005, driving `AppState` rather than `visibilitychange`. **Before the fix**: same failures as T004/T005
- [ ] T007 [P] [US1] Add a test to `packages/react/tests/announcement.test.ts` for the capture-control announcement strings. **Before the fix**: the function does not exist

### Implementation

- [ ] T008 [US1] Add capture-control announcement text to `packages/react/src/announcement.ts`, stating what activating the control will do rather than its current state (FR-039)
- [ ] T009 [P] [US1] Create `apps/web/src/components/molecules/MicrophoneToggle.tsx` — a two-state button using `a11y.minTouchTarget` and token colours only, with `aria-pressed` or an equivalent state exposure (FR-036, FR-042)
- [ ] T010 [P] [US1] Create `apps/mobile/src/components/molecules/MicrophoneToggle.tsx` mirroring T009 with `Pressable` and `accessibilityState`
- [ ] T011 [US1] Add `captureEnabled` state to `apps/web/src/components/organisms/TunerGate.tsx`, gate the `start()` effect on it, and pass `useMicrophoneLifecycle(ready && captureEnabled)` (FR-040, data-model.md)
- [ ] T012 [US1] Make the same change in `apps/mobile/src/components/organisms/TunerGate.tsx`, keeping the two gates structurally identical — they are required to mirror, and drift here is the accepted risk of not extracting a shared hook (research D1)
- [ ] T013 [P] [US1] Render `MicrophoneToggle` in `apps/web/src/components/organisms/TunerDisplay.tsx` without pushing the tuning line below the fold (FR-018 still binds)
- [ ] T014 [P] [US1] Render `MicrophoneToggle` in `apps/mobile/src/components/organisms/TunerDisplay.tsx`
- [ ] T015 [US1] Verify the stopped state is visually distinguishable from listening-but-silent in both apps (FR-039) — a control label alone is not sufficient, since a player glancing from a metre away reads the display, not the button

**Checkpoint**: US1 is independently shippable. Nothing below depends on it.

---

## Phase 4: User Story 2 — A stale reading clears itself (P2)

**Goal**: The marker returns to rest when the reading lapses, on the existing 400 ms filter release.

**Independent test**: Sound a fixture tone, let the marker settle off-centre, stop the tone, and measure
the marker's position against its startup position.

**Read [contracts/core-api-delta.md](./contracts/core-api-delta.md) before starting.** The `null`-not-`0`
decision is the whole point of the design and is easy to undo by accident.

### Tests (write first, observe failing)

- [ ] T016 [P] [US2] Add lapse tests to `packages/core/tests/session.test.ts`: a lapse fires the reading handler exactly once with `(null, 0)`; a second lapse with no intervening reading fires nothing; re-acquisition then lapsing fires again (guarantee R3). **Before the fix**: no lapse event is emitted at all, so all three fail
- [ ] T017 [US2] Add the negative cases to `packages/core/tests/session.test.ts`: a tone sustained past `holdMs` never fires a lapse (FR-045), and a dropout shorter than `holdMs` never fires one (FR-046). **Before the fix**: these pass vacuously — no event exists to fire wrongly — so write them to fail by asserting against a spy that also counts live readings, or they will not be testing anything
- [ ] T018 [P] [US2] Extend `packages/core/tests/allocation.test.ts` to run 10,000 cycles across live→lapse→live transitions and assert no steady-state heap growth (Principle V)
- [ ] T019 [P] [US2] Extend `packages/core/tests/latency.test.ts` to assert re-acquisition after a lapse is no slower than first detection (FR-047)
- [ ] T020 [P] [US2] Write `apps/web/e2e/marker-rest.spec.ts` using `apps/web/e2e/helpers.ts:markerOffsetPx` to assert the marker returns to its startup coordinate within 1 second of the tone stopping (FR-043, FR-044, SC-018). **Before the fix**: the marker holds its displaced position indefinitely, so the measured offset stays non-zero. Do **not** weaken `markerOffsetPx` to make this pass — it samples across a second and takes a median precisely because a single sample disagreed by 44 px on correct code
- [ ] T021 [P] [US2] Add a mobile equivalent to `apps/mobile/__tests__/tuner-flow.test.tsx` asserting the shared value returns to 0 on lapse

### Implementation

- [ ] T022 [US2] Widen `ReadingHandler` to `(cents: number | null, clarity: number)` in `packages/core/src/tuning/session.ts` and wherever it is re-exported from `packages/core/src/types.ts`
- [ ] T023 [US2] Emit the lapse event in `packages/core/src/tuning/session.ts` — in `handleFrames`, when `analyze()` returns `null`, call every reading handler once with `(null, 0)`, tracking the transition so it fires on the edge and not per frame (guarantee R3)
- [ ] T024 [US2] Widen the `subscribeToCents` handler type in `packages/react/src/useTuner.ts` to match; the hook forwards and needs no behavioural change
- [ ] T025 [P] [US2] Handle `null` in `apps/web/src/components/molecules/TuningLine.tsx` by animating the track to the rest transform through the same path a real reading takes, so a lapse reads as a return rather than a jump
- [ ] T026 [P] [US2] Handle `null` in `apps/mobile/src/components/molecules/TuningLine.tsx` by setting the shared value to 0 through the same `withTiming` path, honouring the existing reduced-motion branch
- [ ] T027 [US2] Update `packages/core/src/tuning/session.ts`'s class-level contract comment to cite guarantee R3, so the code states the new behaviour rather than leaving it only in `contracts/`
- [ ] T028 [US2] Measure and record after-numbers for latency and frame time in this file, against the T002/T003 baselines (Principle V requires both in the PR)

**Checkpoint**: US2 is independently shippable and does not depend on US1.

---

## Phase 5: User Story 3 — The settings sheet closes only when the user means it (P3)

**Goal**: One dismissal rule — a backdrop press must begin *and* end on the backdrop — expressed on both
platforms.

**Independent test**: Press the reference-pitch control, drag outside the sheet, release; the sheet stays
open with the value retained. Tap the mobile backdrop; the sheet closes.

### Tests (write first, observe failing)

- [ ] T029 [P] [US3] Add a drag-out case to `apps/web/e2e/settings.spec.ts`: `mouse.down()` on the reference-pitch slider, move beyond the sheet bounds, `mouse.up()`, then assert the sheet is still open and the adjusted value is retained (FR-048, FR-051). **Before the fix**: the `click` resolves to the backdrop and the sheet closes, so both assertions fail
- [ ] T030 [US3] Add cases to `apps/web/e2e/settings.spec.ts` proving the routes that *should* dismiss still do — a press starting and ending on the backdrop, "Done", and Escape (FR-050). **Before the fix**: these pass; they are guard tests against over-correcting T029, so state that in a comment
- [ ] T031 [P] [US3] Add a backdrop-press case to `apps/mobile/__tests__/settings.test.tsx` (FR-049). **Before the fix**: the backdrop is a plain `View` with no handler, so nothing closes

### Implementation

- [ ] T032 [US3] In `apps/web/src/components/organisms/SettingsSheet.tsx`, record the press origin on `onPointerDown` in a **ref** and dismiss on click only when the origin was the backdrop — a ref rather than state because setting state mid-gesture re-renders the controlled slider being dragged (data-model.md)
- [ ] T033 [US3] In `apps/mobile/src/components/screens/SettingsScreen.tsx`, make the backdrop a `Pressable` calling `onClose`, with the sheet swallowing presses so a touch inside it never reaches the backdrop
- [ ] T034 [US3] Confirm the web backdrop's existing `stopPropagation` on the sheet is still needed or now redundant, and delete it if redundant — Principle I forbids leaving dead code in place

---

## Phase 6: User Story 4 — The reference-pitch control looks like a control (P4)

**Goal**: The standard state reads as pressable without flattening the non-standard state's emphasis.

**Independent test**: Axe over both states in light and dark; greyscale check; and a human who has not
seen the app identifies the control unprompted.

### Tests (write first, observe failing)

- [ ] T035 [P] [US4] Extend `apps/web/e2e/a11y.spec.ts` to run Axe over the tuner screen with the reference pitch at 440 **and** at a non-standard value, in light and dark, asserting the composited contrast of the control's text and border (FR-054). **Before the fix**: the standard state's border is `transparent` and the text sits at `opacity: 0.6` — assert the border is visible and this fails
- [ ] T036 [P] [US4] Extend `apps/web/e2e/appearance.spec.ts` to assert the control is distinguishable as interactive under greyscale, and that the non-standard state remains more prominent than the standard one (FR-053, FR-015)
- [ ] T037 [P] [US4] Add a mobile assertion to `apps/mobile/__tests__/settings.test.tsx` that the standard state renders a visible border

### Implementation

- [ ] T038 [P] [US4] Give the standard state a visible border from the `line` token in `apps/web/src/components/atoms/ReferenceBadge.tsx` and **remove** the `opacity: 0.6` multiplier rather than raising it — opacity is the mechanism that defeated a correct token at 3.9:1 in `001`, and the tokens package's own contrast test cannot see it (research D5)
- [ ] T039 [P] [US4] Make the same change in `apps/mobile/src/components/atoms/ReferenceBadge.tsx`
- [ ] T040 [US4] Verify the non-standard state is still louder than the standard state on **two** channels — colour and weight — so FR-022's "never a silent surprise" survives the standard state gaining a border

---

## Phase 7: User Story 5 — The settings sheet appears without the backdrop sliding (P5)

**Goal**: The mobile dim reaches full extent immediately; only the sheet slides.

**Independent test**: Open settings on mobile and compare against the web sheet, which is the reference.

### Tests (write first, observe failing)

- [ ] T041 [P] [US5] Add a case to `apps/mobile/__tests__/settings.test.tsx` asserting the `Modal` no longer uses `animationType="slide"` and that the sheet carries its own entering animation (FR-055, FR-056). **Before the fix**: the prop is `"slide"`, so the assertion fails
- [ ] T042 [US5] Add a case to `apps/mobile/__tests__/settings.test.tsx` asserting the sheet's animation is dropped entirely — not merely shortened — when reduced motion is enabled (FR-057), matching the convention already in `apps/mobile/src/components/molecules/TuningLine.tsx`

### Implementation

- [ ] T043 [US5] In `apps/mobile/src/components/screens/SettingsScreen.tsx`, set `animationType="none"`, render the backdrop at full opacity immediately, and animate only the sheet with Reanimated — already a dependency and already driving the marker, so no new install cost (research D6)
- [ ] T044 [US5] Read `AccessibilityInfo.isReduceMotionEnabled` in `apps/mobile/src/components/screens/SettingsScreen.tsx` and skip the sheet animation when enabled, copying the pattern in `TuningLine.tsx` rather than inventing a second one

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T045 Run the full gate suite and record the counts in this file — all eight must be green
- [ ] T046 [P] Confirm `packages/core` coverage has not regressed below the 90% line / 90% function / 85% branch thresholds, and record the numbers
- [ ] T047 [P] Run the complete Axe sweep across every new and changed control state in `apps/web/e2e/a11y.spec.ts` (V20)
- [ ] T048 [P] Capture light and dark screenshots of both apps — required by this repo for any UI change, and this feature is entirely UI
- [ ] T049 Confirm cold start to first reading is still within the 2-second budget (FR-026, SC-022) — US1 adds a control to the first screen the user sees
- [ ] T050 Run quickstart **V14** and **V15** on a physical device, including the OS recording-indicator check, which cannot be verified in a browser
- [ ] T051 Run quickstart **V21** on a physical device and record a screen capture, since the defect is an animation and an assertion on props does not prove it looks right
- [ ] T052 Run quickstart **V20**'s human leg — someone who has not used the app is asked to change the reference pitch (SC-020) — and record the outcome either way
- [ ] T053 Record V14–V21 results in a `validation-results.md` for this feature, following `001`'s format, naming the device used and stating clearly what was not verified
- [ ] T054 Update the root `README.md` if the microphone control changes the described first-run experience

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
