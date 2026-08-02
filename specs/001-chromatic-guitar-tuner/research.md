# Phase 0 Research: Chromatic Guitar Tuner

**Date**: 2026-08-02 | **Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

All technical unknowns from the plan's Technical Context are resolved below. Verified against live package
registry data and vendor documentation on 2026-08-02.

---

## D1: Pitch detection library — `pitchy`, not `pitchfinder`

**Decision**: Use **`pitchy` v4.1.0** (McLeod Pitch Method) in `packages/core`, wrapped behind our own
`PitchAnalyzer` so it can be swapped or vendored without touching callers.

**Rationale**: The user asked for `pitchfinder` "unless there's a better option". There is, and the deciding
factor is not performance — it is licensing.

| | `pitchfinder` 2.3.4 | `pitchy` 4.1.0 |
|---|---|---|
| **License** | **GPL-3.0** (`"license": "GNU v3"`) | **MIT** (dep `fft.js` also MIT) |
| Allocation per call | `new Float32Array(...)` every call — YIN 1×, McLeod 2×, ACF2+ 1× | None; buffers preallocated by `PitchDetector.forFloat32Array(n)` |
| Complexity | YIN is a nested loop → **O(n²)** | FFT-based NSDF → **O(n log n)** |
| Confidence output | None — returns `number \| null` only | Returns `[pitch, clarity]`, clarity 0–1 |
| Self-reported reliability | README: YIN "occasionally provides values that are wildly incorrect" | — |
| Size | larger, multi-algorithm | 33 KB unpacked |

Three independent blockers, in order of severity:

1. **GPL-3.0 is disqualifying for this product.** `pitchfinder`'s YIN is a port of aubio and carries aubio's
   GPL-3 header; the package declares GPL-3 overall. Linking it into a distributed iOS/Android binary makes
   the combined work subject to GPL-3, and GPL-3's anti-Tivoization and "no additional restrictions" terms
   are well known to conflict with the Apple App Store's distribution terms. This alone rules it out for
   `apps/mobile`, regardless of technical merit.
2. **It violates Constitution Principle V.** "The audio processing path MUST NOT allocate memory… per audio
   callback. Buffers MUST be pre-allocated and reused." Every `pitchfinder` detector allocates a typed array
   per detection. At ~43 detections/second that is sustained GC pressure in exactly the code path that must
   not drop frames.
3. **It violates Constitution Principle VI.** "Anything worse than O(n log n) per frame MUST be justified."
   `pitchfinder`'s YIN difference function is a doubly-nested loop over the window.

`pitchy` clears all three, and its `clarity` output directly serves FR-012 (distinguishing a real note from
noise) and the Pitch Reading entity's confidence field — something `pitchfinder` cannot express at all.

**Risk and mitigation**: `pitchy` was last published 2024-01-04, so it is ~2.5 years stale. Mitigating
factors: it is small (33 KB), MIT, dependency-light, and implements a fixed published algorithm that does not
rot. Our `PitchAnalyzer` wrapper means replacing or vendoring it is a one-file change. Accepted.

**Alternatives considered**:

- **Hand-rolled MPM in `packages/core`** — rejected under Principle II. MPM with FFT is ~200 lines of subtle
  DSP; the constitution's dependency rule only rejects deps replaceable by ~30 lines.
- **`aubiojs` / `essentia.js` (WASM)** — excellent detection quality, but WASM in React Native is awkward,
  bundle cost is large, and aubio is GPL-3 too.
- **`react-native-audio-api`'s own analysis nodes** — only `AnalyserNode` (FFT magnitudes), which is the wrong
  tool: FFT bin resolution at 4096/44100 is ~10.8 Hz, nowhere near ±1 cent at the low E (~0.05 Hz).

---

## D2: Microphone capture — one port, two adapters

**Decision**: Define an `AudioSource` port in `packages/core`. Web adapter uses the standard Web Audio API
with an `AudioWorkletNode`. Mobile adapter uses **`react-native-audio-api` v0.13.2** `AudioRecorder`.

**Rationale**: React Native has no Web Audio API, which is the single biggest architectural constraint in this
project. `react-native-audio-api` (Software Mansion) resolves it: it implements a Web Audio-compatible surface
for iOS and Android, has had microphone support since 0.7.0, and its `AudioRecorder.onAudioReady` delivers raw
float PCM in the −1.0…1.0 range:

