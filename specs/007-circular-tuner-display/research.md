# Research: Circular Tuner Display

**Feature**: 007-circular-tuner-display | **Date**: 2026-08-12

Phase 0 of `/speckit-plan`. Every decision below is referenced by number from
`plan.md`, `data-model.md`, `contracts/tuner-display.md`, and the code comments
that will follow.

---

## D1 — Two sibling components, not one parameterised meter

**Decision**: `TuningLine` is left untouched. A new `TuningDial` sits beside it in
`molecules/`, and `TunerDisplay` chooses between them with a ternary.

**Rationale**: The two share a props shape and nothing else. Their internals have
no common sub-problem: one translates along an axis, the other rotates about a
centre; one has two end labels, the other has twelve; one returns to rest on a
lapse, the other holds. Principle II requires an abstraction with fewer than two
real implementations to be justified or removed, and a "meter" base class here
would have exactly two implementations that share only their prop names.

**Alternatives considered**:

- _Generalise `TuningLine` into a `TuningMeter` with a `shape` prop_ — rejected.
  It would put a branch inside a component that is currently the clearest thing
  in the app, and every future change to either display would have to reason
  about the other.
- _Render both and hide one with CSS_ — rejected. Both would subscribe to the
  continuous channel and write a transform 43 times a second, doubling the
  per-frame work to save one ternary.

---

## D2 — The needle's angle needs `midi` on the CONTINUOUS channel

**Decision**: `ReadingHandler` gains a third scalar parameter:

```ts
type ReadingHandler = (cents: number | null, clarity: number, midi: number | null) => void;
```

`useTuner` gains `subscribeToReading`, which forwards all three. `subscribeToCents`
stays exactly as it is, because `TuningLine` genuinely only wants cents.

**Rationale**: The needle angle is a function of pitch class *and* cents. Pitch
class is available today only from the DISCRETE channel, as the `note` string in
React state — and combining the two channels is wrong in a way that is easy to
miss and impossible to unsee.

Consider a pitch rising through any note boundary, say C into C♯. Just below the
boundary the reading is `C +50`, which is `30 × (0 + 0.50) = 15°`. Just above it
the reading is `C♯ −50`, which is `30 × (1 − 0.50) = 15°`. The angle is
continuous, as it must be. But the two channels do not land in the same frame:
the continuous channel delivers the new `−50` immediately, while the new pitch
class arrives with the next React render. For that one frame the display would
compute `30 × (0 − 0.50) = −15°` — a **30° backwards jump on every boundary
crossing, at every note**, correcting itself a frame later. That is a visible
flick precisely when the player is turning the peg.

Three scalars allocate nothing, so Principle V's per-callback allocation budget
is untouched — this is the same reason `clarity` is already a bare parameter
rather than a `{ cents, clarity }` object.

**Alternatives considered**:

- _Derive pitch class from `note` in React state_ — rejected, see above.
- _Publish the whole `PitchReading`_ — rejected. The analyzer REUSES that object
  (Principle V, `allocation.test.ts`); handing it to subscribers invites exactly
  the retention bug the type's doc comment warns about, and copying it per frame
  allocates 43 times a second.
- _Compute the angle inside the session and publish one number_ — rejected. The
  session would then own a presentation concern, and `TuningLine` would receive
  an angle it has no use for. The angle function is pure and lives in the core
  where it can be unit-tested; the display calls it.

---

## D3 — Angles must be unwrapped, or the needle spins the long way

**Decision**: A pure core function

```ts
unwrapDegrees(previous: number, target: number): number
```

returns the representative of `target` (mod 360) nearest `previous`. The display
keeps the last unwrapped value outside React — a `useRef` on web, a plain
module-scope-free ref on mobile — and feeds every new angle through it.

**Rationale**: The raw angle is defined mod 360, and both animation mechanisms
interpolate linearly between two *numbers*. Crossing the top of the circle takes
the raw value from `344.7°` (B, +49 cents) to `−14.7°` (C, −49 cents). Those are
the same direction and 0.6° apart, but as numbers they are 359.4° apart, so a CSS
`transition` and a Reanimated `withTiming` alike will animate the needle almost
all the way round backwards. This is FR-159's "MUST always take the shorter way
around", and it cannot be satisfied by clamping.

