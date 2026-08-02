# Phase 1 Data Model: Chromatic Guitar Tuner

**Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

There is no database and no server. "Data model" here means the in-memory domain types that live in
`packages/core`, plus the two persisted preferences. All types are `readonly` by default; the one deliberate
exception is documented in §3.

---

## 1. Note

The vocabulary the whole app speaks in. Derived, never stored.

| Field | Type | Notes |
|---|---|---|
| `pitchClass` | `0..11` | 0 = C, 1 = C♯/D♭, … 11 = B |
| `octave` | `number` | Scientific pitch notation; A4 = 440 Hz by default |
| `midi` | `number` | `octave * 12 + pitchClass + 12`; the canonical identity |

**Derivation rules**

- `frequency(midi, a4) = a4 * 2 ** ((midi - 69) / 12)` — 12-tone equal temperament (spec Assumptions).
- `midiFromFrequency(f, a4) = 69 + 12 * log2(f / a4)`, real-valued; the nearest note is the rounded value and
  the fractional remainder × 100 is the cents deviation.
- **Naming** depends on `AccidentalStyle` (FR-023): pitch class 1 renders `C♯` or `D♭`. Naturals are
  unaffected. One function owns this mapping so FR-023's "everywhere a note is shown" is structurally true.

**Validation**

- `midi` must be within `A0..C8` (21…108). Outside this the analyzer reports no reading rather than clamping —
  clamping would invent a note the player is not playing.

---

## 2. TunerStatus (discriminated union)

The single state the entire UI keys off. Modelled as a discriminated union so an unhandled state is a
compile error, which is how spec SC-014 ("zero dead ends") is enforced by the type system rather than by
diligence.

```ts
type TunerStatus =
  | { kind: 'idle' }                                    // before start
  | { kind: 'requesting-permission' }
  | { kind: 'permission-denied'; canRetry: boolean }
  | { kind: 'no-microphone' }
  | { kind: 'microphone-busy' }
  | { kind: 'listening' }                               // running, no usable signal
  | { kind: 'reading'; reading: PitchReading }          // running, confident
  | { kind: 'error'; message: string };
```

**State transitions**

```text
idle ──start()──▶ requesting-permission ──granted──▶ listening
                          │                             ▲  │
                          ├──denied──▶ permission-denied─┘  │
                          ├──no device──▶ no-microphone ────┤  (auto-recover, FR-029)
                          └──in use──▶ microphone-busy ─────┘
listening ──confident reading──▶ reading
reading ──signal decays (~400 ms hold)──▶ listening
reading | listening ──stop() / backgrounded──▶ idle          (FR-033: release mic)
any ──unrecoverable failure──▶ error
```

Every terminal-looking state carries enough information for the UI to offer a next step (FR-028, SC-014):
`permission-denied` carries `canRetry`, `error` carries a message. The recovery transitions back to
`listening` are automatic (FR-029) — no restart, no user action beyond fixing the underlying condition.

---

## 3. PitchReading

One live measurement. This is the object the display renders.

| Field | Type | Notes |
|---|---|---|
| `frequency` | `number` | Hz, as detected |
| `midi` | `number` | Nearest note (rounded) |
| `cents` | `number` | Signed deviation from that note, −50…+50 |
| `clarity` | `number` | 0–1, from the McLeod detector |
| `state` | `TuningState` | Derived; see §4 |
| `timestamp` | `number` | ms since analysis start |

**Mutability exception**: in the hot path this object is **reused, not reallocated**, per Constitution
Principle V and research D5. It is the one mutable structure in the core. It is copied into an immutable
snapshot exactly once, at the `useTuner` boundary, before React ever sees it — so no component can observe a
torn or mutating object. `allocation.test.ts` guards the reuse; a test in `packages/react` guards the copy.

**Validation**

- `cents` is always within ±50 by construction (it is a remainder). A value outside that range is a bug in
  the note math, and is asserted in tests rather than clamped at runtime.
- A reading is only produced when `clarity` exceeds the gate (~0.9); otherwise the status is `listening`.

---

## 4. TuningState

The classification driving colour, wording, and the direction cue. Deliberately a closed set of four.

```ts
type TuningState = 'flat' | 'sharp' | 'in-tune' | 'no-reading';
```

