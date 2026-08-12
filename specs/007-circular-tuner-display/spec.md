# Feature Specification: Circular Tuner Display

**Feature Branch**: `007-circular-tuner-display`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Currently the app has a horizontal tuner showing the user whether the played note is in tune, flat or sharp. I want user to be able to pick between horizontal tuner and circle tuner, which is new implementation. The circle would be segmented into same width segments and would display all the notes of the scale starting from C at the top. A line starting from the center of the circle would then point in the direction of the played note with the center of the note's segment being in tune with that played note. The circle would basically act as a speedometer, except it would be a full circle and "speeding up" is sharpening the note and "slowing down" is flattening the note. Applies to both web and mobile app."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tune against a circular dial (Priority: P1)

A player who reads a dial faster than a ruler opens Settings, picks the circular display, and closes the sheet. The horizontal line is replaced by a circle divided into twelve equal segments, one per note of the chromatic scale, labelled clockwise from C at the top. A needle runs from the centre of the circle outward. When the player plucks a string, the needle swings to the segment of the note being heard, and comes to rest on the exact centre of that segment when the string is in tune. A string that is sharp pushes the needle past the segment's centre in the clockwise direction; a flat string leaves it short, counter-clockwise of centre. Everything above and below the circle — the large note name, the cents number, the tighten/loosen cue — is unchanged.

**Why this priority**: This is the feature. Without it there is nothing to choose between, and it is the only slice that delivers user-visible value on its own.

**Independent Test**: Select the circular display, feed the tuner a tone at a known offset from a known note, and confirm the needle sits at the angle that offset predicts, on the right segment, with in-tune reached at the segment's exact centre.

**Acceptance Scenarios**:

1. **Given** the circular display is selected and nothing is playing, **When** a tone at exactly A4's reference frequency is sounded, **Then** the needle points at the centre of the A segment and the display shows the in-tune state.
2. **Given** the circular display is selected, **When** a tone 25 cents sharp of D3 is sounded, **Then** the needle sits a quarter of a segment clockwise of the D segment's centre, and still inside the D segment.
3. **Given** the circular display is selected, **When** a tone 25 cents flat of D3 is sounded, **Then** the needle sits a quarter of a segment counter-clockwise of the D segment's centre.
4. **Given** the circular display is selected, **When** the played pitch rises continuously from a flat B to a sharp C, **Then** the needle sweeps continuously across the boundary between the B and C segments without jumping or travelling the long way around the circle.
5. **Given** a note is being read, **When** the string is damped and no pitch can be detected, **Then** the needle stays at the angle it last held and visibly fades, rather than snapping to a note the tuner is no longer hearing.
6. **Given** the circular display is selected and the accidental preference is set to flats, **When** the circle is read, **Then** the five accidental segments are labelled with flat names and the seven natural segments are unchanged.

---

### User Story 2 - Pick the display, and keep the one you had (Priority: P2)

A player who has never opened Settings sees exactly the tuner they saw yesterday: the horizontal line. A player who wants the dial finds the choice in Settings beside the reference pitch, accidentals and appearance settings, chooses it once, and finds the same dial the next time the app is opened — on the same device, whether that is the browser or the phone. Resetting to defaults returns them to the horizontal line along with every other setting.

**Why this priority**: The choice is what the user asked for, but the circle has to exist before it can be chosen. It also carries the promise that nobody's tuner changes underneath them.

**Independent Test**: Change the setting, close and reopen the app, and confirm the chosen display is the one that appears; press Reset to defaults and confirm the horizontal line returns.

**Acceptance Scenarios**:

1. **Given** a player who has never chosen a display, **When** the tuner is opened, **Then** the horizontal line is shown.
2. **Given** the circular display has been chosen, **When** the app is closed and reopened, **Then** the circular display is shown without any further interaction.
3. **Given** the circular display has been chosen, **When** Reset to defaults is pressed, **Then** the horizontal line is shown again.
4. **Given** a string is ringing and the tuner is reading it, **When** the display is switched from one style to the other, **Then** the microphone keeps listening, the reading continues uninterrupted, and no permission prompt appears.
5. **Given** the setting cannot be saved to the device, **When** the display is switched, **Then** the new display applies immediately and the existing "could not be saved" warning appears.

---

### User Story 3 - The same dial on the phone (Priority: P2)

