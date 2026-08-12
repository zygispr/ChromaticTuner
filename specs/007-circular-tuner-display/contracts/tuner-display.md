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

### G6 — The boundary is single-valued *as a direction*

`dialAngleDegrees(m, +50)` and `dialAngleDegrees(m + 1, −50)` point the same way: they are congruent
modulo 360. A pitch exactly between two notes lands on the boundary between their segments, from
whichever side it is named.

**Corrected during implementation.** This originally said "are the same angle", and taken literally
that is false at one of the twelve boundaries. Eleven of them are equal as raw numbers — C +50 and
C♯ −50 are both `15°`. The twelfth wraps: B +50 is `345°` and C −50 is `−15°`, the same direction and
**exactly 360 apart as numbers**. The function is right and the wording was not. This is not a wrinkle
to paper over — it is precisely the case §2 exists for, and a renderer handed those two raw values in
consecutive frames with no unwrapping animates a full turn backwards.

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

### G19 — The record round-trips through every adapter *that runs the suite*

`save` then `load` returns the same `tunerDisplay`. Added to
`packages/core/testing/port-contract-tests.ts`, so adding behaviour to a port means adding a contract
check rather than only an adapter test. **(FR-150, FR-148)**

**Corrected during implementation — this originally claimed `localStorage` was covered, and it is
not.** Only two implementations actually execute this suite: `InMemoryPreferencesStore`
(`packages/core/tests/port-contracts.test.ts`) and the AsyncStorage adapter
(`apps/mobile/__tests__/async-storage-preferences.contract.test.ts`). `apps/web`'s
`LocalStoragePreferences` is under **no** contract test at all, because `pnpm test` runs Vitest over
`packages/*` only and `apps/web` has no unit-test project — its only coverage is end-to-end through a
real browser. The adapter is a whole-record `JSON.stringify`/`JSON.parse` and needs no change for this
feature, but the gap is real, predates 007, and is recorded here rather than left implied by a
contract that overstated its reach.

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

### G22 — No *steady-state* opacity multiplier anywhere on the dial

Every needle, tick, rim and label is drawn with a token at full strength. Any alpha introduced here
must have its own token and a composited assertion, because neither the palette test nor Axe can see a
multiplier applied at a call site. **(FR-167, and the defect that has now shipped twice)**

**The single exception is the lapsed needle, which fades to exactly zero.** Nothing is left on screen
to read, so there is no composited ratio to fail — which is precisely what distinguishes it from a
dimmed graphic, the thing this guarantee exists to forbid. The needle is therefore always in one of
two resting states, fully opaque or fully invisible, and never at rest anywhere in between.

**This clause originally read "the lapsed needle changes colour to `noReading`; it is not dimmed",
and that sentence shipped a defect.** FR-162 has always asked for the needle to "hold its last angle
**and visibly fade**"; the implementation held the angle, took the `noReading` colour, and never
faded, leaving a grey needle aimed at a note the player had stopped playing minutes earlier. The
contract's own wording made that look finished, and `dial-rest.spec.ts` pinned it with an assertion
that the needle's opacity was 1. Reported by a user looking at the running app. A guarantee written to
forbid one failure mode must not be phrased so that it mandates another.

### G23 — Both platforms draw the same dial

Same segment order, same labels from the same `noteName` call, same angles within 1°, same tokens.
Verified by the paired screenshots and by the shared fixtures. **(FR-148, SC-071)**

### G24 — The dial is silent to assistive technology