```js
audioRecorder.onAudioReady(
  { sampleRate, bufferLength: sampleRate * 0.1, channelCount: 1 },
  ({ buffer, numFrames, when }) => { /* raw PCM */ }
);
```

That is the same shape of data the web `AudioWorkletProcessor` hands us, so both adapters can feed one
identical core. The package was published the same day as this research (2026-08-02) and is actively
developed.

**Because both platforms hand us `Float32Array` PCM, the DSP core never learns which platform it is on.** This
is what makes Principle VI's platform-agnostic core achievable rather than aspirational.

**Risks**:

- `react-native-audio-api` is **pre-1.0 (0.13.2)**. Breaking changes between minors are likely. Mitigated by
  the adapter boundary — churn is contained to one file — and by pinning an exact version.
- It contains native code, so **Expo Go will not work**. `apps/mobile` must use an Expo **development build**
  (`npx expo run:ios` / `run:android`). Its optional Expo config plugin handles the permission entries.

**Alternatives considered**: `react-native-live-audio-stream` (last published 2022, unmaintained);
`react-native-audio-pcm-stream` (base64-encoded PCM over the bridge — decoding cost and allocation per chunk,
against Principle V); `expo-audio` (recording to file, not real-time PCM streaming).

---

## D3: Analysis window and latency budget

**Decision**: 44.1 kHz mono. **4096-sample analysis window (92.9 ms), 1024-sample hop (23.2 ms)**, fed from a
preallocated ring buffer. Detection runs ~43×/second.

**Rationale**: Autocorrelation methods need roughly two periods of the lowest target pitch inside the window.

| Note | Freq | Period | 2 periods | Fits in 4096 @ 44.1 kHz (92.9 ms)? |
|---|---|---|---|---|
| A0 | 27.5 Hz | 36.4 ms | 72.7 ms | Yes (2.55 periods) |
| E1 (low E, drop tunings) | 41.2 Hz | 24.3 ms | 48.5 ms | Yes, comfortably |
| E2 (standard low E) | 82.4 Hz | 12.1 ms | 24.3 ms | Yes |

A window shorter than ~3200 samples cannot resolve A0 at all; 4096 is the smallest power of two that covers
the constitution's stated low bound.

**How this satisfies the 100 ms budget (FR-027, SC-002)**: the window is 92.9 ms, but the window is not the
latency. With a 1024 hop the display updates every 23.2 ms, so after a pitch change the marker *begins*
moving within hop + compute + render ≈ 23 + ~2 + 17 ≈ **42 ms**, and fully settles once the window refills
(~93 ms). Both numbers are inside budget, and the perceptual requirement — the marker tracks the peg with no
lag — is met by the 42 ms figure. This distinction is written into the quickstart's measurement procedure so
the budget is verified against the right number.

**Compute cost**: FFT-based NSDF on 4096 samples is a few 8192-point FFTs, ~1–2 ms, at 43 Hz → well under 10%
of one core.

---

## D4: ±1 cent across A0–C8 is not physically achievable — constitution amended

**Decision**: Guarantee **±1 cent across E1–E6 (41.2–1318.5 Hz)**, the guitar range the spec already names as
the design target. Outside that band, detection remains functional and best-effort, and must return no
reading rather than a confident wrong one. **Resolved: Constitution amended to v2.0.0 on 2026-08-02.** The
bump is MAJOR, not PATCH as first estimated — the constitution's own versioning policy classifies loosening a
binding budget as MAJOR, and narrowing the range the guarantee covers does exactly that.

**Rationale**: At the top of C8 the requirement collides with sampling resolution. ±1 cent at C8 (4186 Hz) is
±2.42 Hz. The autocorrelation lag there is ~10.5 samples at 44.1 kHz, so one sample of lag error is ~400
cents. Parabolic interpolation recovers sub-sample precision, but holding ±1 cent on a 10-sample lag demands
~0.4% lag precision from a noisy real-world signal — not reliably attainable.

At E6 (1318.5 Hz) the lag is ~33 samples and ±1 cent is ±0.76 Hz, which parabolic interpolation handles with
margin. Every note a guitar can produce, including the 24th fret of the high E, sits inside the guaranteed
band.

This is a case of the constitution's number being written before the physics was checked. The honest fix is
to amend the constitution to the range the product actually needs, not to silently ship something that fails
its own accuracy gate. Logged in the plan's Complexity Tracking.