A player who chose the dial on the web finds the phone app offers the same choice, in the same place, worded the same way, and drawn the same way — the same twelve segments, the same C at the top, the same clockwise-is-sharp direction, the same in-tune treatment.

**Why this priority**: The constitution requires one visual language for in-tune/flat/sharp and one interaction pattern for settings. A dial that differs between platforms is a defect, not a variation.

**Independent Test**: Put the two apps side by side on the same reference tone with the same reference pitch and accidental preference, and confirm the two circles carry the same labels in the same positions with the needle at the same angle.

**Acceptance Scenarios**:

1. **Given** the phone app, **When** Settings is opened, **Then** the display choice appears with the same label and the same option names as on the web.
2. **Given** both apps are reading the same steady tone with the same preferences, **When** the two circles are compared, **Then** the segment labels, their order, and the needle's angle match.

---

### Edge Cases

- **Nothing has been played yet in this session.** There is no last angle to hold, so no needle is drawn at all until the first reading arrives. Once a reading has arrived, the fade-and-hold behaviour of US1 scenario 5 applies for the rest of the session.
- **The needle crosses the top of the circle.** Moving between B and C must take the short way across the twelve-o'clock boundary. A needle that unwinds 330° to travel 30° is a defect.
- **The player has asked the platform for reduced motion.** The needle must move without an animated transition, exactly as the horizontal marker already does.
- **The player has asked the platform for larger text.** The twelve segment labels must remain legible and must not overlap each other or the needle.
- **A small or short screen, or a phone in landscape.** The circle must fit within the display area without clipping and without pushing the note name, cents readout, direction cue, or microphone control off-screen.
- **The microphone is denied, unavailable, or still starting.** The circle is subject to the same status handling as the horizontal line: the existing status banner owns the message, and the display must not present a needle position as a reading during any of those states.
- **A screen-reader user.** The circle is a second visual rendering of information that is already spoken. It must not add a second spoken channel or announce the needle's movement.
- **A record saved by an older version of the app, or a hand-edited one naming a display that does not exist.** It resolves to the horizontal line, and every other preference in that record survives intact.

## Requirements *(mandatory)*

### Functional Requirements

**The choice**

- **FR-146**: Users MUST be able to choose between the existing horizontal tuning display and a circular tuning display.
- **FR-147**: The choice MUST be presented in Settings, alongside the reference pitch, accidental and appearance settings, using the same selection pattern and the same plain, mechanism-free wording as those settings.
- **FR-148**: The choice MUST be offered, worded, and behave identically on web and mobile.
- **FR-149**: The horizontal display MUST be the default for anyone who has not chosen, including every user who upgrades from a version that had no choice.
- **FR-150**: The chosen display MUST persist on the device across sessions, and MUST be restored by "Reset to defaults" to the horizontal display along with the other preferences.
- **FR-151**: A stored preference that names no display, or an unrecognised one, MUST resolve to the horizontal display without discarding any other stored preference.
- **FR-152**: Switching the display MUST take effect immediately, MUST NOT interrupt or restart audio capture, and MUST NOT re-prompt for microphone permission.
- **FR-153**: When the choice cannot be saved, the display MUST still change and the app MUST surface the existing not-saved warning rather than failing silently.

**The circle**

- **FR-154**: The circular display MUST divide a full circle into twelve segments of equal angular width, one for each note of the chromatic scale.
- **FR-155**: The segments MUST be labelled with the note names in ascending pitch order, beginning with C centred at the top of the circle and proceeding clockwise.
- **FR-156**: Segment labels MUST follow the user's accidental preference, so choosing flats renames the five accidental segments and leaves the seven naturals unchanged.
- **FR-157**: A needle MUST extend from the centre of the circle outward, pointing at the pitch currently being heard.
- **FR-158**: The needle MUST point at the exact centre of a segment when the pitch heard is exactly that note, clockwise of centre when the pitch is sharp, and counter-clockwise of centre when it is flat, by an angle proportional to the deviation.
- **FR-159**: The needle MUST move continuously with the pitch, including across segment boundaries, and MUST always take the shorter way around the circle between two angles.
- **FR-160**: The circular display MUST indicate the in-tune state using the same tolerance, the same colours, and the same vocabulary as the horizontal display, so the two are one visual language.
- **FR-161**: The circular display MUST mark the in-tune target visibly, as the horizontal display's in-tune zone does, so the player can see where the needle is aiming before it gets there.
- **FR-162**: When a reading lapses, the needle MUST hold its last angle and visibly fade rather than move to a rest position that names a note.
- **FR-163**: Before the first reading of a session, no needle MUST be drawn.
- **FR-164**: The circular display MUST NOT introduce a spoken or otherwise announced channel of its own; the existing announcement of note, octave and status remains the single source for assistive technology.
- **FR-165**: The circular display MUST honour the platform's reduced-motion preference by removing needle transition animation, not merely shortening it.
- **FR-166**: The circular display MUST render correctly in both light and dark appearance, and MUST introduce no colour that the app does not already use.
- **FR-167**: The needle, the segment divisions, and the in-tune marking MUST meet the 3:1 contrast floor for meaningful graphics as composited on screen, and the segment labels MUST meet the 4.5:1 floor for text.
- **FR-168**: The large note name, the cents readout, and the direction cue MUST remain present and unchanged when the circular display is selected.