`aria-hidden` on web, `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
on mobile — exactly as `TuningLine` already is. The existing announcer remains the single spoken
channel. **(FR-164)**

Moving the note name and the cents readout into the hub does not change this. Both atoms are already
`aria-hidden` individually — they are two of the four visual channels the announcer speaks as one
sentence — so nesting them inside an `aria-hidden` dial removes nothing that was ever exposed.
**(FR-164, FR-168)**

### G24a — The dial takes no pointer events

Nothing inside the circle is interactive, and the dial must not behave as though it is: one
`pointer-events: none` on its root, inherited by every mark within it.

This is not belt-and-braces on top of `aria-hidden` — it fixes a real defect, and the reason is
geometric. Every rotated mark is drawn by an `inset: 0` wrapper, a square the size of the whole dial,
because the transform has to go on a concentric element rather than on the mark (**G21**). A rotated
square hit-tests over its rotated area, which overhangs the dial's own box by up to
`((√2 − 1) / 2) × size` — **101px on a 489px dial**, at the 45° ticks. The corners paint nothing, so
the reach is invisible until something inside it needs a click: the reference badge, 24px above the
dial, was clickable only at its two extreme ends. Latent before the hub, because the note name and the
cents readout used to stand in that gap and absorb it.

Mobile has no equivalent of this hazard from `pointer-events`, but it has the same *shape* of one:
a rotated `View` receives touches over its rotated area too, and `pointerEvents="none"` on the dial's
root is the same one-line answer. **(FR-164, and a defect reported against the running app)**

### G25 — Every radial dimension is a fraction of the radius

The hub, the needle band, the label ring, the ticks and the rim are each expressed as a fraction of
the dial's radius, and the type inside the dial scales with the dial's own width. No radial dimension
inside the circle is a fixed length.

This is what keeps the face one drawing rather than a set of parts that collide as the circle shrinks:
with a fixed 10px tick and a fixed 16px label against a proportional ring, the two ran into each other
somewhere below a 250px dial and nothing said so. The rings, from the centre out:

| ring   | radius        | contents                                   |
| ------ | ------------- | ------------------------------------------ |
| hub    | 0 → 0.55R     | note name and cents readout                |
| labels | 0.66R centre  | the twelve segment names                   |
| needle | 0.78R → 0.96R | the pointer                                |
| ticks  | 0.93R → 1.00R | boundary marks and the target, hanging in   |
| rim    | 1.00R         | the circle itself                          |

The needle's outer end deliberately runs into the tick ring rather than stopping short of it: confined
to the outer face it is a fraction of the length it had reaching the centre, and it has to stay the
dominant mark on the dial (FR-021). It is the one stroke here whose *width* is proportional too, for
the same reason. When the string is in tune the needle covers the target mark it is pointing at, which
is unambiguous rather than a loss — the mark exists to be visible while the needle is still on its way.

The needle sits **outboard of the labels**, not between them and the hub. The target mark and the
labels share a segment's centre *angle*, so they can only be separated by radius — putting the labels
near the rim would have stacked them on the very mark they are meant to sit beside. Outboard also
places the needle next to the tick it is aiming at, which is the pair the player is actually reading.

Stroke widths are exempt: a tick's 2px thickness is tangential, not radial, and a proportional hairline
would go sub-pixel and blur on a small dial. **(FR-157, FR-169, SC-073)**

### G26 — The hub text fits inside the hub, at every size

The note name and cents readout together occupy a box whose half-diagonal is no greater than the hub
radius — the constraint is the *diagonal*, not the width, because the needle can be at any angle and
the hub is a circle rather than a rectangle. The dial's maximum size is derived from this rather than
chosen: it is the smallest dial whose hub holds the note name at the full `type.noteSize`, so the
largest element on the screen never shrinks below what the horizontal display already draws.

Verified by measuring rendered boxes at several viewport heights, not by reading the font size back —
a `clamp()` that computes correctly and a text block that overflows the hub are the same computed
style. **(FR-169, FR-170, SC-073)**

### G27 — The needle fades on the lapse edge, and only there

The fade is driven from the **continuous** channel, imperatively, like the angle beside it: a lapse
sets opacity to zero and the next valid reading sets it back to one, with no React state on either
path (Principle V, guarantee R1). It hangs off the single lapse the reading filter already publishes —
the same edge that returns the line's marker to rest — so the two displays go quiet together without
either one owning a duration of its own. Under reduced motion the transition is dropped entirely
rather than shortened, as the rotation already is. **(FR-162, FR-162a, FR-162b, FR-165, SC-072)**