---

## D5: Zero-allocation strategy, and the limit of our control

**Decision**: Inside `packages/core`, the steady-state analysis path allocates **zero** bytes: a preallocated
`Float32Array` ring buffer, a preallocated `PitchDetector` instance, and a single mutable `PitchReading`
object reused between frames rather than a fresh object per detection.

**Scope note**: the platform hands us a buffer object per callback (`AudioBuffer` on mobile, the worklet's
input array on web). That allocation happens above our boundary and we cannot eliminate it. Principle V is
therefore read as binding on **code we own**, and this reading is recorded here so the gate is judged against
a standard we can actually meet. Everything from the ring-buffer write inward is allocation-free and is
covered by an explicit test asserting no steady-state allocation growth.

---

## D6: Rendering the marker at 60 fps

**Decision**: On **web**, animate the marker with a CSS `transform: translateX()` on a composited element,
driven from `requestAnimationFrame`. On **mobile**, drive the same transform through a **Reanimated shared
value** so the animation runs on the UI thread.

**Rationale**: Constitution Principle V requires a sustained 60 fps with no frame-budget overrun. On React
Native, routing 43 pitch readings per second through React state would re-render across the bridge at that
rate and cause visible jank; a Reanimated shared value keeps marker motion entirely on the UI thread, with
React state updating only on *discrete* changes (note name, tuning state) which occur far less often.

The same split applies on web: continuous position via transform, discrete state via React. Both platforms
use one rule — **continuous values bypass React, discrete values go through it** — which keeps the shared
`useTuner` hook's contract identical on both.

Canvas/Skia was considered and rejected under Principle II: a single translating marker on a static line does
not need a drawing surface.

---

## D7: Stability, hysteresis, and octave errors

**Decision**: Between the raw detector and the UI, `packages/core` applies, in order:

1. **Clarity gate** — readings below a clarity threshold (~0.9) are rejected as "no clear signal", satisfying
   FR-012 and the strummed-chord edge case.
2. **Octave sanity check** — compare the candidate against the previous confident reading; reject a jump of
   exactly ±1200 cents (±2 cents) when clarity is not decisively better. Guards the octave/harmonic-confusion
   edge case — the classic failure on a low E's weak fundamental.
3. **Median-of-5 filter** on cents deviation — kills isolated outliers without the lag of a mean.
4. **Note-name hysteresis** — the displayed note only changes when the pitch crosses the midpoint by a small
   margin (~3 cents) rather than exactly at the midpoint. This is what makes FR-011 (no flicker at the
   boundary) true, and it is essential to User Story 2, where the player deliberately parks the string near a
   boundary while retuning.
5. **Hold-then-release** — the last confident reading persists ~400 ms after the signal dies, then the display
   returns to "listening" rather than decaying into noise.

These five stages are pure functions over a small state record, so all of them are unit-testable with no
audio hardware — which is what lets the tricky behaviours actually be covered by Principle III's tests.

---

## D8: Monorepo layout and code sharing

**Decision**: **pnpm workspaces**, no build orchestrator. Three shared packages, two apps.

**Rationale**: The user asked to share *business logic*, and asked for a React app on web and React Native on
mobile — deliberately not `react-native-web`. So the seam is drawn at the top of the presentation layer:
everything down to and including the `useTuner` hook is shared; the components below it are written twice,
once per platform, in atomic-design form.

- `packages/core` — pure TypeScript. Note math, `PitchAnalyzer`, ring buffer, the D7 filter chain, the tuning
  state machine, and the port interfaces. No React, no DOM, no React Native. Runs headless in Vitest.
- `packages/tokens` — design tokens (colour, spacing, type scale, motion). Plain constants, zero deps.
  Required by Principle IV's single-source-of-truth rule and FR-018's one-visual-language rule; it exists as
  its own package precisely so neither app can drift.
- `packages/react` — the shared React layer: `useTuner()`, `usePreferences()`, formatting. React only, no
  platform primitives.

Each shared package has exactly two consumers, satisfying Principle II's rule that an abstraction needs two
real implementations. **Turborepo was rejected** — five workspaces do not need build orchestration, and
YAGNI is binding.

---

## D9: Toolchain

**Decision**:

