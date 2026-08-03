# Implementation Plan: Tuner UX Refinements

**Branch**: `002-tuner-ux-refinements` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-tuner-ux-refinements/spec.md`

## Summary

Six refinements to the shipped tuner: a persistent microphone start/stop control (US1), a marker that
returns to rest when the signal dies (US2), predictable settings-sheet dismissal on both platforms (US3), a
reference-pitch control that looks pressable (US4), and a mobile backdrop that stops sliding (US5).

The dominant finding of Phase 0 is how little of this is new machinery. `TunerSession` already exposes
idempotent `start`/`stop` and an `idle` status; the reading filter already releases a stale reading after
400 ms; the web sheet already has the correct dismissal intent and the wrong event to express it. Four of
the six are corrections at the presentation layer. Only two touch anything shared: **one contract
amendment** (the continuous channel gains a "no reading" event, US2) and **one piece of new UI state**
(user intent to capture, US1).

Nothing here touches pitch detection, the filter chain's maths, the accuracy budget, or the discrete/
continuous channel split that the performance design rests on.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` — unchanged

**Primary Dependencies**: React 19, Vite (web); Expo SDK 57, React Native 0.86, Reanimated,
`react-native-audio-api` (mobile). **No new dependencies.** US5 uses Reanimated, already present and
already driving the marker.

**Storage**: unchanged — `localStorage` (web), AsyncStorage (mobile), behind `PreferencesStore`. The
microphone intent from US1 is deliberately **not** persisted (spec Assumptions).

**Testing**: Vitest (`packages/*`), Jest + `jest-expo` (`apps/mobile`), Playwright + Chromium fake audio
capture (`apps/web/e2e`), plus the runner-agnostic port-contract suite in `packages/core/testing`.

**Target Platform**: iOS 16.4+, Android 8+, evergreen browsers — unchanged

**Project Type**: pnpm workspace; `packages/*` platform-free, `apps/*` thin platform shells

**Performance Goals**: unchanged and binding — ≤100 ms audio-to-display p95, 60 fps sustained, zero
steady-state allocation in the audio path, ≤2 s cold start

**Constraints**: The continuous channel runs at ~43 Hz and must not allocate or touch React state. US2 adds
an event to that channel and is therefore the one change in this feature that can break the frame budget if
done carelessly.

**Scale/Scope**: 5 user stories, 22 requirements, ~12 source files across `packages/core`,
`packages/react`, `apps/web`, `apps/mobile`. No new packages, no new screens.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Code Quality** | No suppressed warnings planned. US2's contract change makes an implicit state ("the marker holds whatever it last had") explicit, which is a net readability gain. Error paths unchanged. | PASS |
| **II. Simplicity** | No new dependencies, no new abstraction layers. US2 reuses the existing 400 ms hold rather than adding a second timer — see research D2. US1's intent state is kept in each app's existing gate rather than promoted into a shared hook, because two occurrences is below the extraction threshold. | PASS |
| **III. Testing (NON-NEGOTIABLE)** | Every item gets a failing test first. US2 and US3 are defects, so each requires a regression test that fails on the unfixed code — the rule is explicit. The port-contract suite gains no obligations (no port behaviour changes). | PASS |
| **IV. UX Consistency** | The whole feature is UX consistency work. US4 must not break FR-015's colour-independence or the AA contrast floor; US5 must honour reduced motion. Both are gated by existing automated checks (`appearance.spec.ts`, `a11y.spec.ts`). | PASS |
| **V. Performance** | US2 touches the ~43 Hz path and therefore requires before/after latency and frame-time numbers in the PR, per the constitution. Design keeps it allocation-free: the rest event is a single transition-triggered call, not a per-frame publication. | PASS, with a measurement obligation |
| **VI. Scalability** | Dependencies still point inward only. The one core change is an additive widening of an existing handler signature, documented in `contracts/`. No branching logic added to the detection path. | PASS |

**No violations. Complexity Tracking section omitted — nothing to justify.**

Two obligations this gate creates, carried into `tasks.md`:

1. **US2 must report before/after latency and frame-time numbers** (Principle V). It modifies the render
   path fed by the continuous channel.
2. **US4 must be verified by Axe, not by eye.** The repo has already been bitten once here — a correct
   colour token at `opacity: 0.55` measured 3.9:1 against the 4.5:1 floor, and the tokens package's own
   contrast test could not see it because it checks the palette rather than the composited result.

## Project Structure

### Documentation (this feature)

```text
specs/002-tuner-ux-refinements/
├── plan.md              # This file
├── research.md          # Phase 0 output — the six root causes and the decisions
├── data-model.md        # Phase 1 output — state added, state changed
├── quickstart.md        # Phase 1 output — V14–V21 validation scenarios
├── contracts/
│   └── core-api-delta.md   # Phase 1 output — the one amendment to the core API
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # NOT created by /speckit-plan
```

### Source Code (repository root)

Files this feature touches. Everything else in the tree is untouched.

