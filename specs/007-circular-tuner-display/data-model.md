# Data Model: Circular Tuner Display

**Feature**: 007-circular-tuner-display | **Date**: 2026-08-12

Three of the five entities below are new; two are existing ones this feature
extends. Nothing in the DSP path, the note maths, or the reading filter chain
changes.

---

## §1 — `TunerDisplay` (new, `packages/core/src/types.ts`)

```ts
/** Which tuning display the user has chosen (FR-146, research D10). */
export type TunerDisplay = 'line' | 'dial';
```

A closed union of two, in the same shape and for the same reason as
`AccidentalStyle`: the stored value IS the vocabulary the UI shows, so a record
opened by a human reads as what it means.

**Validation** — `isTunerDisplay(value: unknown): value is TunerDisplay` is an
exact match against the two literals. Case-sensitive on purpose, matching
`isAppearancePreference`: `'Line'`, `'circle'`, and `'circular'` are all rejected
rather than coerced, because each is something a hand-edit or a rival
implementation would plausibly write and none of them is a value this app ever
produced.

---

## §2 — `StoredPreferences` (extended, `packages/core/src/ports/preferences-store.ts`)

```ts
export interface StoredPreferences {
  readonly a4Hz: number;
  readonly accidentalStyle: AccidentalStyle;
  readonly appearance: AppearancePreference;
  readonly tunerDisplay: TunerDisplay;   // added by 007
  readonly schemaVersion: number;
}
```

| Field | Default | Repair rule |
|---|---|---|
| `tunerDisplay` | `'line'` | Anything that is not exactly `'line'` or `'dial'` — including absent — becomes `'line'` |

**`PREFERENCES_SCHEMA_VERSION` stays at 1** (research D9). An absent field is not
an incompatible shape; it takes the default through the clause that already
exists for every other field, which is the whole of FR-149 and FR-151.

**Independent repair is a requirement, not an implementation detail.** FR-151
says an unrecognised display "MUST resolve to the horizontal display without
discarding any other stored preference", and `normalizePreferences` already
repairs field by field for exactly this reason — a corrupt display choice is no
reason to throw away a reference pitch the user set deliberately.

**Neither adapter changes.** `localStorage` and AsyncStorage both persist this
record as one opaque JSON blob under `PREFERENCES_STORAGE_KEY`, so a fourth field
is invisible to them. This is the same conclusion 005 reached for `appearance`,
and it is what makes FR-150 ("persist on the device across sessions") and FR-153
("still applies, warn when it cannot be saved") inherited behaviour rather than
new code: the same `apply()` → `savePreferences()` path, the same optimistic
write, the same `persistenceFailed` flag.

---

## §3 — Dial geometry (new, derived, never stored)

All angles are **degrees clockwise from the top of the dial**, which is where C
sits (FR-155).

| Quantity | Value | Source |
|---|---|---|
| Segments | 12 | one per chromatic pitch class (FR-154) |
| Segment width | `360 / 12 = 30°` | FR-154's "equal angular width" |
| Centre of segment *k* | `k × 30°` | k = pitch class, C = 0 (FR-155) |
| Boundaries | `15° + k × 30°` | halfway between adjacent centres |
| Full deflection | `±15°` | ±50 cents, half a segment |
| In-tune band | `±1.5°` | ±5 cents, `IN_TUNE_TOLERANCE_CENTS` |

**Segment labels** come from `noteName(midi, accidentalStyle)` — the existing
function, which is the only place accidental style is applied. That is what makes
FR-156 structurally true rather than a second implementation of the same rule: the
dial labels its segments with the same call the note readout uses.

A segment is pure derived data. It is computed at render time from the pitch class
and the accidental preference, and there is no `Segment` object to store.

---

## §4 — Needle angle (new, derived, `packages/core/src/notes/dial.ts`)

```ts
/** Degrees clockwise from the top of the dial for a note and its deviation. */
export function dialAngleDegrees(midi: number, cents: number): number;
```

