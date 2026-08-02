# Feature Specification: Chromatic Guitar Tuner

**Feature Branch**: `main` (no feature branch created — git branch hook not configured)

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "I want to create a web and mobile app callled ChromaticTuner. As the naming suggests, it is supposed to be a chromatic guitar tuner, where user could pluck a string and the tuner's UI would show on a horizontal line where on the scale the currently being played note is on, with left side being flattening and right - sharpening. Users would then be able to tune their guitars to any tuning they wanted. The application should have simple, but popping and memorable design where colors would help represent the tuning state."

**Clarifications applied (2026-08-02)**:

1. Scope is a *pure* chromatic tuner. There are no tuning presets, no string targets, no per-string
   guidance, and no saved tunings. The app always reports the nearest note to whatever is played. The player
   knows what note they are aiming for; the app tells them where they are and which way to turn the peg.
   Alternate tunings are reached by the player deliberately flattening or sharpening a string until the app
   shows the note they want.
2. Fully offline. No accounts, no sign-up, no server, no cross-device sync, no collection of user data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tune a string to its note on the horizontal line (Priority: P1)

A guitarist opens the app and plucks a string. The app names the note it hears (for example "E") and places a
marker on a single horizontal line: dead centre means the string is exactly at that note, left of centre means
it is flat, right of centre means it is sharp. The further from centre the marker sits, the further off the
string is. The display colour changes with the state — one colour while off-pitch, a distinctly different
colour the moment the string lands in tune — so the player sees the result from arm's length without reading
anything. They turn the peg, watch the marker slide toward centre, and stop when it locks in.

**Why this priority**: This is the entire product. Nothing else in the app is worth building if this is not
excellent.

**Independent Test**: Play known reference tones (and real strings) into the microphone and confirm the app
names the correct note, places the marker on the correct side of centre, moves the marker continuously as the
pitch is bent up and down, and switches to the in-tune state within tolerance. Requires no settings, no
selection, and no account.

**Acceptance Scenarios**:

1. **Given** the app is open with microphone access granted and no sound playing, **When** the user plucks a
   string tuned to a true E, **Then** the app displays the note name "E" and places the marker at the centre of
   the line, showing the in-tune state.
2. **Given** a string is sounding 20 cents flat of E, **When** the user looks at the display, **Then** the
   marker sits left of centre at a position proportional to 20 cents, the numeric deviation reads
   approximately "-20", and the app indicates the string must be tightened.
3. **Given** a string is sounding 20 cents sharp of E, **When** the user looks at the display, **Then** the
   marker sits right of centre, the deviation reads approximately "+20", and the app indicates the string must
   be loosened.
4. **Given** a string is sounding and the user slowly turns the peg upward, **When** the pitch rises through
   the target note, **Then** the marker travels smoothly from left to right through centre without jumping or
   freezing, and the state changes as it crosses into and out of tolerance.
5. **Given** no sound is present, **When** the user looks at the display, **Then** the app shows a clear
   "listening" state rather than a stale reading or a misleading marker position.
6. **Given** a moderately noisy room (background conversation, air conditioning), **When** a string is plucked
   at normal volume, **Then** the app still identifies the note correctly.

---

### User Story 2 - Retune a string to a different note (Priority: P2)

The player wants Drop D. They pluck the low E string and start loosening it. As the pitch falls, the app tracks
it continuously: the marker slides right-to-left, and when the string passes the midpoint between E and Eb the
displayed note name flips to Eb with the marker jumping to the opposite edge of the line. The player keeps
loosening through Eb until the name reads D and the marker settles at centre. At no point does the player have
to tell the app what they are doing — the app simply always reports the nearest note.

**Why this priority**: This is how "tune to any tuning you want" is actually delivered, and it is the journey
that stresses semitone-boundary behaviour hardest. It shares the P1 mechanism, so it is testable the moment P1
exists, but it deserves its own acceptance coverage because sloppy boundary handling makes the app feel broken
precisely when the player is using it most deliberately.