```text
packages/core/src/
├── tuning/session.ts            # US2: emit a rest event on the reading→null transition
└── types.ts                     # US2: ReadingHandler signature (re-exported)

packages/core/tests/
├── session.test.ts              # US2: rest event fires once, on transition only
├── allocation.test.ts           # US2: the rest path still allocates nothing
└── latency.test.ts              # US2: before/after numbers for Principle V

packages/react/src/
├── useTuner.ts                  # US2: widen subscribeToCents handler type
└── announcement.ts              # US1: announcement text for the capture control

apps/web/src/
├── components/organisms/TunerGate.tsx      # US1: owns capture intent
├── components/organisms/TunerDisplay.tsx   # US1: renders the control
├── components/molecules/MicrophoneToggle.tsx  # US1: NEW
├── components/molecules/TuningLine.tsx     # US2: handle the rest event
├── components/organisms/SettingsSheet.tsx  # US3: press-origin dismissal
└── components/atoms/ReferenceBadge.tsx     # US4: visible affordance

apps/web/e2e/
├── microphone-toggle.spec.ts    # US1: NEW
├── marker-rest.spec.ts          # US2: NEW
├── settings.spec.ts             # US3: drag-out regression
├── a11y.spec.ts                 # US4: Axe over the new control states
└── appearance.spec.ts           # US4: affordance survives greyscale

apps/mobile/src/
├── components/organisms/TunerGate.tsx      # US1: mirrors web
├── components/organisms/TunerDisplay.tsx   # US1: renders the control
├── components/molecules/MicrophoneToggle.tsx  # US1: NEW
├── components/molecules/TuningLine.tsx     # US2: handle the rest event
├── components/screens/SettingsScreen.tsx   # US3 + US5: backdrop press, backdrop animation
└── components/atoms/ReferenceBadge.tsx     # US4: visible affordance

apps/mobile/__tests__/
├── microphone-toggle.test.tsx   # US1: NEW
├── settings.test.tsx            # US3 + US5
└── tuner-flow.test.tsx          # US2
```

**Structure Decision**: No structural change. The existing `packages/*` ← `apps/*` layering and the
atoms → molecules → organisms → screens/pages component hierarchy both hold. `MicrophoneToggle` is a
molecule on both platforms — it composes a button with state-dependent copy, which is more than an atom
and less than an organism, matching where `PermissionPrompt` already sits.

The one judgement call worth naming: **US1's capture-intent state lives in each app's `TunerGate` rather
than in `packages/react`.** Both gates already own an equivalent piece of local state (`accepted`), both
already call `useMicrophoneLifecycle`, and the constitution's rule is to extract on the third occurrence,
not the second. Promoting it to a shared hook now would be the premature abstraction Principle II forbids.
The risk this accepts — the two platforms drifting — is mitigated by the acceptance scenarios being
identical for both and by both suites asserting the same behaviour. If a third consumer appears, extract.

## Phase 0: Research

See [research.md](./research.md). Six root causes established by reading the code, not by inference, plus
six decisions. The two that changed the spec:

- **D2** — the reading filter already releases after 400 ms and the readout already clears itself. The
  spec's assumed 2-second threshold and its assumption that the readout needed fixing were both wrong.
  Corrected in the spec; the marker now rests on the same 400 ms release, and no new constant is
  introduced.
- **D1** — a user-initiated stop cannot be expressed by calling `session.stop()` alone, because
  `useMicrophoneLifecycle` calls `start()` on every return to the foreground and would silently undo it.
  Intent has to gate the lifecycle hook, not race it.

## Phase 1: Design

See [data-model.md](./data-model.md), [contracts/core-api-delta.md](./contracts/core-api-delta.md), and
[quickstart.md](./quickstart.md).

**One contract amendment.** `ReadingHandler` widens from `(cents: number, clarity: number)` to
`(cents: number | null, clarity: number)`, and the session emits `(null, 0)` exactly once when a reading
lapses. `null` rather than `0` because a marker at centre is precisely what "perfectly in tune" looks
like — publishing `0` would make the two states pixel-identical on the channel that positions the marker.
Guarantee **R3** is added to cover the new event; **R1** and **R2** are unchanged.

**No data-model additions to `packages/core`.** The only new state is UI-local: capture intent per app
gate. Preferences are untouched, so no persistence migration is needed (Principle VI's versioning rule is
not engaged).

**Eight new validation scenarios**, V14–V21, extending `001`'s V1–V13 rather than renumbering them.

## Post-Design Constitution Re-Check

Re-evaluated after the design above. **Still no violations.**

The design decision that most deserved re-checking is US2's contract widening, against Principle VI's rule
that I/O boundaries stay narrow and Principle V's allocation ban. It survives both: the signature widens by
one nullable, no port changes, and the rest event fires on a state transition rather than per frame, so the
steady-state allocation count stays at zero and `allocation.test.ts` gains a case rather than an exemption.

The second is US1 against Principle II. Adding a user-facing control is scope the spec asked for, not
speculative generality; the control has exactly two states and no configuration. The rejected alternative —
a shared `useMicrophoneControl` hook in `packages/react` — is recorded in research D1 and would be the
right move at a third consumer.

## Complexity Tracking

Not applicable. No constitution violations to justify.
