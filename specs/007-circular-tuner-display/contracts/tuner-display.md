# Contract: Tuner Display

**Feature**: `007-circular-tuner-display` | **Date**: 2026-08-12

Guarantees are numbered **G1–G20** (for *geometry*; `A`, `P`, `R`, `S`, `N`, `L`, `W`, `T`, `C`, `D`,
`E` are taken by `001`–`004`, `M` by `005`, `K` by `006`). Code comments cite these numbers, as they
already do for `S1`, `A5`, `N7`, `P1`, `M5`, `K9`.

This contract **extends** `001`'s `core-api.md` §3 (the reading channel) and `platform-ports.md` §2
(the preferences record). The `PreferencesStore` port itself is **unchanged**: one more field moves
inside a blob both adapters already treat as opaque, exactly as in `005`.

---

## §1 Core: angle maths

### G1 — `dialAngleDegrees` is total and pure

```ts
dialAngleDegrees(midi: number, cents: number): number
```

Returns for every finite input, throws for none, reads nothing outside its arguments, writes nothing.
Same inputs, same output, always.

### G2 — C is at the top and the dial ascends clockwise

`dialAngleDegrees(midi, 0) === 30 × pitchClassOf(midi)`, in degrees clockwise from the top. Every C
is `0°`, every A is `270°`. **(FR-155)**

### G3 — Octave is invisible to the angle

`dialAngleDegrees(m, c) === dialAngleDegrees(m + 12, c)` for every `m` and `c`. Twelve segments carry
pitch class only; the octave stays in the note readout, which FR-168 keeps on screen.

### G4 — Deviation displaces proportionally, sharp clockwise

`dialAngleDegrees(midi, c) − dialAngleDegrees(midi, 0) === 0.3 × c`. Positive cents increase the
angle (clockwise, "speeding up"), negative decrease it. **(FR-158)**

### G5 — The needle never leaves its own segment

For every reading the tuner can produce, `|angle − 30 × pitchClass| ≤ 15°`. This follows from
`nearestNote` returning `cents` within ±50 by construction; G5 asserts it rather than assuming it,
because it is what makes "point at the segment you are hearing" and "point at the exact pitch" one
instruction rather than two that could disagree.

### G6 — The boundary is single-valued

`dialAngleDegrees(m, +50)` and `dialAngleDegrees(m + 1, −50)` are the same angle. A pitch exactly
between two notes lands on the boundary between their segments, from whichever side it is named.

---

## §2 Core: angle continuity

### G7 — `unwrapDegrees` is total and pure

```ts
unwrapDegrees(previous: number, target: number): number
```

### G8 — The result is congruent to the target

`unwrapDegrees(p, t) ≡ t (mod 360)` for all inputs. Unwrapping may never change which direction the
needle points, only which number expresses it.

### G9 — The result is the nearest such representative

`|unwrapDegrees(p, t) − p| ≤ 180`. **(FR-159)**

### G10 — Crossing the top of the dial is a short move

`unwrapDegrees(344.7, −14.7) === 345.3`, not `−14.7`. The regression this pins: both a CSS
`transition` and a Reanimated `withTiming` interpolate between two numbers, so the un-unwrapped value
sweeps the needle 359.4° anticlockwise to travel 0.6° clockwise.

### G11 — Accumulation is unbounded and monotone under a monotone sweep

A pitch rising continuously through five octaves yields a monotonically increasing sequence of
unwrapped angles reaching ~1800°. Nothing may normalise the accumulator back into `[0, 360)`.

---

## §3 Core: the reading channel

### G12 — `onReading` publishes `midi` as a third scalar

```ts
type ReadingHandler = (cents: number | null, clarity: number, midi: number | null) => void;
```

Live readings publish `(reading.cents, reading.clarity, reading.midi)`. **Extends `core-api.md` §3.**

### G13 — Withdrawal publishes `(null, 0, null)`

The lapse still fires **once, on the edge** (guarantee R3, unchanged). `midi` is `null` rather than a
retained note number, because the channel's way of saying "I have nothing" must not name a note.

### G14 — The channel still allocates nothing

Three scalar parameters, no object, no closure allocated per publish. Asserted by
`allocation.test.ts`, which must continue to pass unmodified in its steady-state assertion.
**(Principle V)**

### G15 — Existing two-parameter subscribers are unaffected

`subscribeToCents` keeps its `(cents: number | null) => void` signature and `TuningLine` keeps
working, on both platforms, with no change.

---

## §4 Core: preferences

### G16 — `normalizePreferences` defaults an unusable display to `'line'`

Absent, `null`, a number, an empty string, `'Line'`, `'circle'`, `'circular'`, or any value outside
the two permitted literals yields `'line'`. **(FR-149, FR-151)**

### G17 — Fields are still repaired independently

An unusable `tunerDisplay` must not disturb `a4Hz`, `accidentalStyle`, or `appearance`, and none of
those may disturb `tunerDisplay`. This is an existing guarantee (M6); G17 exists so that adding a
fourth field does not quietly weaken it. **(FR-151)**

### G18 — A record written before this feature loads without loss

A stored record from `001`–`006` — with no `tunerDisplay` at all — loads with its reference pitch,
accidental style and appearance intact, and `tunerDisplay: 'line'`. No migration code, no schema
version bump: `PREFERENCES_SCHEMA_VERSION` stays at **1**. **(FR-149)**

### G19 — The record round-trips through every adapter

`save` then `load` returns the same `tunerDisplay` for `localStorage`, AsyncStorage, and the in-memory
double. Added to `packages/core/testing/port-contract-tests.ts`, so every implementation is checked by
the same suite — adding behaviour to a port means adding a contract check, not just an adapter test.
**(FR-150, FR-148)**

### G20 — Choosing a display does not touch the microphone

`setTunerDisplay` reaches `session` by no code path. Capture continues across the switch, the reading
is uninterrupted, and no permission is requested. **(FR-152)**

---

## §5 Presentation obligations

These are not core APIs, so they are stated as obligations on both apps and checked by the tests named
in research D12.

### G21 — One transform per frame, on the wrapper

The needle's angle is written imperatively to a **dial-sized, concentric wrapper** — never to the
needle element itself, whose own centre is not the dial's centre (research D5). Web writes
`style.transform`; mobile writes a Reanimated shared value. Neither routes the angle through React
state. **(Guarantee R1, Principle V)**

### G22 — No opacity multiplier anywhere on the dial

Every needle, tick, rim and label is drawn with a token at full strength. The lapsed needle changes
colour to `noReading`; it is not dimmed. Any alpha introduced here must have its own token and a
composited assertion, because neither the palette test nor Axe can see a multiplier applied at a call
site. **(FR-167, and the defect that has now shipped twice)**

### G23 — Both platforms draw the same dial

Same segment order, same labels from the same `noteName` call, same angles within 1°, same tokens.
Verified by the paired screenshots and by the shared fixtures. **(FR-148, SC-071)**

### G24 — The dial is silent to assistive technology

`aria-hidden` on web, `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
on mobile — exactly as `TuningLine` already is. The existing announcer remains the single spoken
channel. **(FR-164)**