**Independent Test**: Sweep a generated tone slowly downward from E2 through Eb2 to D2 and confirm the note
name changes exactly at the midpoints, the marker sweeps fully across the line between changes, no flicker
occurs at the boundary, and the reading is correct at every stop along the way.

**Acceptance Scenarios**:

1. **Given** a string sounding at a true E, **When** the player loosens it steadily toward D, **Then** the
   displayed note name changes from E to Eb at the midpoint between them, and from Eb to D at the next
   midpoint, with the marker sweeping the full width of the line between each change.
2. **Given** a string sounding almost exactly midway between two notes, **When** the pitch wavers slightly
   around that midpoint, **Then** the displayed note name does not flicker rapidly between the two.
3. **Given** the player has loosened the string to a true D, **When** they stop, **Then** the app shows "D" at
   centre in the in-tune state, with no configuration having been required.
4. **Given** a string is being retuned across more than one semitone, **When** the player watches the display,
   **Then** the direction they must continue turning is unambiguous at every point in the sweep.

---

### User Story 3 - Start tuning within seconds, anywhere, offline (Priority: P3)

A player opens the app mid-rehearsal on a phone, or in a browser tab on a laptop. From cold start they reach a
live, listening tuner in about a second with at most one tap. The first time, the app explains plainly why it
needs the microphone before the system prompt appears, and states that audio never leaves the device. If
permission is refused or no microphone exists, the app says exactly what happened and how to fix it instead of
appearing broken. Everything works with no network connection, and the screen does not sleep while tuning.

**Why this priority**: This is the difference between an app a musician keeps on their home screen and one they
delete. It is a quality bar rather than a new capability, so it follows the functional stories, but it must be
met before release.

**Independent Test**: Cold-start on a phone and a desktop browser with the network disabled, and time the path
from launch to a live reading. Separately, deny microphone permission and confirm the recovery messaging is
clear and actionable.

**Acceptance Scenarios**:

1. **Given** the app has been used before and permission is granted, **When** the user launches it, **Then** a
   live listening tuner is on screen in under two seconds with no additional taps.
2. **Given** the app has never been used, **When** the user launches it, **Then** it explains why the
   microphone is needed, and that audio is never recorded or transmitted, before triggering the system prompt.
3. **Given** microphone permission is denied, **When** the user opens the app, **Then** it shows a plain
   explanation and the specific steps to grant access on that platform, and recovers automatically once
   permission is granted without requiring a restart.
4. **Given** no network connection is available, **When** the user launches the app, **Then** every function
   works normally.
5. **Given** the tuner is running and untouched, **When** the device's screen-sleep timeout would normally
   elapse, **Then** the screen stays awake while the tuner is active, and normal behaviour returns when it is
   not.
6. **Given** the tuner is running, **When** the user backgrounds the app or switches browser tabs and returns,
   **Then** the tuner resumes listening promptly and does not hold the microphone while in the background.

---

### User Story 4 - Match an ensemble at a non-standard reference pitch (Priority: P4)

A player is joining an ensemble tuned to A=432 Hz rather than the usual 440. They open settings, change the
reference pitch, and the whole tuner shifts accordingly. The tuner screen shows that a non-standard reference
is active so they are never confused by it later. They can also choose whether accidentals read as sharps or
flats, to match how they think about the notes.

**Why this priority**: A small, self-contained capability that matters enormously to the minority who need it
and is invisible to everyone else. Required by the project constitution.

**Independent Test**: Set the reference pitch to each end of the supported range and confirm that a tone which
reads in tune at 440 Hz reads correspondingly sharp or flat, and that the tuner screen shows the non-standard
reference. Separately, toggle the accidental preference and confirm every note display follows it.

**Acceptance Scenarios**:

1. **Given** the reference pitch is the default 440 Hz, **When** the user changes it to 432 Hz, **Then** all
   readings shift accordingly and the tuner screen visibly indicates the non-standard reference.
