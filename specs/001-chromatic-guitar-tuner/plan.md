# Implementation Plan: Chromatic Guitar Tuner

**Branch**: `001-chromatic-guitar-tuner` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-chromatic-guitar-tuner/spec.md`

## Summary

A pure chromatic tuner: capture microphone audio, detect the fundamental pitch, name the nearest note, and
show deviation as a marker on one horizontal line — flat left, sharp right — with colour carrying the tuning
state. No tuning presets, no accounts, no network.

The technical approach is a **pnpm monorepo with a pure-TypeScript DSP and domain core shared by two
presentation apps**: React + Vite on web, Expo/React Native on iOS and Android. All platform capability
(microphone, storage, wake lock) sits behind ports in the core, with one adapter per platform and an
in-memory double for tests. Pitch detection uses **`pitchy`** (McLeod Pitch Method) rather than the suggested
`pitchfinder`, which is GPL-3 licensed, allocates on every call, and is O(n²) — see
[research.md](./research.md) D1. Raw PCM on React Native comes from `react-native-audio-api`'s
`AudioRecorder`, which delivers the same `Float32Array` shape as a web `AudioWorkletProcessor`, so the core
never learns which platform it is running on.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`, targeting ES2022

**Primary Dependencies**:

- `pitchy` ^4.1.0 (MIT) — McLeod Pitch Method, preallocating, returns `[pitch, clarity]`
- `react-native-audio-api` 0.13.2 (pinned) — microphone PCM on iOS/Android
- `react-native-reanimated` — UI-thread marker animation
- React 19; Vite (web); Expo SDK 57 / React Native 0.86 (mobile)
- `@react-native-async-storage/async-storage`, `expo-keep-awake` (mobile adapters)

**Storage**: Two local key–value preferences (A4 reference pitch, accidental naming). `localStorage` on web,
AsyncStorage on mobile, behind a `PreferencesStore` port. No database, no server, no user data.

**Testing**: Vitest for `packages/*` and `apps/web`; Jest + `jest-expo` for `apps/mobile`; Playwright with
Chromium fake audio capture for web E2E. Accuracy verified against synthesised reference signals — no
microphone needed in CI.

**Target Platform**: iOS 15+, Android 8+ (Expo development build — **not** Expo Go), and evergreen desktop
and mobile browsers. Installable PWA on web.

**Project Type**: Offline-first cross-platform client application. Monorepo: 3 shared packages, 2 apps.

**Performance Goals**: 60 fps sustained marker motion; first marker movement ≤ 50 ms after a pitch change,
full settle ≤ 100 ms; cold start to live tuner ≤ 2 s; zero allocations per frame in core analysis;
detection ~43×/second.

**Constraints**: Fully offline including first launch; zero outbound network traffic; audio never leaves the
device; ±1 cent accuracy across E1–E6; reading stability ±2 cents on a held tone; WCAG 2.1 AA.

**Scale/Scope**: Single-user, single-screen product plus a settings sheet. ~4 screens/states total. No
backend, no concurrency concerns, no multi-tenancy.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against **Constitution v2.0.0**.