| Concern | Choice | Note |
|---|---|---|
| Language | TypeScript 5.x, `strict: true` | Per user request |
| Web app | React 19 + Vite | Fast dev loop; PWA plugin for offline (FR-030) |
| Mobile app | Expo SDK 57 + React Native 0.86, **development build** | Expo Go cannot load native modules (D2) |
| Package manager | pnpm workspaces | |
| Lint / format | ESLint (flat config) + Prettier | Per user request; zero-warning gate per Principle I |
| Unit tests | Vitest — `packages/*` and `apps/web` | Fast, TS-native, matches the <60 s suite budget |
| Mobile tests | Jest + `jest-expo` | Accepted complexity — see below |
| Web E2E | Playwright with fake audio capture | See D10 |

**Two test runners is a real cost** and is logged in Complexity Tracking. It is accepted because React
Native's component testing is effectively tied to its Jest preset, while the DSP core — where ~90% of the
tests live and where suite speed matters — benefits from Vitest. The split is clean: `packages/*` never
touch Jest.

---

## D10: Deterministic audio testing

**Decision**: Three tiers, none requiring a microphone in CI.

1. **Core accuracy tests (Vitest)** — synthesise signals in-memory: pure sines, sawtooth and
   harmonically-rich tones with a deliberately weak fundamental (the low-E failure case), plus added noise at
   controlled SNR. Assert detected pitch within ±1 cent across E1–E6, sweeping every semitone. This is the
   direct implementation of Constitution Principle III's reference-signal requirement.
2. **Filter-chain tests (Vitest)** — feed scripted reading sequences through the D7 chain to prove the
   boundary-flicker, octave-jump, and hold-then-release behaviours. Pure functions, no audio at all.
3. **Web E2E (Playwright)** — launch Chromium with `--use-fake-device-for-media-stream` and
   `--use-file-for-fake-audio-capture=<wav>` to drive the real app with a known tone, including the
   permission-denied path. Deterministic and CI-safe.

Mobile gets `jest-expo` integration coverage of the primary flow plus documented manual on-device validation
for the latency and thermal criteria (SC-002, SC-012), which cannot be honestly measured in a simulator.

---

## D11: Persistence, wake lock, and offline

**Decision**: Two more ports in `packages/core`, each with a per-platform adapter and an in-memory test
double.

| Port | Web | Mobile |
|---|---|---|
| `PreferencesStore` (FR-024) | `localStorage` | `@react-native-async-storage/async-storage` |
| `WakeLock` (FR-034) | Screen Wake Lock API | `expo-keep-awake` |

Offline (FR-030, SC-011): the web app ships as an installable PWA with a service worker precaching the whole
bundle — there is no runtime network dependency to begin with, since all analysis is on-device. The mobile
app is offline by construction. **No analytics or telemetry SDK is installed in either app**, which is what
makes SC-015 (zero outbound bytes) verifiable rather than aspirational.

---

## Summary of resolved unknowns

| Unknown | Resolution |
|---|---|
| Pitch detection library | `pitchy` (MIT/MPM/preallocating) — `pitchfinder` rejected on GPL-3 licensing, per-call allocation, and O(n²) |
| Raw PCM on React Native | `react-native-audio-api` `AudioRecorder.onAudioReady` |
| Sharing logic across React and React Native | Seam at the `useTuner` hook; three shared packages, per-platform components |
| Window/hop and latency | 4096/1024 @ 44.1 kHz; ~42 ms to first movement, ~93 ms to settle |
| Accuracy range | E1–E6 guaranteed, best-effort outside; constitution amended to v2.0.0 (MAJOR) |
| 60 fps under 43 readings/sec | Continuous motion off the React tree (transform / Reanimated shared value) |
| Deterministic audio tests | Synthesised signals + Playwright fake audio capture |

**Sources**:

- [react-native-audio-api — AudioRecorder](https://docs.swmansion.com/react-native-audio-api/docs/inputs/audio-recorder/)
- [react-native-audio-api — Getting started](https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/getting-started)
- [software-mansion/react-native-audio-api](https://github.com/software-mansion/react-native-audio-api)
- [ianprime0509/pitchy](https://github.com/ianprime0509/pitchy)
- [peterkhayes/pitchfinder](https://github.com/peterkhayes/pitchfinder)
- Package metadata and `pitchfinder` source inspected directly from the npm registry, 2026-08-02.