2. **Given** a non-standard reference pitch is active, **When** the user reopens the app later, **Then** the
   setting is still in effect and still visibly indicated.
3. **Given** the accidental preference is set to flats, **When** a pitch between two natural notes is played,
   **Then** it is displayed as "Eb" rather than "D#", everywhere a note appears.
4. **Given** any settings have been changed, **When** the user chooses to reset them, **Then** the app returns
   to 440 Hz and its default naming without affecting anything else.

---

### Edge Cases

- **Silence and decay**: A plucked string fades. The reading MUST hold its last confident value briefly, then
  return to the listening state rather than drifting into nonsense as the signal dies.
- **Octave and harmonic confusion**: Guitar strings are harmonically rich, and the low E in particular has a
  weak fundamental. The app MUST NOT report a harmonic (B instead of E) as the played note.
- **Ambiguous midpoint**: A string sitting almost exactly between two semitones MUST NOT flicker rapidly
  between two note names — the central case for User Story 2.
- **Multiple strings ringing at once**: A strummed chord or a sympathetically ringing neighbour string MUST NOT
  produce a confident but wrong reading; the app must indicate it cannot get a clear reading.
- **No microphone / permission denied / permission revoked mid-session**: Each state needs its own clear
  message and automatic recovery when resolved.
- **Microphone in use by another app** (a call, a recording, another browser tab).
- **Bluetooth or wireless microphones**: added input latency may exceed the responsiveness budget; the app must
  still function and must not appear frozen.
- **Extreme input levels**: a string plucked very hard (clipping) or very softly (near the noise floor).
- **Very low or very high notes**: a heavily detuned low string, or a note played high on the neck.
- **Interruption**: an incoming call, alarm, or another app taking audio focus mid-tune.
- **Device rotation and small screens**: the horizontal line must remain legible and centred on a narrow phone
  in portrait and on a wide desktop window.
- **Continuous use**: 30 minutes of uninterrupted tuning must not overheat the device or drain the battery
  abnormally.

## Requirements *(mandatory)*

### Functional Requirements

**Pitch detection and readout**

- **FR-001**: System MUST capture live audio from the device's microphone and continuously determine the pitch
  of the sound it hears, without the user pressing a record or start button.
- **FR-002**: System MUST identify the nearest note by name for any detected pitch across the range A0 to C8,
  with the guitar range (E1 to E6) as the primary design target.
- **FR-003**: System MUST display the octave alongside the note name, so a player can tell E2 from E3.
- **FR-004**: System MUST report how far the detected pitch is from the nearest note in cents, and MUST display
  this deviation numerically with an explicit sign (for example "-12", "+7", "0").
- **FR-005**: System MUST render deviation as a marker on a single horizontal line where the exact note sits at
  the centre, flat is to the left, and sharp is to the right, with marker distance proportional to the
  deviation.
- **FR-006**: The horizontal line MUST span ±50 cents, so that any pitch is representable on it and the marker
  sweeps the full width between one note and the next.
- **FR-007**: System MUST indicate unambiguously which direction the player should turn the peg — tightening
  when flat, loosening when sharp — in a form that does not depend on the player already knowing that left
  means flat.
- **FR-008**: System MUST treat a string as in tune when its deviation is within ±5 cents, and MUST make that
  threshold visible on the line as a marked centre zone.
- **FR-009**: System MUST detect pitch to within ±1 cent of the true frequency for steady tones across the
  guaranteed range E1 to E6 — every note a guitar can produce. Outside that band, up to the full A0–C8
  detection range, accuracy is best-effort and the system MUST return no reading rather than a confident
  wrong one.
- **FR-010**: The displayed reading MUST remain visually stable on a held, steady note, without oscillating
  more than ±2 cents.
- **FR-011**: System MUST change the displayed note name at the midpoint between two adjacent notes, and MUST
  NOT flicker between names when the pitch hovers at that midpoint.
- **FR-012**: System MUST distinguish a genuine instrument note from silence, background noise, or an
  unresolvable signal, and MUST show an explicit "listening" state rather than a stale or invented reading in
  those cases.
