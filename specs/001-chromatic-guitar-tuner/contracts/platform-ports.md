# Contract: Platform Ports

**Date**: 2026-08-02 | **Plan**: [../plan.md](../plan.md)

Three interfaces declared in `packages/core/src/ports/`. Each has exactly two real adapters (web, mobile) and
one in-memory test double. These are the *only* places platform capability enters the system — Constitution
Principle VI requires every I/O boundary to sit behind a narrow interface with at least one test double.

Nothing below imports React, the DOM, or React Native. The core declares the shape; the apps supply it.

---

## 1. `AudioSource`

The most important boundary in the project. Both platforms deliver mono `Float32Array` PCM in the −1.0…1.0
range, so the core is genuinely platform-agnostic rather than nominally so.

```ts
export interface AudioSourceConfig {
  readonly sampleRate: number;      // requested; actual reported in AudioSourceInfo
  readonly bufferLength: number;    // frames per callback (hop size, 1024)
}

export type AudioSourceError =
  | { kind: 'permission-denied'; canRetry: boolean }
  | { kind: 'no-microphone' }
  | { kind: 'microphone-busy' }
  | { kind: 'unsupported' }
  | { kind: 'unknown'; message: string };

export interface AudioSourceInfo {
  readonly sampleRate: number;      // ACTUAL rate, may differ from requested
}

export interface AudioSource {
  /** Resolves once audio is flowing, or rejects with AudioSourceError. */
  start(
    config: AudioSourceConfig,
    onFrames: (frames: Float32Array) => void,
  ): Promise<AudioSourceInfo>;

  /** Idempotent. MUST fully release the microphone (FR-033). */
  stop(): Promise<void>;

  /** Fires when the platform revokes or loses input mid-session. */
  onInterrupted(handler: (error: AudioSourceError) => void): () => void;
}
```

### Contract obligations

| # | Obligation | Traces to |
|---|---|---|
| A1 | `onFrames` receives mono samples in −1.0…1.0. Multi-channel input is downmixed by the adapter, not the core. | research D2 |
| A2 | **The `frames` buffer is only valid during the callback.** The core copies into its ring buffer immediately and never retains the reference. Adapters may reuse the buffer. | Principle V |
| A3 | `start` MUST reject with a typed `AudioSourceError` — never a bare `Error`, never a silent failure. Each variant maps 1:1 onto a `TunerStatus` the UI can act on. | FR-028, SC-014, Principle I |
| A4 | `stop()` MUST release the OS microphone handle, not merely detach the callback — the recording indicator must clear. | FR-033 |
| A5 | `AudioSourceInfo.sampleRate` MUST report the **actual** rate. Platforms silently substitute (48 kHz is common); using the requested rate would put every reading off by a fixed ratio. | FR-009 |
| A6 | `onInterrupted` fires for calls, alarms, device changes, and revoked permission, enabling automatic recovery. | FR-029, FR-035 |
| A7 | Calling `start` twice without `stop` MUST reject rather than open a second stream. | Principle I |

### Adapters

**Web** — `AudioWorkletNode` fed by `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`.

> Those three flags are not optional. Browser voice-processing defaults are tuned for speech and will
> actively distort a sustained musical tone — AGC alone can move a reading by several cents. Getting this
> wrong produces a tuner that is subtly, unreproducibly inaccurate.

**Mobile** — `react-native-audio-api` `AudioRecorder.onAudioReady({ sampleRate, bufferLength, channelCount: 1 })`,
unwrapping `buffer.getChannelData(0)`.

**Test double** — `ScriptedAudioSource` replays a generated `Float32Array` at a controlled rate and can inject
any `AudioSourceError` on demand, making every failure path in §A3 unit-testable without hardware.

---

## 2. `PreferencesStore`

```ts
export interface PreferencesStore {
  load(): Promise<StoredPreferences | null>;
  save(prefs: StoredPreferences): Promise<void>;
  clear(): Promise<void>;
}
```

### Contract obligations

| # | Obligation | Traces to |
|---|---|---|
| P1 | `load` MUST resolve `null` — never reject — for absent, corrupt, or unparseable data. Validation and defaulting happen in the core, once, not in each adapter. | data-model §6 |
| P2 | `save` failures MUST NOT crash or block tuning. A preference that cannot be written is logged and surfaced quietly; the app keeps working. | Principle I (no silent catch), FR-024 |
| P3 | Storage is device-local. An adapter MUST NOT sync, back up to a remote, or transmit. | FR-032, SC-015 |
| P4 | Values persist across a full app restart, not merely across sessions. | FR-024 |

**Adapters**: `localStorage` (web) · AsyncStorage (mobile) · in-memory map (tests).

---

## 3. `WakeLock`

```ts
export interface WakeLock {
  acquire(): Promise<void>;   // idempotent
  release(): Promise<void>;   // idempotent
}
```

### Contract obligations

| # | Obligation | Traces to |
|---|---|---|
| W1 | Both methods are idempotent and MUST NOT reject on unsupported platforms — a missing wake lock degrades the experience, it does not break the tuner. | FR-034 |
| W2 | Held only while `TunerStatus` is `listening` or `reading`; released on every other state and on backgrounding. | FR-034, SC-012 |
| W3 | Web adapter MUST re-acquire on `visibilitychange`, since browsers drop the lock when a tab is hidden. | FR-034 |

**Adapters**: Screen Wake Lock API (web) · `expo-keep-awake` (mobile) · no-op spy (tests).

---

## 4. Composition

Ports are supplied at the app root and passed down; the core never constructs an adapter and never reaches
for a global. This is what keeps `packages/core` importable in a headless Vitest process with no DOM and no
native runtime.

```ts
// apps/web/src/main.tsx
<TunerProvider
  audioSource={new WebAudioSource()}
  preferences={new LocalStoragePreferences()}
  wakeLock={new WebWakeLock()}
/>
```

```ts
// apps/mobile/src/App.tsx
<TunerProvider
  audioSource={new RNAudioSource()}
  preferences={new AsyncStoragePreferences()}
  wakeLock={new ExpoWakeLock()}
/>
```

Both apps render different components below this point; the injected shape is identical, which is what makes
the shared `useTuner()` hook possible.

---

## 5. Contract tests

One shared, adapter-agnostic suite runs against **every** implementation including the doubles, so a new
adapter cannot quietly diverge:

- `start` → frames flow → `stop` → frames stop and the handle is released (A4)
- each `AudioSourceError` variant surfaces as its matching `TunerStatus` (A3)
- reported sample rate is used for detection, not the requested one (A5)
- double `start` rejects (A7)
- `load` on corrupt data resolves `null` (P1)
- `acquire`/`release` are idempotent and safe when unsupported (W1)

Platform adapters that cannot run headless (the RN one) are covered by the same suite under `jest-expo` with
the native module mocked at the boundary.
