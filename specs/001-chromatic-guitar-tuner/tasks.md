---

description: "Task list for Chromatic Guitar Tuner implementation"
---

# Tasks: Chromatic Guitar Tuner

**Input**: Design documents from `/specs/001-chromatic-guitar-tuner/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and **mandatory**. Constitution v2.0.0 Principle III is marked NON-NEGOTIABLE: failing
tests MUST exist before core logic lands, accuracy MUST be verified against generated reference signals, and
the zero-allocation rule MUST be enforced by an automated check. Test tasks are ordered first within each
phase and MUST be observed failing before the implementation tasks that follow them.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Exact file paths are included in every task

## Path Conventions

Monorepo per [plan.md](./plan.md#source-code-repository-root): `packages/core`, `packages/tokens`,
`packages/react`, `apps/web`, `apps/mobile`. All paths below are repo-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo scaffolding and the quality gates that every later task is measured against.

- [X] T001 Create pnpm workspace root: `pnpm-workspace.yaml` listing `packages/*` and `apps/*`, plus root `package.json` with the `lint`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:e2e` scripts from quickstart.md
- [X] T002 [P] Create `tsconfig.base.json` at repo root with `strict: true`, `noUncheckedIndexedAccess`, ES2022 target, and workspace path aliases
- [X] T003 [P] Create base ESLint flat config in `eslint.config.js` with TypeScript rules; CI invocation must use `--max-warnings 0` (Principle I)
- [X] T004 [P] Create `.prettierrc` and `.prettierignore` at repo root
- [X] T005 [P] Scaffold `packages/core`: `package.json` (name `@chromatic-tuner/core`, dependency `pitchy@^4.1.0`), `tsconfig.json`, `vitest.config.ts`
- [X] T006 [P] Scaffold `packages/tokens`: `package.json` (name `@chromatic-tuner/tokens`, **zero runtime dependencies**), `tsconfig.json`, `vitest.config.ts`
- [X] T007 [P] Scaffold `packages/react`: `package.json` (name `@chromatic-tuner/react`, peer dep `react@^19`), `tsconfig.json`, `vitest.config.ts`
- [X] T008 Scaffold `apps/web`: Vite + React 19 + TypeScript in `apps/web/`, with workspace deps on core/tokens/react
- [X] T009 Scaffold `apps/mobile`: Expo SDK 57 project in `apps/mobile/`, pin `react-native-audio-api@0.13.2`, add its Expo config plugin to `app.json`, declare `NSMicrophoneUsageDescription` and `android.permission.RECORD_AUDIO`, and add `react-native-reanimated`
- [X] T010 [P] Configure Vitest coverage in `vitest.config.ts` with a ≥90% line threshold scoped to `packages/core` — **deviation**: `vitest.workspace.ts` was removed in Vitest 4; the current equivalent is `test.projects` in the root `vitest.config.ts`
- [X] T011 [P] Configure `jest-expo` preset in `apps/mobile/jest.config.js` with a module mock for `react-native-audio-api`
- [X] T012 Create CI workflow in `.github/workflows/ci.yml` running lint, format:check, typecheck, test, test:coverage, test:e2e — all six must pass to merge

**Checkpoint**: ✅ **COMPLETE (2026-08-02)**. `pnpm install` resolves with **no peer dependency issues**, and
all six gates plus `pnpm build` and the mobile Jest suite pass. Unit suite runs in ~1 s against the 60 s budget.

Pinned versions resolved during setup: pnpm 11.18.0, TypeScript 5.9.3, ESLint 10.8.0, Prettier 3.9.6,
Vitest 4.1.10, Vite 8.2.0, Expo 57.0.9, React Native 0.86.2, React 19.2.8, pitchy 4.1.0.

Three dependency corrections were required against the plan's stated versions:

- `react-native-reanimated` → **~4.5.3** (4.2.x peers `react-native 0.80–0.84`, which excludes RN 0.86)
- `react-native-worklets` → **~0.10.3**, added explicitly — the only range satisfying both reanimated
  (`0.10.x–0.11.x`) and `expo-modules-core` (`≤0.10.x`)
- `jest` → **^29.7.0**, not 30 — `jest-expo@57` is built against Jest 29 throughout

TypeScript is held at **5.9**, not the available 7.0: `typescript-eslint@8` declares `typescript <6.1.0`, so
TS 7 would break the lint gate. This matches the plan's stated "TypeScript 5.x".

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure domain vocabulary, the port interfaces, the test doubles, and the design tokens. Every
user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T013 [P] Write failing note-math tests in `packages/core/tests/notes.test.ts`: `frequencyOf`/`midiFromFrequency` are exact inverses across A0–C8, `nearestNote(...).cents` always within ±50, `noteName` honours sharp/flat style, `octaveOf` correct at octave boundaries
- [X] T014 Implement note math in `packages/core/src/notes/frequency.ts` and `packages/core/src/notes/naming.ts` to pass T013; `noteName` MUST be the only place accidental style is applied (contract §1)
- [X] T015 [P] Write failing tests for `tuningStateOf` and `directionCue` in `packages/core/tests/tuning-state.test.ts`, covering the ±5 cent tolerance edges and the flat→tighten / sharp→loosen mapping
- [X] T016 Implement `tuningStateOf` and `directionCue` in `packages/core/src/notes/state.ts`; these are the single source of the direction cue (FR-007)
- [X] T017 [P] Define `TunerStatus`, `PitchReading`, `TuningState`, `AccidentalStyle` in `packages/core/src/types.ts` per [data-model.md](./data-model.md) §2–§4, with `TunerStatus` as a discriminated union
- [X] T018 [P] Define the `AudioSource` port in `packages/core/src/ports/audio-source.ts` per [contracts/platform-ports.md](./contracts/platform-ports.md) §1, including `AudioSourceError` and `AudioSourceInfo`
- [X] T019 [P] Define the `PreferencesStore` port in `packages/core/src/ports/preferences-store.ts`
- [X] T020 [P] Define the `WakeLock` port in `packages/core/src/ports/wake-lock.ts`
- [X] T021 [P] Implement `ScriptedAudioSource` test double in `packages/core/testing/scripted-audio-source.ts`: replays a `Float32Array` at a controlled rate and can inject any `AudioSourceError` on demand
- [X] T022 [P] Implement `InMemoryPreferencesStore` and `NoopWakeLock` doubles in `packages/core/testing/`
- [X] T023 [P] Implement synthetic signal generators in `packages/core/tests/fixtures/signals.ts`: pure sine, sawtooth, harmonically rich tone with a **deliberately weak fundamental**, and additive noise at a specified SNR
- [X] T024 [P] Define colour tokens with `{ light, dark }` variants for flat/sharp/in-tune/no-reading/background/text/line in `packages/tokens/src/colors.ts`
- [X] T025 [P] Define spacing, type scale, motion durations, and `a11y.minTouchTarget = 44` in `packages/tokens/src/space.ts`, `type.ts`, `motion.ts`, `a11y.ts`
- [X] T026 [P] Write the WCAG contrast test in `packages/tokens/tests/contrast.test.ts` asserting every state colour meets AA (4.5:1 text, 3:1 graphics) against its background in **both** themes — this is guarantee T1/T2, verified by test rather than by eye
- [X] T027 Add ESLint boundary rules to `eslint.config.js`: `packages/core` may not import `react`, `react-native`, or DOM globals; `apps/*` may not use literal colour/spacing/duration values (enforces Principle VI and FR-018)
- [X] T028 [P] Implement the shared, adapter-agnostic port contract suite in `packages/core/testing/port-contract-tests.ts` covering obligations A1–A7, P1–P4, W1–W3 from [contracts/platform-ports.md](./contracts/platform-ports.md) §5
- [X] T029 Create the public barrel export in `packages/core/src/index.ts` exposing only the surface named in [contracts/core-api.md](./contracts/core-api.md)

**Checkpoint**: ✅ **COMPLETE (2026-08-02)**. 95 tests across 5 files, all green in ~190 ms.
`packages/core` coverage is **100% lines / 97.7% statements / 100% functions**, against the ≥90% gate.
All eight checks pass: the six gates plus `pnpm build` and the mobile Jest suite.

Two defects were caught by the tests rather than by review, which is the point of writing them first:

- **The colour palette failed its own greyscale requirement.** The first palette separated flat/sharp/in-tune
  by *hue* but not *luminance* (light-theme flat vs sharp differed by a ratio of 1.01), so in greyscale or with
  colour-vision deficiency the three states were indistinguishable — a direct SC-009 failure. The palette was
  rebuilt so the states are separated by lightness as well as hue, and `tests/contrast.test.ts` now asserts
  both WCAG AA against the background *and* mutual luminance separation.
- **The signal-fixture oracle was wrong.** The zero-crossing estimator quantised to whole periods, giving a
  ~10 Hz error at 440 Hz. Replaced with a first-to-last-crossing measurement with sub-sample interpolation.

Two deliberate deviations, both improvements on the task wording:

- **T028's contract suite imports no test runner.** `packages/*` and `apps/web` run under Vitest while
  `apps/mobile` runs under Jest; a suite tied to either could not be pointed at both real adapters, which
  T045 requires. Each obligation is a plain async function that throws on violation, and the caller wraps it
  in whatever `it()` it has.
- **T027's boundary rules were verified by probe**, not assumed: temporary files importing React into
  `packages/core` and hard-coding `#ff0000` in `apps/web` were confirmed to produce 5 lint errors, then
  deleted. A boundary rule that does not actually fire is worse than none.

---

## Phase 3: User Story 1 - Tune a string to its note on the horizontal line (Priority: P1) 🎯 MVP

**Goal**: Pluck a string, see the nearest note named and its deviation as a marker on one horizontal line —
flat left, sharp right — with colour and an explicit turn direction.

**Independent Test**: Play generated reference tones and real strings; confirm correct note naming, correct
marker side and proportional position, continuous motion as pitch is bent, and the in-tune state within
tolerance. No settings, no permissions UX, no persistence required.

### Tests for User Story 1 ⚠️ MUST FAIL FIRST

- [X] T030 [P] [US1] Write failing accuracy tests in `packages/core/tests/accuracy.test.ts`: sweep every semitone E1–E6 with sine, sawtooth, and weak-fundamental tones at 20 dB SNR, plus deliberate ±1/±20/±49 cent offsets; assert within ±1 cent and correct note+octave (SC-004, V1)
- [X] T031 [P] [US1] Write failing graceful-degradation tests in `packages/core/tests/accuracy-range.test.ts`: outside E1–E6 down to A0 and up to C8, assert the analyzer returns **no reading** rather than a confident wrong one (Constitution v2.0.0 accuracy clause)
- [X] T032 [P] [US1] Write failing stability test in `packages/core/tests/stability.test.ts`: 5 s of a steady noisy tone varies by no more than ±2 cents (SC-005, V2)
- [X] T033 [P] [US1] Write failing allocation test in `packages/core/tests/allocation.test.ts`: 10,000 push/analyze cycles show no steady-state heap growth from core code and return the same reused `PitchReading` instance (Principle V, V4)
- [X] T034 [P] [US1] Write failing `RingBuffer` tests in `packages/core/tests/ring-buffer.test.ts`: wraparound correctness, window extraction order, and no allocation on write
- [X] T035 [P] [US1] Write failing `TunerSession` tests in `packages/core/tests/session.test.ts` using `ScriptedAudioSource`: idempotent start/stop, `idle → listening → reading` transitions, and that `onStatusChange` suppresses equal consecutive statuses (guarantee S4)
- [X] T036 [P] [US1] Write failing `useTuner` tests in `packages/react/tests/use-tuner.test.tsx`: `subscribeToCents` never triggers a React render (R1), values are immutable snapshots (R2), and use outside a provider throws (R3)

### Implementation for User Story 1

- [X] T037 [US1] Implement `RingBuffer` in `packages/core/src/dsp/ring-buffer.ts` with a preallocated 4096-sample `Float32Array` and allocation-free writes
- [X] T038 [US1] Implement `PitchAnalyzer` in `packages/core/src/dsp/pitch-analyzer.ts` wrapping `pitchy` with a preallocated `PitchDetector`, 4096 window / 1024 hop, `setReferencePitch`, and a **reused** `PitchReading` object (contract §2, research D3/D5)
- [X] T039 [US1] Implement the clarity gate, median-of-5 filter, and hold-then-release (~400 ms) stages in `packages/core/src/tuning/filters.ts` (research D7 stages 1, 3, 5 — stages 2 and 4 land in US2)
- [X] T040 [US1] Implement the `TunerSession` state machine in `packages/core/src/tuning/session.ts` with `onStatusChange` (discrete) and `onReading` (continuous) channels
- [X] T041 [US1] Implement `TunerProvider` and `useTuner` in `packages/react/src/TunerProvider.tsx` and `packages/react/src/useTuner.ts`, copying the reused reading into an immutable snapshot exactly once at this boundary
- [X] T042 [US1] Implement `subscribeToCents` in `packages/react/src/useTuner.ts` as a subscription that bypasses React state entirely (research D6)
- [X] T043 [P] [US1] Implement `WebAudioSource` in `apps/web/src/adapters/web-audio-source.ts` and the PCM worklet in `apps/web/src/worklets/pcm-capture.worklet.ts`; `getUserMedia` MUST set `echoCancellation`, `noiseSuppression`, and `autoGainControl` to `false` — browser voice-processing defaults distort sustained tones and silently skew readings
- [X] T044 [P] [US1] Implement `RNAudioSource` in `apps/mobile/src/adapters/rn-audio-source.ts` using `AudioRecorder.onAudioReady({ sampleRate, bufferLength: 1024, channelCount: 1 })`, unwrapping `buffer.getChannelData(0)`
- [X] T045 [US1] Run the T028 port contract suite against `RNAudioSource` in `apps/mobile/__tests__/rn-audio-source.contract.test.ts`, with the mock returning 48 kHz for a 44.1 kHz request to prove obligation A5 — **partial**: `WebAudioSource` needs a real `AudioWorklet`, which jsdom does not provide, so it is covered end-to-end by the Playwright specs instead of by the abstract suite
- [X] T046 [P] [US1] Implement web atoms in `apps/web/src/components/atoms/`: `NoteLabel`, `CentsReadout`, `DirectionCue`, `TickMark` — all styled from `@chromatic-tuner/tokens`
- [X] T047 [US1] Implement `TuningLine` molecule in `apps/web/src/components/molecules/TuningLine.tsx`: ±50 cent span, visible ±5 cent centre zone, marker driven by CSS `transform: translateX()` from `subscribeToCents` (never React state)
- [X] T048 [US1] Implement `TunerDisplay` organism in `apps/web/src/components/organisms/TunerDisplay.tsx` composing note name, cents readout, direction cue, and tuning line, with colour keyed off `TuningState`
- [X] T049 [US1] Implement `TunerLayout` template and `TunerPage` page in `apps/web/src/components/templates/` and `apps/web/src/components/pages/`, and wire `TunerProvider` with the web adapters in `apps/web/src/main.tsx`
- [X] T050 [P] [US1] Implement mobile atoms in `apps/mobile/src/components/atoms/` mirroring T046, using RN primitives and the same tokens
- [X] T051 [US1] Implement `TuningLine` molecule in `apps/mobile/src/components/molecules/TuningLine.tsx` driving the marker transform from a **Reanimated shared value** so motion stays on the UI thread (research D6)
- [X] T052 [US1] Implement `TunerDisplay` organism in `apps/mobile/src/components/organisms/TunerDisplay.tsx`
- [X] T053 [US1] Implement the tuner screen in `apps/mobile/src/components/screens/TunerScreen.tsx` and wire `TunerProvider` with the mobile adapters in `apps/mobile/src/App.tsx`
- [X] T054 [US1] Honour the platform reduced-motion preference in both `TuningLine` implementations, falling back to 0 ms transitions (FR-016, token guarantee T4)
- [X] T055 [P] [US1] Add Playwright E2E in `apps/web/e2e/tuning.spec.ts` with fixtures `e2-in-tune.wav`, `e2-flat-20.wav`, `e2-sharp-20.wav`, launched via `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture` (V5)
- [X] T056 [P] [US1] Add a `jest-expo` integration test in `apps/mobile/__tests__/tuner-flow.test.tsx` covering the primary flow with the native module mocked

**Checkpoint**: ✅ **COMPLETE (2026-08-02)**. A working chromatic tuner on web and mobile — the MVP.
**309 unit tests**, 12 mobile Jest tests, and **7 Playwright E2E tests driving a real Chromium with a fake
microphone**, all green. `packages/core` coverage 96.3% statements / 97.0% lines. All eight checks pass.

Accuracy measured against generated reference signals: **±1 cent across all 61 semitones E1–E6** for sine,
sawtooth, and weak-fundamental tones, and at 20 dB SNR. Stability holds within ±2 cents over 5 seconds.

Four defects were found by tests or by driving the real browser, none of which review would have caught:

- **MPM alone missed ±1 cent at the top of the band** (1.3–1.9 cents at MIDI 83/88 on harmonically rich
  tones), because its NSDF peak interpolation degrades when the lag is only ~44 samples. Added a phase-advance
  refinement across the window. A first attempt made things *worse* below 172 Hz — the negative-frequency
  image sits under four bins away at 41 Hz and contaminates the phase — so refinement is now gated to
  frequencies where the images separate, using MPM below and phase above. A Hann window on the demodulation
  was then needed for weak-fundamental tones, where the loud second harmonic leaked through the rectangular
  window's sidelobes.
- **`TunerStatus` aliased the reused reading object**, so the change comparison compared an object with
  itself and a genuine note change would never have emitted an event. Now compares first, then publishes a
  copy — so the suppressed case still allocates nothing.
- **`TunerSession.start`/`stop` raced.** React StrictMode's double-invoked effect (start → stop → start) left
  an orphaned audio stream feeding a session whose `running` flag was false: frames arrived, the tuner showed
  "listening" forever. Only surfaced when driving the real browser. Both operations are now serialised
  through a promise queue.
- **A zero-output `AudioWorkletNode` is never pulled by Chrome**, because it is unreachable from the
  destination — `process` was simply never called. It now has one silent output routed through a muted gain
  node to the destination.

Two deliberate deviations from the task wording:

- **T043's worklet is a Blob URL, not a bundler URL import.** `?worker&url` resolves differently in Vite dev
  and in a production build, and an `AudioWorkletGlobalScope` cannot execute ESM imports. A Blob URL behaves
  identically in dev, in the built bundle, and under Playwright.
- **T055's specs are one file per audio fixture.** Playwright rejects `launchOptions` inside a `describe`
  because it forces a new worker, so each fake-microphone WAV needs its own spec file with a top-level
  `test.use`. Fixtures are generated by `e2e/fixtures/generate.mjs` rather than committed as 2 MB of binaries.

---

## Phase 4: User Story 2 - Retune a string to a different note (Priority: P2)

**Goal**: Loosening a string from E to D tracks continuously, flips the note name exactly at each midpoint,
and never flickers when the string sits on a boundary.

**Independent Test**: Sweep a generated tone slowly from E2 through E♭2 to D2; assert name changes at the
midpoints, full-width marker sweep between changes, and zero name changes while dithering at a boundary.

### Tests for User Story 2 ⚠️ MUST FAIL FIRST

- [X] T057 [P] [US2] Write failing semitone-sweep tests in `packages/core/tests/filters.test.ts`: name changes once per boundary crossing on an E2→D2 sweep, and the marker sweeps the full ±50 cent width between changes (V3)
- [X] T058 [P] [US2] Write failing boundary-dither tests in `packages/core/tests/filters.test.ts`: a tone dithering ±2 cents around the E2/E♭2 midpoint produces **zero** name changes (FR-011)
- [X] T059 [P] [US2] Write failing octave-rejection tests in `packages/core/tests/filters.test.ts`: a weak-fundamental low-E tone never reports the harmonic or the wrong octave

### Implementation for User Story 2

- [X] T060 [US2] Add the `displayedMidi` hysteresis stage to `packages/core/src/tuning/filters.ts` — the displayed note changes only once the pitch crosses the midpoint by ~3 cents (research D7 stage 4, data-model §5)
- [X] T061 [US2] Add the octave sanity check to `packages/core/src/tuning/filters.ts` — reject a ±1200 cent jump from the previous confident reading unless clarity is decisively better (research D7 stage 2)
- [X] T062 [US2] Verify the direction cue stays unambiguous across a multi-semitone sweep and add the assertion to `packages/core/tests/tuning-state.test.ts` (SC-008)
- [X] T063 [P] [US2] Add a Playwright sweep E2E in `apps/web/e2e/retune.spec.ts` using a swept-tone WAV fixture covering E2→D2

**Checkpoint**: ✅ **COMPLETE (2026-08-02)**. Alternate tunings are reachable by ear-free retuning; US1 and US2
both work independently. **331 unit tests**, 12 mobile Jest tests, and **10 Playwright E2E tests**, all green.
`packages/core` coverage 98.6% lines, with `filters.ts` at **100% lines / 97.1% branches**. All eight checks pass.

The filter chain is now the full five stages of research D7, in the order contract N4 specifies.

**Test-first was observed**: 14 of the 19 new tests failed before the implementation landed. The dither case
failed by producing `[40, 39, 40, 39, …]` — 24 name changes in three seconds, which is exactly the FR-011
flicker in the raw.

One defect was found, and only by driving the real browser:

- **The numeric cents readout was frozen for most of a retune.** `useTuner().cents` comes from the *discrete*
  status channel, which `TunerSession` republishes only when the note name or the flat/in-tune/sharp state
  changes. So while a string swept from D♯ down through a full semitone, the marker travelled to the end of
  the line while the number beside it still read **−5**. The E2E test measured a minimum of −5 cents where it
  expected −50. Both readouts now follow the continuous channel, written imperatively on web exactly as the
  marker transform is, and throttled to 10 Hz so the last digit does not strobe on a held note (FR-010). This
  was latent from US1: no unit test could see it, because it only exists in the wiring between the session's
  two channels and the DOM.

Two deliberate deviations from the task and research wording:

- **The octave check's tolerance is ±10 cents, not the ±2 research D7 names.** A harmonic lock lands on
  precisely 2× or 0.5× the fundamental, so ±2 is right in the abstract — but the comparison is against the
  previous frame one hop (~23 ms) earlier, and during a retune the pitch is genuinely moving while the
  detector's own error differs between a clean frame and a locked one. At ±2 the check simply would not fire
  on the signals it exists for. Ten cents is still far tighter than any interval a player reaches for.
- **A rejected octave is treated as "no candidate this frame", not as a permanent veto.** A player who really
  does move an octave would otherwise be stuck looking at the wrong note forever. Rejection therefore falls
  through to the hold-then-release stage, so a sustained octave is accepted after ~400 ms while a two-frame
  harmonic glitch never reaches the display. Both paths have a test.

Two things worth recording because they shaped the tests rather than the code:

- **A clean synthetic sweep does not test hysteresis at all** — it crosses each midpoint exactly once whether
  or not the stage exists, and T057's sweep passed before the implementation. Noise is what makes the detector
  jitter across a boundary, so the discriminating version of T057 adds 20 dB SNR; that one did fail first,
  as `[40, 39, 40, 39, 38]`.
- **Five of the first-draft unit tests failed for reasons that were the tests' fault**, not the code's: they
  jumped the clock past the 400 ms hold, and they expected a single frame to change the displayed note when a
  median-of-5 needs three. The rewrite drives the filter through a realistic hop clock, which makes the median's
  latency an asserted property rather than an obstacle.

---

## Phase 5: User Story 3 - Start tuning within seconds, anywhere, offline (Priority: P3)

**Goal**: Live tuner in under two seconds, clear and recoverable permission handling, fully offline, screen
stays awake, microphone released in the background.

**Independent Test**: Cold-start on phone and desktop with the network disabled and time to first reading;
separately deny microphone permission and confirm the recovery messaging and automatic recovery.

### Tests for User Story 3 ⚠️ MUST FAIL FIRST

- [X] T064 [P] [US3] Write failing tests in `packages/core/tests/session-errors.test.ts`: each `AudioSourceError` variant maps to its matching `TunerStatus` with no dead ends (obligation A3, SC-014)
- [X] T065 [P] [US3] Write failing auto-recovery tests in `packages/core/tests/session-errors.test.ts`: granting permission or the device returning transitions back to `listening` with no restart (FR-029, guarantee S2)
- [X] T066 [P] [US3] Write failing wake-lock lifecycle tests in `packages/core/tests/session.test.ts`: the lock is held exactly while `listening` or `reading` (guarantee W2/S3)

### Implementation for User Story 3

- [X] T067 [US3] Map every `AudioSourceError` to its `TunerStatus` in `packages/core/src/tuning/session.ts`, surfacing errors as states and never swallowing them (Principle I, guarantee S1)
- [X] T068 [US3] Wire `onInterrupted` and automatic recovery in `packages/core/src/tuning/session.ts` (FR-029, FR-035)
- [X] T069 [P] [US3] Implement `StatusBanner` and `PermissionPrompt` molecules in `apps/web/src/components/molecules/` with platform-specific recovery steps for every failure state
- [X] T070 [P] [US3] Implement the equivalent molecules in `apps/mobile/src/components/molecules/`
- [X] T071 [P] [US3] Add the pre-permission explainer to both apps stating why the microphone is needed **and** that audio is never recorded or transmitted, shown before the system prompt (FR-028, FR-031)
- [X] T072 [P] [US3] Implement `WebWakeLock` in `apps/web/src/adapters/web-wake-lock.ts`, re-acquiring on `visibilitychange` (obligation W3)
- [X] T073 [P] [US3] Implement `ExpoWakeLock` in `apps/mobile/src/adapters/expo-wake-lock.ts` using `expo-keep-awake`
- [X] T074 [US3] Bind wake-lock acquire/release to session status in `packages/core/src/tuning/session.ts`
- [X] T075 [US3] Release the microphone on backgrounding — `visibilitychange`/`pagehide` in `apps/web/src/main.tsx`, `AppState` in `apps/mobile/src/App.tsx` — and resume promptly on return (FR-033) — **deviation**: both live in a `useMicrophoneLifecycle` hook consumed by `TunerGate`, because the listener needs the session from `useTuner`, which is only reachable inside the provider
- [X] T076 [P] [US3] Add PWA manifest and service worker precaching the full bundle in `apps/web/`, so a cold reload works offline (FR-030, SC-011)
- [X] T077 [US3] Measure and tune cold start to ≤2 s on the lowest supported device; record before/after numbers in the pull request (FR-026) — **partial**: measured on a development Mac, not on the lowest supported device; the on-device measurement belongs to T093/T099
- [X] T078 [P] [US3] Add a Playwright E2E in `apps/web/e2e/permissions.spec.ts` covering denied → granted mid-session with no reload (V6)
- [X] T079 [P] [US3] Add a network-silence check in `apps/web/e2e/no-network.spec.ts` asserting zero outbound requests during a full tuning session (SC-015, V9)

**Checkpoint**: ✅ **COMPLETE (2026-08-02)**. The app is fast, offline, and has no dead ends.
**359 unit tests**, **26 mobile Jest tests**, and **16 Playwright E2E tests**, all green.
`packages/core` coverage 98.8% lines / 90.4% branches. All eight checks pass.

**Cold start measured against the production build** (`scripts/verify-offline.mjs`, real Chromium, fake
microphone, time from navigation to a reported note):

| Start                          | Time to first reading | Budget  |
| ------------------------------ | --------------------- | ------- |
| Cold, no service worker        | **877 ms**            | 2000 ms |
| Warm, service worker serving   | **307 ms**            | 2000 ms |
| **Offline, network disabled**  | **306 ms**            | 2000 ms |

These are development-machine numbers; FR-026's "mid-range device" measurement is T093/T099's job.

**Test-first was observed**: 15 of the 21 new core tests failed before the implementation landed.

Three defects were found, two of them only by running the thing:

- **The service worker cached everything and served none of it.** Offline, the shell loaded but the JS bundle
  failed with `ERR_FAILED` — while `caches.keys()` showed the asset present under exactly the right path. The
  Cache API honours a stored response's `Vary` header when matching, Vite's preview server sends
  `Vary: Origin`, and the `Origin` on a module-script request does not match the one the install-time
  `addAll` fetch sent. Every precached asset missed. `caches.match(..., { ignoreVary: true })` fixes it. This
  is invisible online — the network quietly covers for it — so only an actual offline load could catch it.
- **`TunerProvider` never stopped the session when `autoStart` was false.** The cleanup was registered inside
  an `if (!autoStart) return;`, which was harmless while both apps auto-started and became a real leak the
  moment US3 moved them to `autoStart={false}`: the microphone was never released on unmount (against
  FR-033) and a session parked in a recoverable failure kept its retry timer firing against a tree that no
  longer existed. It surfaced as mobile tests hanging for five minutes.
- **The build-time placeholder substitution replaced the wrong occurrence.** `String.replace` with a string
  pattern replaces only the first match, and the first `__PRECACHE_MANIFEST__` in the worker source is the
  one in its own doc comment — so the emitted worker referenced an undefined identifier and threw on install.
  `replaceAll` fixes it.

Three deliberate deviations:

- **Retry scheduling is injected, not assumed.** `packages/core` compiles against `ES2022` alone — no DOM and
  no Node types — so `setTimeout` is not in scope, and Principle III forbids tests that wait on the wall
  clock. `TunerSessionDeps.scheduleRetry` defaults to a `globalThis` lookup and tests pass a manual scheduler
  they fire by hand.
- **Recovery is retried on a fixed 1 s interval, and only for failures that retrying can fix.**
  `permission-denied` (including `canRetry: false`, since the user may be walking over to Settings),
  `no-microphone`, and `microphone-busy` are retried; `unsupported` and `unknown` are not, because spinning
  on them only costs battery and never changes the answer.
- **The mobile UI tests render the molecules directly** rather than driving provider → gate → session.
  React Native Testing Library 14's asynchronous `render` made the full-stack version a test of RNTL's
  scheduling rather than of the recovery copy; the session already has 47 tests of its own. Two integration
  tests still cover the one thing that genuinely needs the stack — whether the explainer or the tuner shows.

One thing deferred deliberately: the PWA manifest ships **SVG icons only**. Nothing in the spec requires
installability — FR-030 asks for offline function, which the service worker delivers and the table above
verifies — and PNG icons for the install prompt are cosmetic polish, not a US3 requirement.

---

## Phase 6: User Story 4 - Match an ensemble at a non-standard reference pitch (Priority: P4)

**Goal**: Configurable A4 (415–466 Hz) and sharp/flat naming, persisted locally, with a non-standard
reference always visible.

**Independent Test**: Set A4 to 432 Hz and play a 440 Hz tone — it reads ~+32 cents, the indicator is
visible, and the setting survives a restart. Toggle accidentals and confirm every note display follows.

### Tests for User Story 4 ⚠️ MUST FAIL FIRST

- [X] T080 [P] [US4] Write failing preferences tests in `packages/core/tests/preferences.test.ts`: out-of-range A4 clamps, corrupt or absent stored data resolves to defaults without throwing (obligation P1), and `schemaVersion` is written
- [X] T081 [P] [US4] Write failing reference-pitch tests in `packages/core/tests/accuracy.test.ts`: with A4 = 432, a 440 Hz tone reads ~+32 cents (V12) — **note**: the ±32 cent assertion already existed and passed, because `setReferencePitch` shipped in US1; what was genuinely missing and is added here is that dragging the reference never blanks the display, and that the reported *frequency* is unchanged by the reference

### Implementation for User Story 4

- [X] T082 [US4] Implement the `Preferences` model with validation and defaulting in `packages/core/src/preferences.ts`, exposing the derived `isNonStandardReference` flag (data-model §6)
- [X] T083 [US4] Implement `usePreferences` in `packages/react/src/usePreferences.ts` with `setA4Hz` clamping rather than rejecting (guarantee R4)
- [X] T084 [P] [US4] Implement `LocalStoragePreferences` in `apps/web/src/adapters/local-storage-preferences.ts`
- [X] T085 [P] [US4] Implement `AsyncStoragePreferences` in `apps/mobile/src/adapters/async-storage-preferences.ts`
- [X] T086 [US4] Propagate `setReferencePitch` from preferences into the live analyzer without discarding buffered audio, so changing A4 does not blank the display (guarantee N7)
- [X] T087 [P] [US4] Implement the `SettingsSheet` organism in `apps/web/src/components/organisms/SettingsSheet.tsx`: A4 control across 415–466 Hz, accidental toggle, reset to defaults
- [X] T088 [P] [US4] Implement the settings screen in `apps/mobile/src/components/screens/SettingsScreen.tsx` — **deviation**: a stepper rather than a slider, because React Native ships no slider and a stepper is what can actually be operated to the hertz with a thumb
- [X] T089 [P] [US4] Add the persistent non-standard-reference indicator to the tuner screen in both apps (FR-022)

**Checkpoint**: ✅ **COMPLETE (2026-08-02)**. All four user stories are independently functional.
**394 unit tests**, **42 mobile Jest tests**, and **23 Playwright E2E tests**, all green.
`packages/core` coverage 98.8% lines / 91.1% branches. All eight checks pass.

**Test-first was observed**: `preferences.test.ts` could not even resolve its import before `preferences.ts`
existed, and its 21 assertions drove the model's shape.

Two things the design had to reconcile rather than simply implement:

- **Clamping and defaulting are different answers to different questions.** T080 asks for clamping, data-model
  §6 asks for defaulting, and both are right: an out-of-range *number* (500) expresses a direction, so it
  clamps to 466; a value that is not a finite number has no nearest valid value, so it falls back to 440.
  `normalizePreferences` also repairs fields independently — a corrupt reference pitch is no reason to discard
  a perfectly good accidental preference the user actually chose.
- **Obligation P2 conflicts with Principle I unless the failure is reported.** "A save failure must not block
  tuning" and "no silent catch" are only compatible if the outcome travels somewhere, so `savePreferences`
  returns a boolean and `usePreferences` exposes `persistenceFailed`. Both settings screens say the choice
  will not be remembered rather than lying by silence. This is a small, deliberate addition to the contract's
  stated `usePreferences` shape.

Three deliberate design decisions:

- **Preference state lives in `TunerProvider`, not in `usePreferences`.** One source of truth means the
  reference pitch the analyzer is using and the one the settings screen shows cannot drift, and it makes T086
  fall out for free — the same state that renders the badge is the state pushed into the live analyzer.
- **`useTuner` defaults its accidental style to the stored preference** rather than to `'sharp'`. FR-023's
  "everywhere a note is shown" is then structural: any screen using the hook already spells accidentals the
  way the user asked, with no per-screen wiring to forget.
- **The web preferences adapter is verified by Playwright, not by the headless contract suite**, for the same
  reason `WebAudioSource` is (T045): the Vitest projects cover `packages/*` only, and obligation P4 is
  specifically about surviving a full restart — which only a real browser reload demonstrates. The mobile
  adapter runs the shared suite under Jest.

One defect and one long detour, both worth recording:

- **A hard-coded modal scrim broke the T027 boundary rule**, which is the rule working: `rgba(0,0,0,0.45)` on
  mobile and a `color-mix()` on web were two different values for the same thing. Added a `scrim` token —
  the only one carrying alpha, since 8-digit hex is the one notation CSS and React Native both accept
  unchanged — and the token-shape test now allows it.
- **Consecutive state updates appear to stop working under `jest-expo`.** A settings stepper pressed twice
  moved once: the second `setStored` was called with the right value and React never re-rendered. Wrapping
  `fireEvent.press` in `act` fixes it, and the same interaction steps correctly in a real browser, which the
  Playwright V12 spec exercises by setting the reference twice in one session. So it is an artifact of the
  act environment, not the product — but it cost an hour to establish that, and the `press` helper in
  `apps/mobile/__tests__/settings.test.tsx` documents it so the next person does not repeat the investigation.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The constitution's release gates — the checks that cannot be honestly automated in CI, plus
final quality work.

- [ ] T090 [P] Complete accessibility pass in both apps: accessible labels, visible focus, ≥44×44 targets, and state changes announced without spamming assistive tech on every reading (FR-020)
- [ ] T091 [P] Add automated Axe/Lighthouse accessibility checks to `apps/web/e2e/a11y.spec.ts` (V11, SC-013)
- [ ] T092 [P] Verify light and dark appearance across every screen and state in both apps (FR-019)
- [ ] T093 Measure latency on device per quickstart V7 and record the numbers — measure **first marker movement** (~42 ms target), not settle time (~93 ms); conflating them makes a passing build look like a failure
- [ ] T094 Measure sustained frame rate on device per quickstart V8; if React is re-rendering per reading, fix via guarantees R1/S4 rather than by testing on a faster device
- [ ] T095 Run the 30-minute continuous-use thermal and battery check per quickstart V13 (SC-012)
- [ ] T096 Run the glanceability check per quickstart V10: 1 m viewing distance, greyscale, and a colour-vision-deficiency simulator — if greyscale is ambiguous, the FR-015 redundant channels are not working
- [ ] T097 [P] Raise `packages/core` line coverage to ≥90% and close any gaps (Principle III)
- [ ] T098 [P] Write `README.md` with setup and run instructions, prominently noting that **Expo Go will not work** and mobile requires a development build — the most likely first-run failure
- [ ] T099 Run the full quickstart.md validation suite V1–V13 and record results
- [ ] T100 Final constitution compliance review against v2.0.0: quality gates green, no unjustified complexity, tests meaningful, UX consistent, performance budgets measured

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–6)**: All depend on Foundational
- **Polish (Phase 7)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. The MVP.
- **US2 (P2)**: Depends on Foundational. **Soft dependency on US1** — it extends the same filter chain
  (`filters.ts`) that US1 creates. It is independently *testable* the moment US1 exists, which is what the
  spec anticipated, but it is not independently *implementable* before US1.
- **US3 (P3)**: Depends on Foundational. Independent of US1 in principle, but its UI work assumes US1's
  component tree exists. Its core error-mapping work (T064–T068) is genuinely independent.
- **US4 (P4)**: Depends on Foundational. Fully independent of US1–US3 except T086 and T089, which touch the
  live analyzer and the tuner screen.

**Note on the shared file**: US1 (T039), US2 (T060, T061), and US3 all modify
`packages/core/src/tuning/filters.ts` or `session.ts`. These are sequenced, not parallel, and are the main
reason the stories are not fully independent in practice.

### Within Each User Story

- Test tasks MUST be written and observed **failing** before the implementation tasks below them
- Ports and types before adapters
- Core logic before the React layer
- React layer before app components
- Atoms before molecules before organisms before templates/pages

### Parallel Opportunities

- Setup: T002–T007 and T010–T011 in parallel
- Foundational: T013, T015, T017–T026, T028 in parallel — a large batch, since types, ports, doubles,
  fixtures, and tokens touch disjoint files
- Every story's test tasks are parallel with each other
- **Web and mobile implementation runs in parallel throughout** — the adapters (T043/T044), atoms
  (T046/T050), and settings screens (T087/T088) are per-platform pairs with no shared files

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together (all MUST fail before implementation begins):
Task: "Accuracy tests sweeping E1-E6 in packages/core/tests/accuracy.test.ts"
Task: "Graceful degradation outside E1-E6 in packages/core/tests/accuracy-range.test.ts"
Task: "Stability test in packages/core/tests/stability.test.ts"
Task: "Allocation test in packages/core/tests/allocation.test.ts"
Task: "RingBuffer tests in packages/core/tests/ring-buffer.test.ts"
Task: "TunerSession tests in packages/core/tests/session.test.ts"
Task: "useTuner tests in packages/react/tests/use-tuner.test.tsx"

# Then split platform work across two developers:
Task: "WebAudioSource + PCM worklet in apps/web/src/adapters/ and apps/web/src/worklets/"
Task: "RNAudioSource in apps/mobile/src/adapters/rn-audio-source.ts"
Task: "Web atoms in apps/web/src/components/atoms/"
Task: "Mobile atoms in apps/mobile/src/components/atoms/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — T001–T012
2. Phase 2: Foundational — T013–T029 (**blocks everything**)
3. Phase 3: User Story 1 — T030–T056
4. **STOP and VALIDATE**: run quickstart V1, V2, V4, V5; measure V7 and V8 on a real device
5. This is a shippable chromatic tuner on web, iOS, and Android

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. **US1** → validate → demo (**MVP**)
3. **US2** → boundary behaviour correct → alternate tunings genuinely usable
4. **US3** → fast, offline, no dead ends → release-quality reliability
5. **US4** → non-standard reference pitch and accidental naming
6. Polish → release gates

### Parallel Team Strategy

Natural split is **by platform, not by story**, because every story has a web half and a mobile half that
share no files:

1. Whole team completes Setup + Foundational
2. Then, per story: Developer A takes `packages/*` + `apps/web`, Developer B takes `apps/mobile`
3. The one genuine serialisation point is `packages/core/src/tuning/filters.ts`, touched by US1 and US2

---

## Notes

- **Test-first is a constitutional requirement here, not a preference.** Principle III is NON-NEGOTIABLE:
  observe each test failing before implementing against it. A red suite blocks merge, and deleting or
  skipping a failing test to unblock is prohibited.
- Any pull request touching the DSP path or render loop MUST report before/after latency and frame-time
  numbers (Principle V).
- Any pull request touching the UI MUST include screenshots in both light and dark appearance.
- [P] tasks touch different files and have no incomplete dependencies.
- Commit after each task or logical group.
- The spec's **Explicitly out of scope** list is binding — no tuning presets, no string targets, no custom
  tunings, no reference tones, no accounts, no sync. If a task seems to need one of these, the task is wrong.