- **FR-013**: System MUST require no mode, tuning, or instrument selection of any kind in order to tune —
  reporting the nearest note is what makes every tuning reachable.

**Visual design and tuning-state feedback**

- **FR-014**: System MUST communicate tuning state through colour as the primary at-a-glance signal, with
  visually distinct states for flat, sharp, and in tune.
- **FR-015**: System MUST also communicate tuning state through at least two non-colour channels — marker
  position on the line and the text/numeric readout — so the state is never conveyed by colour alone.
- **FR-016**: Marker movement and colour transitions MUST read as continuous motion rather than stepping, and
  MUST respect the platform's reduced-motion setting.
- **FR-017**: The note name and tuning state MUST be legible from approximately one metre away on a phone
  standing on a music stand or held at arm's length.
- **FR-018**: The tuner MUST require no interaction to read: the entire primary display MUST be visible without
  scrolling, tapping, or expanding, on the smallest supported screen.
- **FR-019**: System MUST support both light and dark appearance and MUST follow the platform preference by
  default.
- **FR-020**: All text and meaningful graphics MUST meet WCAG 2.1 AA contrast, and all interactive controls
  MUST be labelled for assistive technology and be at least 44x44 in touch-target size.
- **FR-021**: The horizontal line MUST be the dominant element of the main screen on every platform and at
  every supported window size — not one widget among several.

**Settings**

- **FR-022**: System MUST let users set the reference pitch for A4 across at least 415–466 Hz, MUST default to
  440 Hz, and MUST make a non-default reference pitch visibly obvious on the tuner screen so it is never a
  silent surprise.
- **FR-023**: System MUST let users choose whether accidentals display as sharps or flats, and MUST apply that
  choice consistently everywhere a note is shown.
- **FR-024**: System MUST remember these two settings on the device between sessions, and MUST offer a reset to
  defaults.

**Platform, permissions, and availability**

- **FR-025**: System MUST run on modern desktop and mobile web browsers and on phones, presenting the same
  capabilities and the same visual language on every platform.
- **FR-026**: System MUST reach a live, listening tuner within 2 seconds of a cold start on a mid-range device.
- **FR-027**: System MUST update the on-screen reading within 100 ms of a change in the played pitch, so the
  display tracks the tuning peg in real time.
- **FR-028**: System MUST explain why microphone access is needed before requesting it, and MUST provide clear,
  platform-specific recovery instructions when access is denied, revoked, or unavailable.
- **FR-029**: System MUST recover automatically when microphone access is granted or the microphone becomes
  available again, without requiring the user to restart the app.
- **FR-030**: System MUST perform all audio analysis on the device and MUST function fully with no network
  connection at any point, including first launch after installation.
- **FR-031**: System MUST NOT record, store, or transmit captured audio anywhere, and MUST state this plainly
  where the user is asked for the microphone.
- **FR-032**: System MUST NOT require an account, a sign-in, or any personal information, and MUST NOT collect
  or transmit user data.
- **FR-033**: System MUST release the microphone when the tuner is not in the foreground and MUST resume
  promptly on return.
- **FR-034**: System MUST keep the screen awake while the tuner is actively listening and MUST restore normal
  screen behaviour otherwise.
- **FR-035**: System MUST behave predictably when audio focus is lost to a call, alarm, or another app, and
  MUST resume listening when focus returns.

### Key Entities

- **Note**: A named pitch — letter, accidental, and octave — whose frequency derives from the current reference
  pitch. The vocabulary the whole app speaks in.
- **Pitch Reading**: A single live measurement — the detected frequency, the nearest note, the deviation in
  cents, a confidence indication, and whether a usable signal is present at all. This is what the display
  renders, and what the "listening" state replaces when no signal is usable.
- **Tuning State**: The classification the entire UI keys off — flat, sharp, in tune, or no reading — and the
  single source of the colours, wording, and direction cue used to express it.
