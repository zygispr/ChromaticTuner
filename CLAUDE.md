# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A chromatic guitar tuner for web, iOS, and Android. pnpm workspace: `packages/*` (shared, platform-free) and `apps/*` (thin platform shells). Accuracy target is ±1 cent across E1–E6, verified by tests against generated reference signals.

`.specify/memory/constitution.md` is binding, not aspirational — several of its principles are enforced by lint rules and tests. Read it before proposing architectural changes. The feature spec, plan, contracts, and build log live in `specs/001-chromatic-guitar-tuner/`; `contracts/core-api.md` and `contracts/platform-ports.md` define the guarantees the code comments reference by number (S1, A5, N7, R1, …).

## Commands

```bash
pnpm install                # corepack enable first; Node 20+

# Dev
pnpm --filter @chromatic-tuner/web dev        # http://localhost:5173
pnpm --filter @chromatic-tuner/mobile ios     # needs a dev build; Expo Go cannot work
pnpm --filter @chromatic-tuner/mobile android

# Gates (all run in CI on every PR)
pnpm lint                   # eslint --max-warnings 0
pnpm format:check
pnpm typecheck              # tsc --noEmit in every package
pnpm test                   # vitest, packages/* only
pnpm test:coverage          # packages/core >= 90% lines / 90% functions / 85% branches
pnpm test:e2e               # regenerates WAV fixtures, then Playwright + Chromium
pnpm build                  # web bundle + generated service worker
pnpm --filter @chromatic-tuner/mobile test    # jest-expo
```

Single tests:

```bash
pnpm vitest run packages/core/tests/notes.test.ts     # from the repo root; path filter works across projects
pnpm vitest run --project core -t "nearestNote"       # projects are named `core`, `react`, `tokens`
pnpm --filter @chromatic-tuner/web exec playwright test e2e/a11y.spec.ts   # run `e2e:fixtures` once first
pnpm --filter @chromatic-tuner/mobile test -- settings
```

Offline/service-worker behaviour cannot run under the normal suite (the dev server never emits `sw.js`):

```bash
pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &
pnpm --filter @chromatic-tuner/web verify:offline
```

Thermal/battery behaviour over 30 minutes (quickstart V13) is a manual release gate on real hardware.

## Architecture

Dependencies point inward only: `tokens` ← `core` ← `react` ← `apps/*`.

- **`packages/core`** — pure TypeScript: DSP (`RingBuffer`, `PitchAnalyzer` wrapping pitchy/MPM), note math, the reading filter chain, `TunerSession`, the three ports, and preferences. Compiles against ES2022 only — no DOM lib, no Node types. Importing React/React Native or touching `window`/`document`/`navigator`/`localStorage` here is an ESLint error, not a convention.
- **`packages/tokens`** — colour, spacing, type scale, motion, a11y constants. Zero deps so both a React and a React Native bundle can consume it. A literal hex/rgb/hsl value anywhere in `apps/**` is an ESLint error.
- **`packages/react`** — `TunerProvider`, `useTuner`, `usePreferences`, screen-reader announcement text. React only; importing `react-dom` or `react-native` here is an ESLint error. This is the last shared layer — components below it are written once per platform.
- **`apps/web`** — Vite + React 19, Web Audio + AudioWorklet, `localStorage`, Screen Wake Lock, a build-time-generated service worker.
- **`apps/mobile`** — Expo + React Native, `react-native-audio-api`, AsyncStorage, `expo-keep-awake`.

Both apps mirror the same component structure (atoms → molecules → organisms → screens/pages) and the same gate/lifecycle hooks, so a change to one usually needs the equivalent change to the other.

### The two output channels

This is the core performance design (`research.md` D6) and the easiest thing to break:

- `TunerSession.onStatusChange` is **discrete** — permission state, note change, tuning-state change. It drives React re-renders and is deliberately suppressed when nothing meaningful changed.
- `TunerSession.onReading` is **continuous**, ~43 Hz. Consumers must write to the DOM / a Reanimated shared value directly. Calling `setState` from a cents subscription re-renders at 43 Hz and breaks the 60 fps budget.

`PitchAnalyzer` reuses one `PitchReading` object and preallocates every buffer; the steady-state audio path allocates nothing (asserted by `packages/core/tests/allocation.test.ts`). Anything that retains a reading must copy it — the session does exactly that when publishing a discrete change.

Note also that percentage `translateX` resolves against the transformed element's own width: the marker transform goes on the full-width track, never on the marker. This shipped wrong for seven phases; `apps/web/e2e/helpers.ts:markerOffsetPx` measures real bounding boxes to keep it honest.

### Ports and their contract suite

Every platform difference lives behind `AudioSource`, `PreferencesStore`, or `WakeLock` (`packages/core/src/ports/`). `packages/core/testing/port-contract-tests.ts` is a runner-agnostic suite of plain async functions (it imports no test framework, because web adapters run under Vitest and mobile adapters under Jest) that every implementation — including the test doubles — is checked against. Adding behaviour to a port means adding a contract check, not just an adapter test.

Some obligations that are easy to violate: `onFrames` buffers are valid only for the callback's duration; the actual sample rate comes back from `start()` and may differ from the one requested; `stop()` must release the OS handle so the recording indicator clears; `AudioSource` failures reject with a typed `AudioSourceError` that maps 1:1 onto a `TunerStatus` the UI can act on.

## Working in this repo

- **Test-first is constitutional** (Principle III): tests exist and are observed failing before the implementation. Skipping or deleting a failing test to unblock a merge is prohibited; every bug fix adds a regression test that fails on the unfixed code.
- Changes to the DSP path or render loop need before/after latency and frame-time numbers; UI changes need light and dark screenshots.
- Comments here explain _why_, usually citing a constitution principle, an FR number, a contract guarantee, or a real defect. Match that — don't add narration of what the code plainly does.
- The spec's "explicitly out of scope" list (tuning presets, string targets, custom tunings, reference tones, accounts, sync) is binding. If a task seems to need one, the task is wrong.
- Feature work runs through the spec-kit skills (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`); `specs/001-chromatic-guitar-tuner/tasks.md` doubles as the build log, including defects and deviations.
- `.npmrc` sets `node-linker=hoisted` because Metro cannot resolve pnpm's symlinked store — don't remove it.
