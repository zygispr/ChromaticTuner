# Feature Specification: Tuner UX Refinements

**Feature Branch**: `002-tuner-ux-refinements`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "1. On both web and mobile apps, when user clicks "Use the microphone" button, I don't want the button to disappear completely, instead it should be replaced with a "Stop microphone" button (or something more gramatically correct). That way user will be able to actively start and stop using the microphone. 2. On both web and mobile, if the tuner doesn't pick up on a note for a while, the vertical line indicating the tuning should reset to the starting position. 3. On mobile I noticed a visual bug, when I press the settings button, the darker backdrop flows from the bottom which appears weird. Maybe it should turn dark immediately? Same as in web app. 4. On mobile when settings slideout is open, I would expect to be able to close the settings slideout by pressing on the backdrop. 5. On both web and mobile, it's impossible to tell that the "A4 440 Hz" button (by default) is actually a button. Maybe it should have a border, like a ternary button? 6. On web app, the slideout disappears onMouseUp, so when I click and hold the pitch slider and scroll out of the range of the slideout and release the mouse, the slideout disappears. I would expect to only be able to close the slideout by pressing "Done" inside it or pressing on the backdrop."

## Overview

Six refinements found by using the shipped tuner on real devices. Five correct behaviour the original spec
never pinned down; one (US1) is a genuinely new capability. None touch the DSP path, the accuracy budget,
or the two-output-channel design.

This spec continues the numbering of `001-chromatic-guitar-tuner` — **FR-036 onward, SC-016 onward** —
rather than restarting at FR-001. Requirement numbers in this project are cited by number in code comments
and in `contracts/`, so a second FR-005 meaning something different would silently corrupt those
references.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stop and restart the microphone on demand (Priority: P1)

A player finishes tuning and wants the microphone released — because someone else is talking, because they
are about to record, or simply because a live microphone indicator makes them uneasy — without closing the
app or the tab. Today the only control that ever mentions the microphone is the one-shot "Use the
microphone" button, which disappears the moment it is pressed. After that the app listens until it is
backgrounded or closed, and nothing on screen offers a way to stop it.

**Why this priority**: It is the only item that adds a capability rather than correcting one, and the only
one with a privacy dimension. A tuner that cannot be told to stop listening is asking for trust it does not
need to ask for. It also makes the others easier to demonstrate — being able to stop and restart is how you
exercise US2 by hand.

**Independent Test**: Grant microphone access, confirm the tuner is reading, activate the stop control, and
confirm the operating-system recording indicator clears and readings cease. Activate start and confirm
readings resume without a page reload or app restart.

**Acceptance Scenarios**:

1. **Given** the tuner is listening, **When** the user activates the stop control, **Then** the microphone
   is released, the operating-system recording indicator clears, and the control becomes a start control.
2. **Given** the microphone has been stopped by the user, **When** the user activates the start control,
   **Then** listening resumes and readings appear again, with no reload or restart.
3. **Given** the user has stopped the microphone, **When** they look at the screen, **Then** it is
   unambiguous that the tuner is stopped rather than merely hearing silence.
4. **Given** the user stopped the microphone, **When** the app is backgrounded and returned to, **Then** it
   stays stopped — an explicit user decision is not overridden by lifecycle handling.
5. **Given** permission has never been granted, **When** the user activates the start control for the first
   time, **Then** the existing explainer-then-prompt flow is preserved (FR-028, FR-031).

---

### User Story 2 - A stale reading clears itself (Priority: P2)

A player plucks a string, the marker moves to show it is 12 cents flat, and the note decays into silence.
The marker stays exactly where it was — indefinitely. A reading that was true two seconds ago is still on
screen, indistinguishable from a live one, and the player has no way to tell whether the tuner is still
tracking or has simply stopped updating.

**Why this priority**: The only item where the product actively misinforms. A glanceable tuner holding a
stale position is worse than one showing nothing, because the player will act on it. It ranks below US1
only because it corrupts a reading the player is about to replace by plucking again.

