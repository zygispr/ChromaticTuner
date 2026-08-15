# Contract: `packages/core` and `packages/react` public API

**Date**: 2026-08-02 | **Plan**: [../plan.md](../plan.md) | **Types**: [../data-model.md](../data-model.md)

The public surface both apps are allowed to touch. Anything not listed here is internal and may change
freely. `packages/core` contains no React, no DOM, and no React Native — enforced by lint, and the reason it
can be tested headlessly.

---

## 1. Note math — `@chromatic-tuner/core/notes`

Pure functions. No state, no allocation beyond return values.

```ts
export const A4_DEFAULT_HZ = 440;
export const A4_MIN_HZ = 415;
export const A4_MAX_HZ = 466;
export const IN_TUNE_TOLERANCE_CENTS = 5;
export const DISPLAY_RANGE_CENTS = 50;

export function frequencyOf(midi: number, a4Hz: number): number;
export function midiFromFrequency(f: number, a4Hz: number): number;   // real-valued
export function nearestNote(f: number, a4Hz: number): { midi: number; cents: number };
export function noteName(midi: number, style: AccidentalStyle): string;   // "E", "C♯"
export function octaveOf(midi: number): number;
export function tuningStateOf(cents: number | null): TuningState;
export function directionCue(state: TuningState): 'tighten' | 'loosen' | null;
```

**Guarantees**

- `frequencyOf` and `midiFromFrequency` are exact inverses within floating-point tolerance across A0–C8.
- `nearestNote(...).cents` is always within ±50 by construction.
- `noteName` is the **only** place accidental style is applied, making FR-023's "everywhere a note is shown"
  structurally true rather than a review checklist item.
- `directionCue` is the only place the flat→tighten mapping exists, so the words and the marker can never
  disagree (FR-007).

---

## 2. Pitch analysis — `@chromatic-tuner/core/dsp`

```ts
export interface AnalyzerOptions {
  readonly sampleRate: number;
  readonly a4Hz: number;
  readonly windowSize?: number;      // default 4096
  readonly clarityThreshold?: number; // default 0.9
}

export class PitchAnalyzer {
  constructor(options: AnalyzerOptions);

  /** Copy one hop of samples in. Allocation-free. */
  push(frames: Float32Array): void;

  /**
   * Analyse the current window.
   * Returns the SAME reused object each time (see data-model §3), or null when
   * no confident reading is available. Callers must not retain it.
   */
  analyze(now: number): PitchReading | null;

  /** Reference pitch may change at runtime without rebuilding the analyzer. */
  setReferencePitch(a4Hz: number): void;

  reset(): void;
}
```

**Guarantees**

| # | Guarantee | Traces to |
|---|---|---|
| N1 | After construction, `push` + `analyze` perform **zero** allocations in steady state. Verified by `allocation.test.ts`. | Principle V, C1 |
| N2 | Accuracy within ±1 cent for steady tones across **E1–E6**; best-effort outside that band. | FR-009, C2 |
| N3 | `analyze` returns `null` rather than a low-confidence guess. Silence, noise, and strummed chords all produce `null`. | FR-012 |
| N4 | Applies the full filter chain: clarity gate → octave sanity → median-of-5 → name hysteresis → hold-release. | research D7 |
| N5 | A displayed note name changes only after the pitch crosses the semitone midpoint by ~3 cents, so it cannot flicker at a boundary. | FR-011 |
| N6 | Runs in O(n log n) per analysis. | Principle VI |
| N7 | `setReferencePitch` re-derives note mapping without discarding buffered audio, so changing A4 does not blank the display. | FR-022 |

**Wraps `pitchy`.** The dependency appears nowhere else in the codebase; swapping or vendoring it is a
single-file change (research D1).

---

## 3. Session orchestration — `@chromatic-tuner/core/tuning`

```ts
export interface TunerSessionDeps {
  readonly audioSource: AudioSource;
  readonly wakeLock: WakeLock;
  readonly a4Hz: number;
}

export class TunerSession {
  constructor(deps: TunerSessionDeps);

  readonly status: TunerStatus;

  start(): Promise<void>;   // idempotent
  stop(): Promise<void>;    // idempotent; releases mic + wake lock
  setReferencePitch(a4Hz: number): void;

  /** Discrete changes only — note name, TuningState, status. Not per-frame. */
  onStatusChange(handler: (status: TunerStatus) => void): () => void;

  /** Per-frame continuous value, ~43 Hz. Bypasses React (research D6). */
  onReading(handler: (cents: number, clarity: number) => void): () => void;
}
```

