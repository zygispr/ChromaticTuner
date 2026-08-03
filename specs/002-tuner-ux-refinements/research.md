# Phase 0 Research: Tuner UX Refinements

**Feature**: `002-tuner-ux-refinements` · **Date**: 2026-08-03

Every root cause below was established by reading the shipped code, not inferred from the symptom. Two of
them contradicted assumptions written into the spec, and the spec was corrected rather than the finding
being worked around.

---

## Root causes

| # | Symptom | Mechanism | Location |
|---|---|---|---|
| 1 | The "Use the microphone" button vanishes for good | The explainer is a one-shot gate: `accepted` flips once and the tuner replaces it permanently. Nothing renders a capture control afterwards. | `TunerGate.tsx` (both apps) |
| 2 | The marker holds a dead reading forever | The continuous channel only ever fires **when there is a reading**. When the analyzer returns `null`, the session publishes `listening` on the discrete channel and returns early — the marker is never told. | `session.ts:305-308` |
| 3 | The mobile backdrop sweeps up from the bottom | `animationType="slide"` on `Modal` slides the whole modal container, and the backdrop is inside it. | `SettingsScreen.tsx:50` |
| 4 | Tapping outside the mobile sheet does nothing | The backdrop is a plain `View`. There is no press handler. | `SettingsScreen.tsx:56` |
| 5 | "A4 440 Hz" does not read as a button | In the standard state the control renders `border: 1px solid transparent` at `opacity: 0.6`. | `ReferenceBadge.tsx:47-51` |
| 6 | Dragging the slider out of the sheet closes it | The backdrop closes on `onClick`. A DOM `click` fires on the **nearest common ancestor** of `mousedown` and `mouseup` — press the slider, release over the backdrop, and that ancestor is the backdrop. | `SettingsSheet.tsx:58` |

Cause 6 is worth stating precisely because the existing code looks correct: the sheet already calls
`stopPropagation` on its own clicks (`SettingsSheet.tsx:75`), which handles a press that *starts and ends*
inside the sheet. The case it misses is the one where the two ends of the gesture are in different
elements, which is exactly what dragging a slider does.

---

## D1 — Where microphone intent lives

**Decision**: A boolean "the user wants capture on" in each app's `TunerGate`, passed down to the control
and used to gate `useMicrophoneLifecycle`.

**Rationale**: Calling `session.stop()` from a button is not sufficient and would look like it worked in
casual testing. `useMicrophoneLifecycle` calls `start()` on every `visibilitychange` back to visible
(`useMicrophoneLifecycle.ts:29`), so a user-initiated stop survives only until the next tab switch, at
which point the microphone reopens with no user action. FR-040 exists precisely for this. Intent must gate
the lifecycle hook — `useMicrophoneLifecycle(ready && captureEnabled)` — so the effect never subscribes
while the user has capture off.

The gate is also already the right owner: it holds `accepted`, it calls `start()`, and it is the only
component that sees both the permission state and the lifecycle hook.

**Alternatives considered**:

- *A shared `useMicrophoneControl()` hook in `packages/react`, with state in `TunerProvider`.* Cleaner
  against platform drift, and where this should go at a third consumer. Rejected now under Principle II:
  two occurrences is below this project's stated extraction threshold, and the abstraction would exist to
  serve a symmetry the two gates already maintain by hand.
- *Intent inside `TunerSession`.* Rejected on Principle VI: the session is platform-free domain logic, and
  "the user pressed a button" is a presentation concern. It would also put a UI-driven flag in the one
  class the DSP path depends on.
- *Deriving intent from `status.kind === 'idle'`.* Rejected: `idle` is also the pre-start state and the
  post-`stop()` state reached by backgrounding, so the control would misreport itself as "user stopped" in
  situations the user did not cause.

---

## D2 — When the marker rests, and on what timer

**Decision**: The marker rests **on the existing 400 ms filter release**. No new threshold, no new
constant.

**Rationale**: This is the finding that changed the spec. `ReadingFilter.holdOrRelease` already keeps the
last confident value for `DEFAULT_HOLD_MS = 400` and then calls `reset()` and returns `null`
(`filters.ts:232-239`). At that moment `analyze()` returns null, the session publishes `listening`, and
`useTuner` derives `note: null` and `cents: null` — **so the note name and the cents readout already clear
themselves today**. The marker is the only stale element, because it is driven by the continuous channel
and the continuous channel has no "nothing here" event.

The spec assumed a 2-second threshold and assumed the readout needed fixing too. Both were wrong. Adding a
second, longer timer would be worse than the status quo in a specific way: for 1.6 seconds the marker would
assert a position while the readout beside it asserted nothing, which is the same class of internal
contradiction — one channel disagreeing with another — that this whole story exists to remove.

**Alternatives considered**:

- *A separate 2 s stale timer in the presentation layer.* Rejected as above: two thresholds, guaranteed
  disagreement window, and a new constant to keep in sync with `holdMs`.
- *Tuning `DEFAULT_HOLD_MS` itself.* Rejected. It is a DSP-path constant with its own justification, and
  retuning shipped DSP is a product decision rather than a defect fix — the same reasoning that left the
  median window at 5 in `001`.

---

## D3 — How the continuous channel says "no reading"

**Decision**: Widen `ReadingHandler` to `(cents: number | null, clarity: number)` and emit `(null, 0)`
**once**, on the transition from having a reading to not having one.