- **Preferences**: Reference pitch for A4 and sharp/flat naming. Stored on the device, nowhere else.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning user can go from launching the app to a live, correct reading of a plucked string in
  under 3 seconds, with no more than one interaction.
- **SC-002**: The displayed reading reacts to a change in the played pitch within 100 ms at the 95th
  percentile, so turning a peg moves the marker with no perceptible lag.
- **SC-003**: The tuner identifies the correct note and octave for a plucked guitar string on 99% of attempts
  across the full range of a 6-string guitar, in a room with ordinary background noise.
- **SC-004**: Detected pitch is accurate to within ±1 cent of the true value for steady tones across E1 to E6.
  Outside that band the app never reports a confident wrong note.
- **SC-005**: The displayed cents value does not vary by more than ±2 cents while a steady tone is held.
- **SC-006**: A first-time user with no instructions can bring a single string into tune on their first attempt
  without consulting help, in 90% of usability trials.
- **SC-007**: A user can tune all six strings of a guitar that starts up to a semitone out, in under 90
  seconds.
- **SC-008**: A user can retune a string a full tone down (E to D) in one continuous motion without ever being
  unsure which direction to keep turning, in 95% of trials.
- **SC-009**: The tuning state — flat, sharp, or in tune — is correctly identified by observers from one metre
  away within one second, in 95% of trials, including by observers with colour vision deficiency and on a
  greyscale display.
- **SC-010**: The tuner display sustains smooth, unbroken motion during continuous tuning on the lowest
  supported device, with no visible stutter.
- **SC-011**: Every function works with the device in airplane mode, including on first launch.
- **SC-012**: 30 minutes of continuous tuning does not cause device overheating or abnormal battery drain.
- **SC-013**: 100% of the app's screens meet WCAG 2.1 AA contrast and are fully operable by keyboard on desktop
  and by screen reader on mobile.
- **SC-014**: Every failure state a user can reach — permission denied, no microphone, microphone busy, no
  clear signal — presents an explanation and a next step, with zero dead ends.
- **SC-015**: The app transmits zero bytes of user data: a network capture during a full tuning session shows
  no outbound traffic carrying audio, usage, or analytics data.

## Assumptions

- **The player supplies the intent**: The app never needs to know what tuning the player is aiming for. It
  reports the nearest note and the direction to turn; the player decides when they have arrived. This is what
  makes every tuning reachable with no configuration, and it is the central design decision of the product.
- **Instrument focus**: The product is aimed at guitarists, and the visual design and defaults are tuned for a
  6-string guitar. Because detection is purely chromatic across A0–C8, it will work for bass, ukulele, and
  other stringed instruments without any instrument-specific feature.
- **No accounts, no data**: No sign-up, no login, no personal data, no analytics, no server. The only stored
  state is two local preferences, held on the device.
- **Privacy**: Audio is analysed on the device and never leaves it. This is a hard product promise, not an
  implementation preference.
- **Acoustic input**: Tuning is done through the device's built-in microphone with the instrument played
  acoustically nearby. Direct-input electric guitars via an audio interface may work but are not a design
  target for the first release.
- **One note at a time**: The player plucks a single string. Polyphonic tuning is out of scope; the app only
  needs to recognise that it cannot give a clear reading.
- **Equal temperament**: All note frequencies use 12-tone equal temperament. Alternative temperaments, stretch
  tuning, and intonation offsets are out of scope.
- **Device baseline**: Users have a device from roughly the last five years with a working microphone, and a
  modern browser on desktop.

### Explicitly out of scope

Removed by clarification or by the constitution's YAGNI rule; recorded here so they are not silently
reintroduced during planning:

- Tuning presets and a tuning library (Standard, Drop D, DADGAD, and so on)
- Per-string targets, automatic string detection, and per-string completion tracking
- User-created, saved, named, or shared custom tunings
- Reference-tone playback
- User accounts, sign-in, and cross-device sync
- Capo and transposition support
- Metronome, chord library, and other practice tools
- Multi-user profiles on one device