| Principle | Gate | Initial | Post-design | How it is satisfied |
|---|---|---|---|---|
| **I. Code Quality** | Zero lint/format warnings; single responsibility; no silent catches | PASS | PASS | ESLint flat config + Prettier, `--max-warnings 0` in CI. Every port is one interface with one job. Audio errors surface as explicit `TunerStatus` states, never swallowed. |
| **II. Simplicity** | YAGNI; abstractions need 2 implementations; dependency justification | PASS | PASS | The spec's out-of-scope list is binding. Each of the 3 shared packages has exactly 2 consumers. Each port has 2 real adapters + a test double. Turborepo, Redux, Skia/canvas, and a backend all rejected. `pitchy` justified (~200 lines of DSP, well over the 30-line threshold). |
| **III. Testing** | Tests-first for core; reference-signal accuracy tests; ≥90% core coverage; deterministic; <60 s | PASS | PASS | Core is pure and headless. Accuracy tests synthesise sines/sawtooths/weak-fundamental tones and sweep every semitone E1–E6. Filter-chain behaviours (flicker, octave jump, hold-release) are pure-function tests. No hardware or network in the default suite. |
| **IV. UX Consistency** | Glanceable; never colour-alone; token single-source; WCAG AA; 44 pt targets; all states defined | PASS | PASS | `packages/tokens` is the only source of colour/spacing/motion — neither app may hard-code. Tuning state carried by colour **plus** marker position **plus** text (FR-015). Listening/error/permission-denied are explicit members of the `TunerStatus` union, so an undefined state cannot compile. |
| **V. Performance** | ≤100 ms p95; 60 fps; **zero alloc per frame in first-party audio code**; ≤2 s cold start; measured | PASS | PASS | Ring buffer and detector preallocated; reading object reused, verified by `allocation.test.ts` as v2.0.0 now requires. `pitchfinder` rejected largely on this rule. Continuous motion bypasses React entirely (transform / Reanimated shared value). |
| **VI. Scalability** | Strict layering, inward deps only; pure platform-agnostic core; I/O behind narrow interfaces; ≤O(n log n) | PASS | PASS | `core` → `react` → apps, dependencies inward only; `core` has zero React/DOM/RN imports, enforced by lint. Three ports, each with a test double. MPM via FFT is O(n log n); `pitchfinder`'s O(n²) YIN rejected on this rule. |

### Gate result: **PASS**

Two v1.0.0 requirements could not be met as written. Both were resolved by amending the constitution to
**v2.0.0** on 2026-08-02 rather than by silently shipping under-spec: the accuracy range was narrowed to the
band that is physically attainable, and the zero-allocation rule was scoped to first-party code with a
mandatory automated check. History retained in Complexity Tracking C1 and C2.

## Project Structure

### Documentation (this feature)

```text
specs/001-chromatic-guitar-tuner/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── core-api.md      # packages/core public surface
│   └── platform-ports.md# AudioSource, PreferencesStore, WakeLock
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/
├── core/                        # Pure TypeScript. No React, no DOM, no React Native.
│   ├── src/
│   │   ├── notes/               # Note math: frequency <-> note, cents, naming
│   │   ├── dsp/                 # RingBuffer, PitchAnalyzer (wraps pitchy)
│   │   ├── tuning/              # Filter chain + TunerStatus state machine
│   │   ├── ports/               # AudioSource, PreferencesStore, WakeLock interfaces
│   │   └── index.ts
│   └── tests/
│       ├── fixtures/            # Synthetic signal generators
│       ├── notes.test.ts
│       ├── accuracy.test.ts     # Reference-signal sweep, E1-E6
│       ├── filters.test.ts      # Flicker, octave jump, hold-release
│       └── allocation.test.ts   # Asserts no steady-state allocation growth
│
├── tokens/                      # Design tokens. Plain constants, zero deps.
│   └── src/                     # colors, spacing, typography, motion, breakpoints
│
└── react/                       # Shared React layer. No DOM, no RN primitives.
    ├── src/
    │   ├── useTuner.ts          # Wires AudioSource -> core -> discrete state
    │   ├── usePreferences.ts
    │   └── format.ts            # Note/cents display formatting
    └── tests/

apps/
├── web/                         # React 19 + Vite, installable PWA
│   ├── src/
│   │   ├── adapters/            # WebAudioSource (AudioWorklet), LocalStorage, WakeLock
│   │   ├── components/          # Atomic design
│   │   │   ├── atoms/           # NoteLabel, CentsReadout, DirectionCue, TickMark
│   │   │   ├── molecules/       # TuningLine, StatusBanner, PermissionPrompt
│   │   │   ├── organisms/       # TunerDisplay, SettingsSheet
│   │   │   ├── templates/       # TunerLayout
│   │   │   └── pages/           # TunerPage
│   │   └── worklets/            # pcm-capture.worklet.ts
│   ├── tests/
│   └── e2e/                     # Playwright + fake audio capture
│
└── mobile/                      # Expo SDK 57 + React Native 0.86 (development build)
    ├── src/
    │   ├── adapters/            # RNAudioSource (react-native-audio-api), AsyncStorage, KeepAwake
    │   └── components/          # Same atomic structure, RN primitives
    │       ├── atoms/ molecules/ organisms/ templates/ screens/
    └── __tests__/               # jest-expo
```

