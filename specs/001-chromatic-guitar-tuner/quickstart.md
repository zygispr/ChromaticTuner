# Quickstart & Validation Guide: Chromatic Guitar Tuner

**Date**: 2026-08-02 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

How to run the project and prove it meets its spec. Written against the structure in
[plan.md](./plan.md#source-code-repository-root); nothing here exists yet — it is the target state that
`/speckit-tasks` and implementation work toward.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node | 20 LTS or newer | |
| pnpm | 9+ | `corepack enable` |
| Xcode | 16+ | iOS builds only |
| Android Studio | Ladybug+ | Android builds only |
| Watchman | latest | recommended on macOS for RN |

**Expo Go will not work.** `react-native-audio-api` ships native code, so mobile requires a development
build (`npx expo run:ios` / `run:android`). This trips people up once; it is the single most likely cause of
a confusing first-run failure.

---

## Setup

```bash
pnpm install
pnpm -r build          # builds packages/* — apps consume the built output
```

## Running

```bash
pnpm --filter @chromatic-tuner/web dev          # http://localhost:5173
pnpm --filter @chromatic-tuner/mobile ios       # or: android  (first run compiles native)
```

Browsers only grant microphone access on a secure origin — `localhost` counts. Testing on a phone against
your dev machine's LAN IP will silently fail the permission request unless you tunnel over HTTPS.

## Quality gates

```bash
pnpm lint              # ESLint, --max-warnings 0  (Principle I)
pnpm format:check      # Prettier
pnpm typecheck         # tsc --noEmit, strict
pnpm test              # default suite, must finish < 60s  (Principle III)
pnpm test:coverage     # packages/core must be >= 90%
pnpm test:e2e          # Playwright, web only
```

All six must pass before merge. A red suite blocks; skipping or deleting a failing test to unblock is
prohibited by the constitution.

---

## Validation scenarios

Each maps to spec acceptance scenarios and success criteria. Types referenced are in
[data-model.md](./data-model.md); interfaces in [contracts/](./contracts/).

### V1 — Detection accuracy (SC-004, FR-009) · automated

```bash
pnpm --filter @chromatic-tuner/core test accuracy
```

Synthesises pure sines, sawtooths, and harmonically rich tones **with a deliberately weak fundamental** (the
low-E failure mode), at controlled SNR, sweeping every semitone E1–E6 plus deliberate ±1/±20/±49 cent
offsets.

**Expected**: detected pitch within ±1 cent at every step; correct note and octave at every step; no octave
or harmonic misidentification on the weak-fundamental cases.

A second pass sweeps outside the guaranteed band, down to A0 and up to C8.

**Expected there**: graceful degradation — no reading rather than a confident wrong one. Accuracy assertions
outside E1–E6 are best-effort and do not gate merge (Constitution v2.0.0, Quality & Performance Standards).

### V2 — Reading stability (SC-005, FR-010) · automated

Feed 5 seconds of a steady tone with realistic noise.

**Expected**: displayed cents varies by no more than ±2 cents across the whole run.

### V3 — No flicker at the semitone boundary (FR-011, US2) · automated

```bash
pnpm --filter @chromatic-tuner/core test filters
```

Feed a slow sweep from E2 down to D2, then a tone dithering ±2 cents either side of the E2/E♭2 midpoint.

**Expected**: the name changes once per boundary crossing, at the midpoint plus the hysteresis margin;
**zero** name changes during the dither. This is the behaviour User Story 2 depends on, and the one most
likely to regress silently.

### V4 — Zero allocation in the hot path (Principle V, C1) · automated

```bash
pnpm --filter @chromatic-tuner/core test allocation
```

Run 10,000 push/analyze cycles, sampling heap usage.

**Expected**: no steady-state growth attributable to core code; the same `PitchReading` instance is returned
each cycle.

### V5 — End-to-end web tuning (US1, FR-004…FR-008) · automated

```bash
pnpm test:e2e
```

Playwright launches Chromium with `--use-fake-device-for-media-stream` and
`--use-file-for-fake-audio-capture=fixtures/e2-in-tune.wav`, then repeats with `e2-flat-20.wav` and
`e2-sharp-20.wav`.

**Expected**: note reads `E`; marker centred / left / right respectively; cents readout `~0` / `~-20` /
`~+20`; direction cue absent / "tighten" / "loosen"; the in-tune colour state only on the first.

### V6 — Permission paths (FR-028, FR-029, SC-014) · automated

Playwright with permission denied, then granted mid-session.

**Expected**: a plain explanation plus platform-specific recovery steps while denied; automatic transition to
`listening` once granted, **with no reload**; no dead-end state anywhere.

### V7 — Latency (SC-002, FR-027) · manual, on device

Play a tone, bend it sharply, and film the screen alongside the source at 240 fps (or use the in-app debug
overlay).

**Expected**: marker **begins** moving within 50 ms of the pitch change; fully settles within ~100 ms. Measure
first movement, not settle time — with a 4096-sample window and 1024 hop those are ~42 ms and ~93 ms
respectively, and conflating them makes a passing implementation look like a failure (research D3).

### V8 — 60 fps under load (SC-010, Principle V) · manual, on device

Tune continuously for 60 seconds with the frame monitor open (Chrome DevTools; Perf Monitor on RN).

**Expected**: sustained 60 fps, no frame over 16.7 ms. If React is re-rendering per reading, this is where it
shows — the fix is R1/S4 in [contracts/core-api.md](./contracts/core-api.md), not a faster device.

### V9 — Offline and zero network (SC-011, SC-015, FR-030…FR-032) · manual

Load the web app once, go offline (airplane mode / DevTools offline), reload. Separately, record the Network
panel through a full tuning session.

**Expected**: everything works offline including a cold reload; **zero** outbound requests carrying audio,
usage, or analytics. Mobile: same in airplane mode.

### V10 — Glanceability and colour independence (SC-009, FR-014, FR-015) · manual

View the tuner from 1 m in light and dark themes; repeat with a greyscale filter and a colour-blindness
simulator.

**Expected**: flat / sharp / in-tune identified within one second in every case. If greyscale is ambiguous,
the redundant channels required by FR-015 are not doing their job.

### V11 — Accessibility (SC-013, FR-020) · semi-automated

Axe/Lighthouse on web, plus manual VoiceOver and TalkBack passes.

**Expected**: WCAG 2.1 AA contrast throughout; every control labelled and ≥44×44; full keyboard operability
on desktop; state changes announced without spamming assistive tech on every reading.

### V12 — Reference pitch (US4, FR-022) · automated + manual

Set A4 to 432 Hz and play a 440 Hz tone.

**Expected**: reads ~+32 cents relative to A; the non-standard-reference indicator is visible on the tuner
screen; the setting survives a restart.

### V13 — Thermal and battery (SC-012) · manual, on device

Tune continuously for 30 minutes on a mid-range phone.

**Expected**: no thermal throttling, no abnormal battery drain, no degradation in frame rate or latency over
the run.

---

## Coverage summary

| Spec area | Scenarios |
|---|---|
| US1 core tuning | V1, V2, V5, V7, V8 |
| US2 retuning across semitones | V3, V5 |
| US3 fast start, offline, permissions | V6, V9 |
| US4 reference pitch and naming | V12 |
| Design and accessibility | V10, V11 |
| Constitution gates | V4 (alloc), V7 (latency), V8 (fps), V13 (thermal) |

V1–V6 run in CI on every pull request. V7, V8, V10, V13 require real hardware and are release-gate checks;
per the constitution, any pull request touching the DSP path or render loop must report before/after numbers
for V7 and V8.