```
dialAngleDegrees(midi, cents) = 30 × (pitchClassOf(midi) + cents / 100)
```

Worked examples, all of which become test fixtures:

| Reading | Pitch class | Angle |
|---|---|---|
| C, 0 cents | 0 | `0°` |
| C, +50 cents | 0 | `15°` — the C/C♯ boundary |
| C♯, −50 cents | 1 | `15°` — the same place, from the other side |
| A, 0 cents | 9 | `270°` |
| B, +49 cents | 11 | `344.7°` |
| C, −49 cents | 0 | `−14.7°` — 0.6° clockwise of the line above |

The last two rows are why §5 exists.

**Range**: the raw result is `−15° ≤ θ < 345°`, because `cents` is always within
±50 by construction (`nearestNote` returns the remainder after rounding to the
nearest semitone, and its doc comment states that a value outside that range is a
bug at the source, not something callers clamp). The needle therefore never
leaves the segment of the note being named — an invariant worth asserting, since
it is what makes "point at the segment of the note you are hearing" and "point at
the exact pitch" the same instruction.

---

## §5 — Unwrapped angle (new, derived, stateful at the call site)

```ts
/** The representative of `target` (mod 360) nearest `previous`. */
export function unwrapDegrees(previous: number, target: number): number;
```

The needle's rendered angle is a **continuous accumulation**, not a value in
`[0, 360)`. Each display keeps the last unwrapped angle next to its transform —
a `useRef` on web, a ref alongside the shared value on mobile — and feeds each new
raw angle through `unwrapDegrees` before writing it.

This state deliberately does **not** live in React: it is written ~43 times a
second, which is the same reason the transform itself is written imperatively
(guarantee R1, research D6 of 001).

| Previous | Raw target | Unwrapped | Effect |
|---|---|---|---|
| `344.7°` | `−14.7°` | `345.3°` | 0.6° clockwise — correct |
| `344.7°` | `−14.7°` | *(without unwrapping)* `−14.7°` | 359.4° anticlockwise — the defect FR-159 forbids |
| `1800.0°` | `0°` | `1800°` | five octaves up, still continuous |

**Reset**: the accumulated angle is per-mount. It is not reset on a lapse — FR-162
holds the last angle — and it is not reset when the note changes, which is the
entire point.

---

## §6 — `ReadingHandler` (extended, `packages/core/src/tuning/session.ts`)

```ts
export type ReadingHandler = (
  cents: number | null,
  clarity: number,
  midi: number | null   // added by 007
) => void;
```

| Event | Arguments |
|---|---|
| Live reading | `(reading.cents, reading.clarity, reading.midi)` |
| Reading withdrawn | `(null, 0, null)` |

Three scalars, so the per-callback allocation budget is unchanged (Principle V,
`allocation.test.ts`). Existing subscribers that take two parameters are
unaffected — `TuningLine` continues to ignore everything after `cents`.

`midi` is `null` on withdrawal for the same reason `cents` is: the channel has no
other way to say "I have nothing", and encoding it as a real MIDI number would
name a note the tuner is not hearing. The dial reacts by holding its angle and
recolouring (FR-162), so it reads the null as an instruction about *colour*, not
about *position* — which is exactly how it differs from the line.

---

## §7 — Published preferences (extended, `packages/react`)

`usePreferences()` gains two members, following `accidentalStyle` exactly:

```ts
readonly tunerDisplay: TunerDisplay;
readonly setTunerDisplay: (display: TunerDisplay) => void;
```

`setTunerDisplay` goes through the same `apply()` as every other setter:
optimistic in-memory update first, persist after, `persistenceFailed` on failure.
Because it changes only which component `TunerDisplay` renders and never touches
the session, FR-152 ("MUST NOT interrupt or restart audio capture, MUST NOT
re-prompt for permission") holds by construction — there is no code path from this
setter to `session.start()`.