Unwrapping accumulates: a player sweeping E1 to E6 moves the needle through five
octaves, so the stored value legitimately reaches ~1800°. Double precision has
many orders of magnitude of headroom before that matters, and `rotate(1800deg)`
renders identically to `rotate(0deg)`.

**Alternatives considered**:

- _Quantise the needle to segment centres and animate note-to-note_ — rejected.
  It throws away the deviation, which is the entire reading.
- _Disable the transition when the jump exceeds 180°_ — rejected. It replaces a
  wrong animation with a visible snap at the one boundary the player watches most
  (the low E string sits a semitone above the top of the dial's B segment).

---

## D4 — The dial is drawn with layout primitives; no new dependency

**Decision**: Both platforms draw the dial from the primitives they already have:

- the rim — one element with a 50% border radius and a border;
- twelve boundary ticks — thin rectangles, absolutely positioned at the centre
  and rotated by `15° + k × 30°`;
- twelve labels — absolutely positioned by trigonometry at a fixed label radius,
  each drawn upright rather than rotated so it reads normally at every position;
- one needle — see D5.

**Rationale**: `apps/mobile` has no vector-drawing dependency, and `react-native-svg`
is deliberately not one (CLAUDE.md; FR-018's requirement that both platforms draw
the same mark). Everything above is expressible in the intersection of CSS and
React Native styling, so one geometry serves both platforms and SC-071's
"needle angles agreeing within 1 degree" is structural rather than aspirational.
Principle II would require a written justification for a new dependency, and a
dependency whose job is replaceable by twelve rotated rectangles fails the
"fewer than ~30 lines of equivalent hand-written code" test outright.

**Alternatives considered**:

- _`react-native-svg` on mobile, native `<svg>` on web_ — rejected twice over: a
  new dependency for drawing that primitives already do, and two different
  drawing models to keep in step across platforms.
- _A CSS `conic-gradient` for the segments on web_ — rejected. There is no mobile
  equivalent, so the two dials would diverge in construction.

---

## D5 — The rotation origin trap (the rotate-equivalent of the translateX bug)

**Decision**: The needle is drawn inside a wrapper that is exactly the size of the
dial and concentric with it. The **wrapper** is what rotates; the needle sits
inside it, drawn from the wrapper's centre outward and never transformed itself.

**Rationale**: `rotate()` turns an element about its own centre by default. A
needle drawn as a tall thin bar from the dial's centre to its rim has its own
centre halfway along its length, so rotating the needle directly makes it *orbit*
that midpoint instead of sweeping about the dial's centre — it would swing out of
the circle entirely at 90°.

This is the same class of defect as the `translateX` percentage bug that shipped
for seven phases and is documented in `TuningLine.tsx` and CLAUDE.md: a transform
applied to the wrong element, producing motion that looks plausible in a still
frame. The fix has the same shape as that one — put the transform on the
full-size container, for which the geometry means what it appears to mean.

Explicitly NOT the fix: setting `transformOrigin` on the needle. React Native
supports it, so it would work, but it introduces a second mechanism where the
wrapper already gives both platforms identical behaviour with no property whose
support has to be checked.

---

## D6 — Angular resolution: what a dial can and cannot show

**Finding** (no decision required, but it constrains D7 and must not be
"optimised" away later):

| | Horizontal line | Dial |
|---|---|---|
| Full ±50 cents spans | 720 px of track | 30° of arc |
| Movement per cent | **7.2 px** | **0.3°** — 0.63 px of tip travel at r = 120 |
| In-tune band (±5 cents) | 144 px wide | **3° wide** — ~7 px of arc at r = 120 |
| Full deflection | ±360 px | **±15°** |

A dial that shows all twelve notes on one face gives each note 1/12th of the
circle, so it is **~11× less sensitive per cent** than the line. Matching the
line's sensitivity would need a needle 1375 px long.

This is inherent to the requested design, not a defect: the dial's job is
note identity and direction at a glance, and it does that well — ±15° of tilt is
unmistakable from a metre (SC-064), and ±2 cents of jitter becomes ±0.6°, so
SC-065's stability requirement is met more comfortably than on the line. Fine
precision stays where it already is: the cents number and the state colour, both
unchanged and both still on screen (FR-168).

**Consequence for D7**: a ±5 cent zone drawn as a wedge would be a 3° sliver.
Drawing the in-tune tolerance as a *region* is therefore not viable on the dial;
the target must be marked as a *line*, and the tolerance carried by colour.

---

## D7 — Marking the target (FR-161)

**Decision**: The dial marks its target with three static channels and one live
one:

1. **Boundary ticks** at each `15° + k × 30°` — quiet, in `line`, delimiting the
   twelve segments.
2. **A note label** centred in each segment. The label *is* the target: the
   needle aims at the centre of the text.
3. **A centre tick** on the segment the needle is currently in, drawn in the
   current tuning-state colour — the exact angle that means "in tune".
4. **The label of the active segment** taking the tuning-state colour and bold
   weight, which is how the display says "this is the note you are on" without
   relying on the needle's position alone.

**Rationale**: FR-161 asks that the player "can see where the needle is aiming
before it gets there". Given D6, that has to be a mark rather than a zone. The
in-tune *tolerance* remains carried by colour and by the cents readout, exactly as
FR-160 requires — it is the same tolerance constant, applied by the same
`tuningStateOf`, and no new threshold is introduced.

**Alternatives considered**:

- _A tinted wedge on the active segment, mirroring the line's in-tune zone fill_ —
  rejected. A filled wedge is the one shape D4's primitives cannot draw without
  clipping, and at ±1.5° the in-tune wedge would be invisible anyway.
- _A centre tick on all twelve segments_ — rejected. Twelve boundary ticks plus
  twelve centre ticks is 24 radial lines around a 12-label face; the clutter costs
  more legibility than the extra marks buy.

---

## D8 — No opacity multiplier anywhere on the dial

**Decision**: Every element of the dial is drawn with a token at full strength.
The lapsed needle (FR-162) changes **colour** — from the tuning-state colour to
`noReading` — rather than being dimmed with an opacity multiplier. The twelve
segment labels use `text`, and the active one uses the state colour.

**Rationale**: This has bitten the project twice, both times on exactly this kind
of element: the FLAT/SHARP labels shipped at 0.55 (3.9:1, caught by Axe only
because they are text) and the tuning rule and its ticks shipped at 0.6/0.5,
compositing to 2.1:1 and 1.85:1 against a 3:1 floor, caught by nobody until
someone said the lines looked faint. The dial adds twenty-five new graphics and
twelve new text elements; a multiplier anywhere in it would be invisible to the
palette test (which sees only tokens) and to Axe (whose contrast rule covers text
only).

`noReading` is already the app's vocabulary for "listening, nothing usable" — the
line's marker takes exactly this colour in the same state, via the same
`stateColor(state)` call — so FR-160's "same colours, same vocabulary" is
satisfied by reusing the existing mapping rather than by inventing a lapsed
treatment.

**Note for review**: the spec's FR-162 says the needle "visibly fades". This
implements that as *going quiet by colour* (a saturated state colour dropping to
the deliberately-muted `noReading` grey, while the note name beside it blanks to
"–"), not as an alpha ramp. If a true alpha fade is wanted on top, it needs its
own token and a composited assertion in `packages/tokens/tests/contrast.test.ts`,
because a needle at reduced alpha is a meaningful graphic subject to the 3:1
floor.

---

## D9 — The preference is a fourth field, and the schema version does not move

**Decision**: `StoredPreferences` gains `tunerDisplay: TunerDisplay` where
`TunerDisplay = 'line' | 'dial'`. `DEFAULT_PREFERENCES.tunerDisplay` is `'line'`.
`normalizePreferences` repairs it independently of its neighbours.
`PREFERENCES_SCHEMA_VERSION` stays at **1**.

**Rationale**: This is the same shape of change as 005's `appearance`, and it takes
the same answer for the same reason (005 research D6): an absent field is not an
incompatible shape. Every record written before this feature simply has no
`tunerDisplay`, and the existing "unusable value takes the default" clause turns
that into `'line'` — which is FR-149's "the horizontal display MUST be the default
for anyone who has not chosen", satisfied with one clause and no migration code.

Neither storage adapter changes. Both treat the record as an opaque JSON blob;
`localStorage` and AsyncStorage learn nothing (contract §5 of 005 says exactly
this, and it holds again). The port itself is unchanged, so FR-150's "persist on
the device across sessions" is inherited rather than implemented — the same
`apply()` → `savePreferences()` path, the same optimistic write, the same
`persistenceFailed` surface for FR-153.

**Alternatives considered**:

- _Bump `PREFERENCES_SCHEMA_VERSION` to 2_ — rejected. Nothing needs migrating,
  and a version bump with no migration teaches the next reader that the number
  moves for additive changes, which is the opposite of what it is for.
- _A separate storage key for display choice_ — rejected. `PREFERENCES_STORAGE_KEY`
  has exactly one definition and one blob by design (CLAUDE.md); a second key
  would need its own load, its own repair, and its own reset path.

---

## D10 — Naming: "Tuning display", "Line" and "Dial"

**Decision**: The settings group is labelled **Tuning display**, with options
**Line** and **Dial**. The stored values are the same two words, `'line'` and
`'dial'`.

**Rationale**: Chosen by the user from four candidates. "Dial" is the everyday
word for a speedometer face and says what the thing does; "Circle" names only its
outline. "Line" is what the app's own design language already calls the
horizontal element ("one horizontal line, flat left, sharp right"), and is plainer
than "Horizontal", which describes a direction rather than an object. Both labels
are one short word, so the two buttons sit at equal width in the same way the
Appearance row does.

Storing the same tokens the UI shows keeps the record readable by a human who
opens it, and matches `accidentalStyle`'s `'sharp' | 'flat'` precedent — the
stored value is the vocabulary, not a code for it.

**Placement**: between Accidentals and Appearance. The sheet then reads
*what the tuner listens for* (reference pitch) → *how it names notes*
(accidentals) → *how it draws them* (tuning display) → *how the app looks*
(appearance), which is narrowing scope, and it puts the two display-shaped
settings next to each other.

---

## D11 — Reduced motion, and where the reduced-motion flag comes from

**Decision**: Each platform reuses the mechanism its `TuningLine` already uses —
`window.matchMedia('(prefers-reduced-motion: reduce)')` on web, and
`AccessibilityInfo.isReduceMotionEnabled()` plus its `reduceMotionChanged`
subscription on mobile — and drops the needle transition entirely rather than
shortening it (FR-165).

**Rationale**: FR-165 restates FR-016, which both `TuningLine` implementations
already satisfy in exactly this way. Reusing the mechanism verbatim is what keeps
"identical concepts behave identically" (Principle IV) true, and the mobile
listener matters more here than it looks: with no animation, the needle jumps
straight to each new angle, so D3's unwrapping still applies (the raw value would
still flick 359° at the top of the dial) even though nothing is being tweened.