**Rationale**: `null` rather than `0` because a marker sitting at centre is exactly what a perfectly in-tune
string looks like. Publishing `0` would make "in tune" and "heard nothing for 400 ms" identical on the very
channel whose job is to position the marker — encoding the defect this story fixes into its own fix.

Once-on-transition rather than every frame because the marker only needs to be told to move once; the
existing consumers already write a transform or a shared value and repeating it 43 times a second would
be pure waste on a path with a 16.7 ms budget. It also keeps the change invisible to `allocation.test.ts`,
since a transition-triggered call in a steady state of silence happens zero times per frame.

**Alternatives considered**:

- *A third channel, `onRest`.* Rejected under Principle II — a whole subscription surface for one boolean
  edge, and consumers would have to keep two subscriptions in sync.
- *Reusing the discrete channel.* The status already goes to `listening`, so consumers could react to that.
  Rejected because it forces the marker's position through React state at exactly the moment the
  architecture says not to, and guarantee R1 forbids it.

---

## D4 — What counts as a dismissal

**Decision**: A backdrop press dismisses only when it **begins and ends on the backdrop**. Implemented per
platform: press-origin tracking on web, a pressable backdrop with a press-swallowing sheet on mobile.

**Rationale**: One rule, stated once, that fixes both halves of US3. The web bug and the mobile gap are the
same question with different answers today. Tracking the press origin makes the web behaviour match what
the existing `stopPropagation` was already trying to express, and gives the drag-out case the correct
answer for free.

On mobile the equivalent is a `Pressable` backdrop with the sheet swallowing presses, which is the standard
platform pattern and needs no origin tracking, because React Native's responder system already assigns a
touch to a single view for its whole lifetime rather than resolving to a common ancestor at the end.

**Alternatives considered**:

- *Web: `onMouseDown` on the backdrop instead of `onClick`.* Fixes the reported bug and breaks keyboard and
  assistive-technology activation, which synthesise `click` without a preceding `mousedown`.
- *Web: capture-phase listener with `event.target` checks.* Equivalent outcome, more machinery, and it puts
  the logic further from the element it governs.

---

## D5 — Making the reference control legible as a control

**Decision**: Give the standard state a visible border from the existing `line` token and remove the
opacity multiplier, keeping the non-standard state's stronger colour and bold weight as the differentiator.

**Rationale**: FR-053 requires that the non-standard state stay *more* prominent, so the standard state
cannot simply be promoted to look identical. A border satisfies "this is pressable" while colour and weight
continue to carry "and this value is unusual" — which keeps FR-022's original intent intact and keeps the
distinction on two channels rather than one.

Removing `opacity: 0.6` rather than raising it is deliberate, and it is the repo's own hard-won lesson: a
correct colour token at `opacity: 0.55` measured **3.9:1** against the 4.5:1 AA floor in `001`, and neither
the tokens package's contrast test nor review caught it, because the palette was fine and the composited
result was not. Opacity is the mechanism that defeats a verified token. Use a token that is already correct
at full strength.

**Alternatives considered**:

- *An explicit chevron or gear icon.* More obviously interactive, but adds a second element to a screen
  whose whole design premise is one glanceable readout, and it would need its own contrast and touch-target
  treatment.
- *Raising opacity to 0.7 (matching the FLAT/SHARP fix).* Rejected: it treats the symptom of the same
  mechanism that already caused one AA failure here.

---

## D6 — Separating the mobile backdrop from the sheet animation

**Decision**: `animationType="none"` on the `Modal`, backdrop rendered at full opacity immediately, and the
sheet animated in with Reanimated, honouring reduced motion.

**Rationale**: `animationType="slide"` animates the modal's single root container, and the backdrop lives
inside it, so backdrop and sheet cannot move independently while it is in use. Reanimated is already a
dependency and already drives the marker, so this adds no install-size cost — the Principle II dependency
test is not engaged.

Reduced motion is not optional here: `TuningLine.tsx` on mobile already reads
`AccessibilityInfo.isReduceMotionEnabled` and drops its animation entirely rather than shortening it
(FR-016). The sheet must follow the same convention, and the existing code is the pattern to copy.

**Alternatives considered**:

- *`animationType="fade"`.* Dims immediately-ish and removes the sweep, but also removes the sheet's slide,
  which FR-056 requires to stay.
- *Keeping `slide` and animating the backdrop's opacity in the opposite direction to cancel it out.*
  Rejected as exactly the kind of cleverness Principle II names — a fix that requires the reader to
  understand two animations to see that they sum to one.

---

## Cross-cutting: what must not regress

Carried into `tasks.md` as explicit checks rather than trusted to the existing suite:

- **The ~43 Hz path stays allocation-free** (`allocation.test.ts`) and within the frame budget. US2 is the
  only change that touches it, and Principle V requires before/after numbers in the PR.
- **Axe stays clean over the new control states** — the microphone toggle in both states, and the reference
  control in both. `a11y.spec.ts` asserts what lands on the page, which is the only check that would have
  caught the `001` contrast defect.
- **The marker geometry check stays honest.** `apps/web/e2e/helpers.ts:markerOffsetPx` measures real
  bounding boxes and samples across a second, because a single measurement disagreed by 44 px on correct
  code. US2 changes when the marker moves, so this helper is load-bearing for the new tests and must not be
  weakened to make them pass.
- **Cold start stays under 2 s** (FR-026). US1 adds a control to the first screen the user sees.