**Structure Decision**: pnpm workspaces monorepo, five workspaces. The sharing seam is drawn at the top of
the presentation layer, exactly matching the request to share *business logic* while keeping a React app on
web and a React Native app on mobile: everything down to and including `useTuner()` is shared; the components
below it are written twice in atomic-design form. `react-native-web` was deliberately not used — it would
have shared more code but contradicts the stated "react application for web" and drags RNW into the web
bundle.

Dependency direction is strictly inward and lint-enforced: `apps/*` → `packages/react` → `packages/core`,
with `packages/tokens` a zero-dependency leaf consumed by both apps. `packages/core` importing React,
`react-native`, or any DOM global is a lint error, which is what keeps Principle VI's platform-agnostic core
true over time rather than only on day one.

## Complexity Tracking

> C1 and C2 were resolved by amending the constitution to v2.0.0; they are retained as the record of why it
> changed. C3 and C4 are live accepted complexity.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **C1 — RESOLVED in v2.0.0.** Principle V's "zero allocations per audio callback" could not hold literally at the platform boundary | Both platforms hand us a freshly allocated buffer object per callback (`AudioBuffer` on mobile, worklet input array on web). That allocation is above our boundary and outside our control. | Nothing we can write eliminates it — it is the platform's calling convention. v2.0.0 scopes the rule to first-party code from the ring-buffer write inward, and adds a *mandatory* automated no-growth check, so the rule got stricter where it can be enforced rather than merely narrower. |
| **C2 — RESOLVED in v2.0.0.** v1.0.0 mandated ±1 cent across A0–C8; achievable range is E1–E6 | ±1 cent at C8 (4186 Hz) is ±2.42 Hz, at an autocorrelation lag of ~10.5 samples at 44.1 kHz. Holding that needs ~0.4% lag precision from a noisy real signal — not reliably attainable. At E6 the lag is ~33 samples and the target is met with margin. Every note a guitar can produce is inside E1–E6. | Raising the sample rate to 96 kHz would improve top-octave lag resolution but doubles CPU and battery for notes no guitar plays — a direct Principle II violation to satisfy a number nothing needs. Silently shipping under-spec was rejected outright. v2.0.0 guarantees ±1 cent across E1–E6 and requires graceful degradation (no reading beats a wrong reading) outside it. |
| **C3 — Two test runners (Vitest + Jest)** | React Native component testing is effectively tied to the `jest-expo` preset; the DSP core, where ~90% of tests live and where the <60 s suite budget bites, is much faster under Vitest. | Jest everywhere slows the core suite that matters most. Vitest everywhere means fighting the RN transform pipeline. The split is clean and bounded: `packages/*` never touch Jest, `apps/mobile` never touches Vitest. |
| **C4 — Three shared packages rather than one** | `tokens` must be importable by both apps without dragging in React (Principle IV's single-source-of-truth rule); `core` must stay React-free (Principle VI); `react` needs React. Merging them would force React into the pure core. | A single shared package would make `packages/core`'s "no React imports" lint rule impossible to enforce, collapsing the one boundary Principle VI depends on. Each package has exactly 2 consumers, satisfying Principle II's two-implementations rule. |

## Phase Outputs

- **Phase 0** → [research.md](./research.md) — all unknowns resolved; `pitchfinder` evaluated and rejected
  with evidence.
- **Phase 1** → [data-model.md](./data-model.md), [contracts/core-api.md](./contracts/core-api.md),
  [contracts/platform-ports.md](./contracts/platform-ports.md), [quickstart.md](./quickstart.md).
- **Phase 2** → `tasks.md`, produced by `/speckit-tasks`. Not created by this command.