---

## D12 — Testing strategy

**Decision**:

| What | Where | Gate |
|---|---|---|
| `dialAngleDegrees`, `unwrapDegrees` | `packages/core/tests/dial.test.ts` | `pnpm test`, ≥90% coverage |
| Third `midi` argument, incl. `null` on lapse | `packages/core/tests/session.test.ts` | `pnpm test` |
| `tunerDisplay` survives a round trip, absent/garbage → `'line'`, neighbours unharmed | `packages/core/testing/port-contract-tests.ts` (all adapters + doubles) | `pnpm test`, `mobile test` |
| Still zero steady-state allocation with the third argument | `packages/core/tests/allocation.test.ts` | `pnpm test` |
| Rendered needle rotation matches the predicted angle | `apps/web/e2e/` via a new `needleAngleDeg` helper reading the computed transform matrix | `pnpm test:e2e` |
| Composited contrast of needle, ticks and labels in both themes | `apps/web/e2e/a11y.spec.ts`, `packages/tokens/tests/contrast.test.ts` | `pnpm test:e2e`, `pnpm test` |
| Settings row present, labelled, 44 pt, and switching does not stop capture | both apps' component tests | `pnpm test`, `mobile test` |

**Rationale**: The angle maths is pure and belongs in the core where Principle III's
90% floor applies and where a fixture-driven test can assert exact degrees. The
rendered result needs a real browser because the failure mode this feature is most
likely to ship is D5's — a transform on the wrong element, which computes a
perfectly correct angle and draws it in the wrong place. `markerOffsetPx` exists
for precisely that reason on the line; `needleAngleDeg` is its counterpart, and it
must read the **computed matrix**, not the inline style, so it measures what the
compositor did rather than what we asked for.

Performance numbers (Principle V requires before/after for render-loop changes)
come from a Chrome DevTools trace of a 30-second tuning session on each display,
reported in `tasks.md`.