### Key Entities

- **Tuner display preference**: Which of the two tuning displays the user has chosen — the horizontal line or the circle. One value per device, stored with the reference pitch, accidental style and appearance preference in the same record, defaulting to the horizontal line.
- **Segment**: One of twelve equal angular slices of the circle, each standing for one note of the chromatic scale, with a label, an angular centre that means "in tune", and a boundary halfway to each neighbour.
- **Needle angle**: The direction the needle points, derived from the note being heard and how far the pitch sits from it. Not a stored value — it is a rendering of the live reading.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-063**: A player can switch between the two displays in under 10 seconds without leaving the tuner screen or stopping the microphone.
- **SC-064**: With the circular display selected and a steady tone playing, a player standing 1 metre from the screen can tell whether the string is sharp or flat without interacting with the app.
- **SC-065**: On a steady in-tune tone, the needle rests on the segment centre and does not visibly oscillate — the same ±2 cent stability the readout is already held to.
- **SC-066**: The needle's angle matches the played deviation within 1 degree across every note of the guaranteed E1–E6 range, verified against generated reference tones.
- **SC-067**: The needle tracks the string as smoothly as the horizontal marker does — a sustained 60 frames per second while tuning, with no measured regression against the horizontal display.
- **SC-068**: A player who never opens Settings sees no change whatsoever to their tuner.
- **SC-069**: The chosen display survives closing and reopening the app on 100% of attempts where the device permits storage.
- **SC-070**: The circular display is fully readable in greyscale — sharp, flat and in-tune are each distinguishable without colour.
- **SC-071**: Both platforms present the circle with identical segment labels, identical segment order, and needle angles agreeing within 1 degree on the same input.

## Assumptions

- **Segments are 30° each and the circle ascends clockwise.** Twelve equal segments of a full circle is 30° per note; the speedometer analogy in the request fixes clockwise as sharper, which makes the labels read C, C♯, D, … B clockwise from the top.
- **The needle angle is continuous in pitch, not quantised to notes.** "The centre of the note's segment being in tune" plus a speedometer sweep means the needle's angle is a direct function of how far the heard pitch is from C, so a pitch halfway between two notes lands exactly on the boundary between their segments.
- **The needle never leaves the segment of the note being named.** The tuner already reports the *nearest* note, so the deviation it reports is always within half a semitone — half a segment. This is a consequence of existing behaviour, not a new constraint.
- **The in-tune tolerance and the meaning of sharp/flat are reused, not redefined.** The existing shared tolerance and tuning-state vocabulary drive the circle exactly as they drive the line.
- **The display choice is per-device.** There is no account and no sync, and both remain out of scope, so choosing the dial in the browser does not change the phone.
- **The choice lives in the existing settings record.** It is a fourth field beside reference pitch, accidental style and appearance, subject to the same repair-on-read behaviour that lets each field survive a corrupt neighbour.
- **The circle is drawn with what the platforms already have.** No new drawing or charting dependency is assumed; adding one would need justification against the simplicity principle during planning.
- **The existing screen-reader announcement is sufficient.** It already speaks note, octave and status on discrete change, and that is independent of which display is on screen.
- **This does not touch pitch detection.** Nothing in the audio path, the reading filter chain, or the note maths changes; this is a second rendering of readings that already exist.
- **Nothing on the out-of-scope list is implied.** The circle shows the chromatic scale because that is what the tuner detects — it is not a tuning preset, a string target, or a custom tuning, and it introduces no reference tone.