**Independent Test**: Sound a tone, let the marker settle away from centre, then stop the sound. Confirm the
marker returns to its resting position and the readout stops asserting a note, within a bounded time.

**Acceptance Scenarios**:

1. **Given** the marker is displaced showing a live reading, **When** no pitch is detected for the stale
   threshold, **Then** the marker returns to its centre resting position.
2. **Given** the marker has reset after silence, **When** a string is plucked again, **Then** the marker
   tracks the new reading with no additional delay beyond normal detection latency (FR-027).
3. **Given** a note is sounding continuously, **When** the player holds it well past the stale threshold,
   **Then** the marker does not reset — sustained sound is not silence.
4. **Given** a decaying note that dips briefly below the detection threshold, **When** it recovers within
   the stale threshold, **Then** the marker does not visibly reset and re-acquire.

---

### User Story 3 - The settings sheet closes only when the user means it (Priority: P3)

Two ways the settings sheet behaves unpredictably. On the web, dragging the reference-pitch slider and
releasing the mouse outside the sheet closes it — the user was adjusting a setting, not dismissing
anything. On mobile, pressing the dimmed area outside the sheet does nothing, though every sheet on the
platform closes that way.

**Why this priority**: Both are moments where the interface does the opposite of what the user intended.
The web case actively interrupts work in progress; the mobile case is a missing affordance people try
first. Grouped because they are the same question — what counts as a dismissal — asked on two platforms.

**Independent Test**: On web, press and hold the reference-pitch control, move the pointer outside the
sheet, release, and confirm the sheet is still open with the adjusted value intact. On mobile, tap the
dimmed area and confirm the sheet closes.

**Acceptance Scenarios**:

1. **Given** the settings sheet is open on web, **When** the user presses inside the sheet and releases
   outside it, **Then** the sheet stays open.
2. **Given** the settings sheet is open on mobile, **When** the user presses the dimmed backdrop, **Then**
   the sheet closes.
3. **Given** the settings sheet is open on either platform, **When** the user presses the backdrop with a
   press that both begins and ends on the backdrop, **Then** the sheet closes.
4. **Given** the settings sheet is open, **When** the user activates "Done" or presses Escape, **Then** the
   sheet closes — the existing dismissal routes are unchanged (FR-020, SC-013).
5. **Given** the user adjusted the reference pitch during a drag that ended outside the sheet, **When** the
   sheet remains open, **Then** the adjusted value is retained, not reverted.

---

### User Story 4 - The reference-pitch control looks like a control (Priority: P4)

The "A4 440 Hz" indicator on the tuner screen is the only way into settings, but at its default value it is
rendered as a dimmed, borderless label. Users do not know it can be pressed, so the two settings the
product has are effectively undiscoverable until someone tries tapping the text.

**Why this priority**: It gates discovery of an entire feature area, but costs the user nothing when they
do not find it — the defaults are right for almost everyone. Below the items that misinform or misbehave.

**Independent Test**: Show the default tuner screen to someone who has not seen it and ask them to change
the reference pitch. They should identify the control without being told it is pressable.

**Acceptance Scenarios**:

1. **Given** the reference pitch is the standard 440 Hz, **When** the user views the tuner screen, **Then**
   the reference-pitch indicator is visually identifiable as an interactive control.
2. **Given** the reference pitch is non-standard, **When** the user views the tuner screen, **Then** it
   remains more prominent than the standard state — the existing "never a silent surprise" emphasis
   (FR-022) is not flattened by giving the standard state an affordance.
