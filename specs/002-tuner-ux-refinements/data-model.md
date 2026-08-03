# Phase 1 Data Model: Tuner UX Refinements

**Feature**: `002-tuner-ux-refinements` · **Date**: 2026-08-03

This feature adds **no entities to `packages/core`** and **no persisted state**. What follows is the
complete set of state changes, which is small enough to enumerate exactly.

---

## New state

### `captureEnabled` — user intent to capture audio

| | |
|---|---|
| **Type** | `boolean` |
| **Initial value** | `true` |
| **Owner** | `TunerGate` in each app (`apps/web`, `apps/mobile`) |
| **Persisted** | **No** — deliberately; see below |
| **Consumers** | `MicrophoneToggle` (renders it), `useMicrophoneLifecycle` (gated by it), the `start()` effect in the gate |

The one piece of genuinely new state in the feature. It represents *what the user asked for*, which is not
recoverable from anything the session already exposes — `status.kind === 'idle'` is also the pre-start
state and the state reached by backgrounding, so it cannot distinguish "the user stopped this" from "this
has not started yet" (research D1).

**Not persisted, on purpose.** Persisting it would mean a user who stopped capture last Tuesday opens a
tuner that silently does nothing, with the reason a week out of view. The failure mode of not persisting is
one extra press; the failure mode of persisting is an app that appears broken. It also keeps Principle VI's
settings-versioning rule out of scope — there is no stored shape to migrate.

**State transitions**:

```text
                    user presses stop
   captureEnabled ─────────────────────> captureEnabled
      = true                                 = false
        ^                                       │
        └───────────────────────────────────────┘
                    user presses start

  backgrounding / foregrounding: NO transition (FR-040)
  permission denied:             NO transition — intent is unchanged by failure
  microphone interrupted:        NO transition — the session reports it; intent stands
```

That last group is the reason intent is separate state rather than derived. A microphone seized by another
app must not silently rewrite what the user asked for; when the device comes back, the tuner should resume
if and only if the user still wants it to.

---

## Changed state

### `ReadingHandler` — the continuous channel's payload

| | Before | After |
|---|---|---|
| **Signature** | `(cents: number, clarity: number) => void` | `(cents: number \| null, clarity: number) => void` |
| **Fires when** | a reading exists, ~43 Hz | unchanged, **plus once** on reading → no-reading |
| **`null` means** | — | no current reading; consumers return the marker to rest |

Full contract in [contracts/core-api-delta.md](./contracts/core-api-delta.md).

`null` rather than `0` because `0` is a real, common reading — a perfectly in-tune string — and the marker
would sit in the identical place for both. Encoding "I have nothing" as the value that means "you are
exactly right" would reproduce the defect inside its own fix.

### `subscribeToCents` — the React-layer re-export

`packages/react/src/useTuner.ts` widens its handler type to match. No behavioural change in the hook; it
forwards.

---

## Unchanged, and load-bearing

Listed because a plausible-looking implementation could break any of them.

| Thing | Why it must not move |
|---|---|
| `TunerStatus` union | US1 adds no status kind. `idle` already means "not capturing", and the session already reaches it via `stop()`. |
| `DEFAULT_HOLD_MS = 400` | The marker's rest timing is derived from this, not added alongside it (research D2). Changing it is a DSP product decision. |
| `PitchReading` reuse | The analyzer reuses one object; anything retaining a reading must copy. Unchanged, and the rest event carries no object at all. |
| Preferences shape | `a4Hz`, `accidentalStyle`. Untouched — no migration, Principle VI's versioning rule not engaged. |
| The discrete/continuous split | US2 adds to the continuous channel; it does not move marker position onto the discrete one. Guarantee R1 stands. |
| Port interfaces | `AudioSource`, `PreferencesStore`, `WakeLock` are unchanged, so the contract suite gains no obligations. |

---

## Presentation-only state

Neither of these leaves its component; both are listed for completeness.

| State | Owner | Note |
|---|---|---|
| `pressOriginIsBackdrop: boolean` | `SettingsSheet` (web) | Set on pointer-down, read on click, to decide whether a dismissal was intended (research D4). Not React state — a ref, because it must not trigger a render. |
| `reduceMotion: boolean` | `SettingsScreen` (mobile) | Same pattern already used by `TuningLine.tsx` on mobile; read from `AccessibilityInfo` (FR-057). |

`pressOriginIsBackdrop` being a ref rather than state is a correctness point, not a micro-optimisation:
setting state during pointer-down would re-render the sheet mid-gesture, and the reference-pitch slider is
a controlled input being dragged at the time.