**Extended by `007`.** `ReadingHandler` now takes a **third scalar**,
`midi: number | null`, and a withdrawal publishes `(null, 0, null)` — see
[`007`'s **G12** and **G13**](../../007-circular-tuner-display/contracts/tuner-display.md).
The signature above is left as `001` wrote it because the guarantees below are
still exactly what it promises, and because the extension changed nothing for
existing subscribers: a narrower function stays assignable to a wider one, so
every two-parameter handler in this repo compiled and behaved identically before
and after (**G15**). The circular display needs pitch class in the SAME frame as
the cents — taking it from the discrete channel instead flicks the needle 30°
backwards for one frame on every note boundary (`007` research D2) — and three
bare scalars keep S4's sibling promise below, that the continuous path allocates
nothing per publish (**G14**).

**Guarantees**

| # | Guarantee | Traces to |
|---|---|---|
| S1 | Owns the whole `TunerStatus` machine from data-model §2. Every `AudioSourceError` maps to a status the UI can act on — no dead ends. | SC-014 |
| S2 | Auto-recovers to `listening` when permission is granted or the device returns, with no restart. | FR-029 |
| S3 | Holds the wake lock exactly while `listening` or `reading`. | FR-034, W2 |
| S4 | `onStatusChange` fires **only** on genuine change — equal consecutive statuses are suppressed, so React does not re-render 43×/second. | Principle V |
| S5 | `stop()` fully releases microphone and wake lock; safe to call from a backgrounding handler. | FR-033 |
| S6 | Errors are surfaced as states, never swallowed. | Principle I |

---

## 4. Shared React layer — `@chromatic-tuner/react`

The seam. Everything above it is shared; everything below is written per platform.

```ts
export function TunerProvider(props: {
  audioSource: AudioSource;
  preferences: PreferencesStore;
  wakeLock: WakeLock;
  children: React.ReactNode;
}): JSX.Element;

export function useTuner(): {
  status: TunerStatus;                       // discrete — drives re-render
  note: string | null;                       // "E", styled per preference
  octave: number | null;
  tuningState: TuningState;
  direction: 'tighten' | 'loosen' | null;
  cents: number | null;                      // last settled value, for the text readout
  subscribeToCents(fn: (cents: number) => void): () => void;  // continuous — NOT state
  start(): void;
  stop(): void;
};

export function usePreferences(): {
  a4Hz: number;
  accidentalStyle: AccidentalStyle;
  isNonStandardReference: boolean;           // drives the FR-022 indicator
  setA4Hz(hz: number): void;                 // clamped to 415-466
  setAccidentalStyle(s: AccidentalStyle): void;
  reset(): void;
};
```

**Guarantees**

| # | Guarantee | Traces to |
|---|---|---|
| R1 | `subscribeToCents` never triggers a React render. Consumers drive a transform (web) or a Reanimated shared value (mobile) directly. | Principle V, research D6 |
| R2 | Every value exposed is an immutable snapshot; the reused `PitchReading` is copied exactly once here and never escapes. | data-model §3 |
| R3 | `useTuner` outside a `TunerProvider` throws immediately with a clear message rather than returning undefined. | Principle I |
| R4 | `setA4Hz` clamps to the valid range instead of rejecting, so a slider can never produce an invalid state. | FR-022 |
| R5 | The hook's shape is identical on both platforms — no platform branches, no `Platform.OS` checks. | Principle VI |

---

## 5. Design tokens — `@chromatic-tuner/tokens`

```ts
export const color: {
  flat: ThemedColor; sharp: ThemedColor; inTune: ThemedColor; noReading: ThemedColor;
  background: ThemedColor; text: ThemedColor; line: ThemedColor;
};
export const space: Record<'xs'|'sm'|'md'|'lg'|'xl', number>;
export const type: { noteSize: number; centsSize: number; labelSize: number; /* … */ };
export const motion: { markerMs: number; colorMs: number; easing: string };
export const a11y: { minTouchTarget: 44 };

type ThemedColor = { light: string; dark: string };
```

**Guarantees**

| # | Guarantee | Traces to |
|---|---|---|
| T1 | The only source of colour, spacing, type scale, and motion. Hard-coded literals in either app are a lint error. | Principle IV, FR-018 |
| T2 | Every state colour meets WCAG 2.1 AA against its background in **both** themes, verified by a contrast unit test in this package — not by eye. | FR-020, SC-013 |
| T3 | Zero dependencies, so both a React and a React Native bundle can consume it. | C4 |
| T4 | `motion` values are advisory: components MUST fall back to 0 ms under reduced-motion. | FR-016 |

---

## 6. What is deliberately absent

Recorded so `/speckit-tasks` and implementation do not reintroduce them: no `Tuning`, `TuningPreset`, or
`StringTarget` type; no reference-tone player; no account, session, or sync API; no HTTP client; no analytics
hook. The spec's out-of-scope list is binding, and the absence of these types is what enforces it.