3. **Given** either state, **When** the screen is viewed in greyscale, **Then** the control is still
   identifiable as a control (FR-015's colour-independence rule).
4. **Given** either state, **When** the contrast of the control's text and border is measured, **Then** it
   meets the AA floor the project already enforces (SC-013).

---

### User Story 5 - The settings sheet appears without the backdrop sliding (Priority: P5)

On mobile, opening settings animates the dimming layer upward from the bottom of the screen together with
the sheet, so the darkening sweeps across the display. The web version dims immediately and slides only the
sheet. The mobile version looks broken by comparison.

**Why this priority**: Purely cosmetic, affects no task outcome, and the only item a user would describe as
looking odd rather than going wrong. Genuinely last.

**Independent Test**: Open settings on mobile and confirm the dim appears at full extent immediately while
only the sheet slides, matching web.

**Acceptance Scenarios**:

1. **Given** the tuner screen on mobile, **When** the user opens settings, **Then** the dimming layer
   reaches its full extent immediately rather than sweeping up from the bottom edge.
2. **Given** settings is opening on mobile, **When** the animation plays, **Then** the sheet itself still
   slides up from the bottom.
3. **Given** the user has reduced-motion enabled at the operating-system level, **When** settings opens,
   **Then** motion is reduced or removed in line with the project's existing motion handling.

---

### Edge Cases

- **The user stops the microphone while the settings sheet is open.** Settings remain adjustable; the
  reference pitch simply has no live reading to act on until listening resumes.
- **The user stops the microphone, then backgrounds the app and returns.** The stop is an explicit decision
  and must survive the lifecycle handling that would otherwise resume listening (FR-033).
- **Permission is denied and the user activates start.** The existing denied-state recovery guidance
  applies; the control must not present as though starting succeeded.
- **The microphone is lost mid-session** (device unplugged, another app seizes it). The control must
  reflect that the tuner is no longer listening rather than continuing to offer "stop".
- **Silence at startup.** The marker's resting position on first launch and after a stale reset must be the
  same, so a reset is never mistaken for a reading of zero cents.
- **A note sustained around the stale threshold.** Repeated reset/re-acquire flicker must not occur; the
  boundary needs the same anti-flicker treatment the note-name boundary already has (FR-011).
- **A backdrop press that begins on the backdrop and ends inside the sheet.** Treated as not a dismissal,
  by the same rule that fixes the web drag case.
- **Keyboard and screen-reader users.** The start/stop control must announce its current state, and state
  changes must be announced without flooding assistive technology at reading frequency.

## Requirements *(mandatory)*

### Functional Requirements

**Microphone control (US1)**

- **FR-036**: The tuner MUST present a persistent control for microphone capture, visible in both the
  listening and the stopped state, rather than a one-shot control that disappears once used.
- **FR-037**: Users MUST be able to stop microphone capture at any time while listening, and the system
  MUST release the microphone so the operating-system recording indicator clears.
- **FR-038**: Users MUST be able to resume microphone capture after stopping it, without reloading the page
  or restarting the app.
- **FR-039**: The control's label MUST state what activating it will do, and the screen MUST make the
  current capture state unambiguous — distinguishable from listening-but-hearing-nothing.
- **FR-040**: A user-initiated stop MUST persist across backgrounding and returning; lifecycle handling
  MUST NOT silently resume capture the user switched off.
- **FR-041**: The first-run explainer and permission flow MUST be preserved when starting capture for the
  first time.
- **FR-042**: The control MUST expose its current state to assistive technology, and state changes MUST be
  announced without announcing at reading frequency.

**Stale readings (US2)**

- **FR-043**: When no pitch has been detected for a bounded period, the tuning indicator MUST return to its
  resting position and the readout MUST stop asserting a note.
- **FR-044**: The resting position after a stale reset MUST be identical to the resting position at
  startup, so a reset is never readable as a measurement.
- **FR-045**: Continuously sounding notes MUST NOT trigger a reset regardless of duration.
- **FR-046**: Brief dropouts shorter than the stale threshold MUST NOT cause a visible reset, and the reset
  boundary MUST NOT produce repeated reset/re-acquire flicker.
- **FR-047**: Re-acquisition after a reset MUST NOT be slower than normal first detection (FR-027).

**Sheet dismissal (US3)**

- **FR-048**: The settings sheet MUST close only when a backdrop press both begins and ends on the
  backdrop; a press originating inside the sheet MUST NOT dismiss it wherever it is released.
- **FR-049**: The settings sheet MUST close when the backdrop is pressed on mobile, matching web.
- **FR-050**: Existing dismissal routes — the "Done" control and Escape — MUST continue to work unchanged.
- **FR-051**: Values adjusted during an interaction that ends outside the sheet MUST be retained.

**Reference-pitch affordance (US4)**

- **FR-052**: The reference-pitch indicator MUST be visually identifiable as an interactive control in its
  default, standard-pitch state.
- **FR-053**: The non-standard state MUST remain visually more prominent than the standard state, so
  FR-022's emphasis on a non-standard reference is not lost.
- **FR-054**: The control's interactive appearance MUST NOT depend on colour alone and MUST meet the
  project's existing contrast floor in both light and dark appearance.

**Sheet presentation (US5)**

- **FR-055**: The dimming layer behind the settings sheet MUST reach full extent without animating in from
  a screen edge, on both platforms.
- **FR-056**: The sheet itself MUST continue to slide in from the bottom edge on mobile.
- **FR-057**: Reduced-motion preferences MUST continue to be honoured.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-016**: A user can stop and restart microphone capture in a single action each, from the main tuner
  screen, without leaving it.
- **SC-017**: After stopping, the operating-system recording indicator clears within one second, and no
  audio is captured until the user restarts.
- **SC-018**: After a note stops sounding, the tuning indicator returns to rest within 1 second, and never
  displays a position derived from audio older than that.
- **SC-019**: Zero unintended sheet dismissals across a test that presses inside the sheet and releases
  outside it, on every supported pointer input.
- **SC-020**: Users unfamiliar with the app identify the reference-pitch control as pressable without
  prompting.
- **SC-021**: All existing release gates continue to pass unchanged: ±1 cent accuracy across E1–E6, the
  60 fps frame budget, zero steady-state allocation in the audio path, and the AA accessibility floor.
- **SC-022**: No regression in cold-start time to first reading (FR-026's two-second budget).

## Assumptions

Judgement calls made where the description did not specify. Each is cheap to change if wrong.

- ~~**The stale threshold is 2 seconds of no detected pitch.**~~ **Corrected during `/speckit-plan`.** The
  reading filter already releases after **400 ms** without a confident candidate (`DEFAULT_HOLD_MS` in
  `packages/core/src/tuning/filters.ts`), and the marker must come to rest at exactly that moment rather
  than on a second, longer timer. Two thresholds would put the marker and the readout in disagreement for
  1.6 seconds — which is the same class of defect this story exists to fix. No new constant.
- ~~**A stale reset clears the whole reading, not just the marker.**~~ **Corrected during
  `/speckit-plan`: this already happens.** When the filter releases, the analyzer returns no reading, the
  session publishes `listening`, and the note name and cents readout clear on their own. The marker is the
  only element that goes stale, because the continuous channel has no "no reading" event to send it. The
  original description was precise and this assumption was over-reach.
- **Stopping the microphone keeps the tuner screen visible** in a visibly inactive state, rather than
  returning to the first-run explainer. The explainer exists to precede a permission prompt that will not
  reappear.
- **The stop state is not persisted across app launches.** Every launch starts in the pre-existing
  behaviour; the control governs the current session only.
- **The reference-pitch control gets a visible border in its standard state**, matching the "tertiary
  button" treatment the description suggests, with the non-standard state keeping its stronger colour and
  weight.
- **No new settings, screens, or user-facing options** beyond the start/stop control.

## Dependencies

- Builds on the shipped `001-chromatic-guitar-tuner`; all its functional requirements and success criteria
  remain in force.
- The session lifecycle already exposes idempotent start and stop, and the microphone port contract already
  requires that stopping releases the operating-system handle — US1 depends on both, and on the contract
  test suite being extended rather than bypassed.
- US5 depends on the mobile platform's sheet presentation being separable into backdrop and sheet layers.

## Out of Scope

- Any change to pitch detection, the filter chain, or the accuracy budget.
- Persisting microphone state across launches.
- A settings route or navigation; settings remains a sheet over the tuner.
- Everything on the `001-chromatic-guitar-tuner` out-of-scope list, which remains binding: tuning presets,
  string targets, custom tunings, reference tones, accounts, sync.