**Derivation**: `|cents| <= IN_TUNE_TOLERANCE_CENTS (5)` → `in-tune`; otherwise the sign of `cents` decides.
Absence of a reading → `no-reading`.

This type is the **single source of the three redundant channels** required by FR-014/FR-015 — colour, marker
position, and text all read from it, which is what structurally prevents colour-only communication (the
Principle IV rule that matters most here, since colour-coded state is the product's core idea).

**Direction cue (FR-007)**: `flat → "tighten"`, `sharp → "loosen"`. Derived in one place, because "left means
flat" is not self-evident to a beginner and the mapping must never disagree between the marker and the words.

---

## 5. AnalyzerState (internal, not exported)

The rolling state of the filter chain (research D7). Never leaves `packages/core`.

| Field | Type | Purpose |
|---|---|---|
| `ring` | `Float32Array(4096)` | Preallocated sample ring buffer |
| `writeIndex` | `number` | Ring write head |
| `history` | `Float32Array(5)` | Median-of-5 window over cents |
| `lastConfident` | `PitchReading \| null` | Octave-jump comparison + hold-then-release |
| `lastConfidentAt` | `number` | Drives the ~400 ms hold before returning to `listening` |
| `displayedMidi` | `number \| null` | Hysteresis anchor — the note name currently shown |

`displayedMidi` is what implements FR-011: the displayed note only changes once the pitch crosses the
semitone midpoint by ~3 cents past it, rather than exactly at it. Without this field the note name flickers
whenever a string sits on a boundary — precisely the situation User Story 2 puts the player in on purpose.

---

## 6. Preferences (persisted)

The only persisted state in the product. Two values, on-device only (FR-024, FR-032).

| Field | Type | Default | Validation |
|---|---|---|---|
| `a4Hz` | `number` | `440` | 415 ≤ v ≤ 466 (FR-022); out-of-range or unparseable → default |
| `accidentalStyle` | `'sharp' \| 'flat'` | `'sharp'` | Unknown value → default |
| `schemaVersion` | `number` | `1` | Forward-migration hook per Principle VI |

**Rules**

- Stored under one key as JSON. Corrupt or absent data resolves to defaults rather than an error — a broken
  preference must never block tuning.
- `a4Hz !== 440` must be visibly surfaced on the tuner screen (FR-022), so it is exposed as a derived
  `isNonStandardReference` flag rather than left for each app to recompute and potentially forget.
- `schemaVersion` exists from day one because Principle VI requires a forward-migration path from the first
  release, and adding it later is far more expensive than carrying it now.

---

## 7. Entity relationships

```text
Preferences ──a4Hz──▶ Note (frequency derivation)
                         ▲
                         │ nearest
AudioSource ──PCM──▶ AnalyzerState ──produces──▶ PitchReading ──derives──▶ TuningState
                                                       │                        │
                                                       └────▶ TunerStatus ◀──────┘
                                                                   │
                                                              useTuner()
                                                                   │
                                            ┌──────────────────────┴──────────────────────┐
                                    discrete (React state)                continuous (transform)
                                    note name, TuningState                 marker position
```

The split on the bottom row is the performance decision from research D6 expressed as data flow: discrete
values change rarely and go through React; the continuous marker position updates ~43×/second and bypasses
React entirely. Both apps consume the same two channels from the same hook.

---

## 8. Traceability

| Spec requirement | Model element |
|---|---|
| FR-002, FR-003 nearest note + octave | `Note`, `midiFromFrequency` |
| FR-004 signed cents | `PitchReading.cents` |
| FR-005, FR-006 marker on ±50 c line | `PitchReading.cents` → continuous channel |
| FR-007 turn direction | `TuningState` → direction cue |
| FR-008 ±5 cent tolerance | `IN_TUNE_TOLERANCE_CENTS` |
| FR-011 no boundary flicker | `AnalyzerState.displayedMidi` hysteresis |
| FR-012 listening vs. reading | `TunerStatus`, `clarity` gate |
| FR-014, FR-015 redundant state channels | `TuningState` as single source |
| FR-022, FR-023, FR-024 preferences | `Preferences`, `isNonStandardReference` |
| FR-028, FR-029, SC-014 no dead ends | `TunerStatus` union + auto-recovery transitions |
| FR-032, SC-015 no user data | Only `Preferences` persists; no other entity leaves memory |
