# Quickstart: Circular Tuner Display

**Feature**: 007-circular-tuner-display | **Date**: 2026-08-12

Validation scenarios continue the project's numbering at **V58**. Each names the
guarantee (`contracts/tuner-display.md`) or requirement it proves.

## Prerequisites

```bash
corepack enable && pnpm install         # Node 22.13+, not 20
pnpm --filter @chromatic-tuner/web dev  # http://localhost:5173
```

Mobile needs a dev build — Expo Go cannot open the microphone:

```bash
pnpm --filter @chromatic-tuner/mobile ios      # or: android
```

---

## Gates

Run before claiming any of this works.

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test                    # includes the new core suites and the port contract suite
pnpm test:coverage           # packages/core must stay >= 90% lines / 90% functions / 85% branches
pnpm test:e2e                # regenerates WAV fixtures, then Playwright + Chromium
pnpm --filter @chromatic-tuner/mobile test
```

Single suites while working:

```bash
pnpm vitest run packages/core/tests/dial.test.ts
pnpm vitest run --project core -t "unwrapDegrees"
pnpm --filter @chromatic-tuner/web exec playwright test e2e/dial.spec.ts
pnpm --filter @chromatic-tuner/mobile test -- dial
```

---

## V58 — The setting exists, reads plainly, and defaults to Line

**Proves**: FR-146, FR-147, FR-149, D10

1. Clear site data (or use a fresh profile) and open the tuner.
2. Confirm the **horizontal line** is showing. Nothing about the tuner has changed.
3. Open Settings from the reference badge.
4. Confirm a group labelled **Tuning display** sits between **Accidentals** and
   **Appearance**, with two equal-width buttons: **Line** and **Dial**.
5. Confirm **Line** is the selected one, styled with the same `selected` tint fill
   the Accidentals and Appearance rows use — not a heavier border, which is the
   app's focus idiom.
6. Confirm both buttons are at least 44×44.

---

## V59 — Switching to Dial does not interrupt tuning

**Proves**: FR-152, G20

1. Start the tuner and let a string ring so a reading is live.
2. With the note still sounding, open Settings and press **Dial**.
3. The dial appears immediately, already tracking the ringing string.
4. **No permission prompt appears.** The recording indicator does not blink off
   and on. The cents readout does not blank.
5. Press **Line**, then **Dial** again, several times while the string rings.
   Capture survives every switch.

---

## V60 — The needle points where the maths says

**Proves**: FR-157, FR-158, G2, G4, G21

Play generated reference tones (the e2e fixtures cover these; by ear use a tone
generator):

| Tone | Expected needle angle | Expected segment |
|---|---|---|
| A4 at exactly the reference pitch | `270°` — pointing left | centre of **A** |
| D3 exactly | `60°` | centre of **D** |
| D3 + 25 cents | `67.5°` | a quarter-segment clockwise of D's centre |
| D3 − 25 cents | `52.5°` | a quarter-segment anticlockwise of D's centre |
| C4 exactly | `0°` — straight up | centre of **C** |

Sharp is clockwise; flat is anticlockwise. If those are reversed, the dial is
mirrored and every subsequent scenario is meaningless.

---

## V61 — Crossing the top of the dial takes the short way

**Proves**: FR-159, G9, G10 — the defect most likely to ship

1. Select the dial.
2. Sweep a pitch slowly upward from about 30 cents flat of B, through B, and on
   into C — a bent string or a tone generator both work.
3. Watch the needle pass **twelve o'clock**.
4. It must travel a few degrees clockwise, continuously.
5. **Fail** if it whips almost a full turn anticlockwise to arrive at the same
   place. That is the un-unwrapped angle, and it is invisible to any test that
   only checks the final resting angle.
6. Repeat downward, C into B.

---

## V62 — A lapsed reading holds its angle and goes quiet

**Proves**: FR-162, FR-163, G13, D8

1. Reload with the dial selected and **play nothing**. Confirm **no needle is
   drawn at all** (FR-163).
2. Play a string, let the needle settle, then damp it.
3. The needle stays exactly where it was and takes the muted `noReading` colour,
   while the note name blanks to "–" as it already does.
4. **Fail** if it snaps to the top, jumps to a note, or disappears.
5. Play again: the needle takes a state colour and resumes tracking.

---

## V63 — Accidental style renames five segments

**Proves**: FR-156, G23

1. With the dial showing and **Sharps** selected, confirm the accidental segments
   read C♯ D♯ F♯ G♯ A♯.
2. Switch to **Flats**. The same five segments read D♭ E♭ G♭ A♭ B♭, in the same
   positions, and the seven naturals are untouched.
3. The needle does not move — the spelling changed, not the pitch.

---

## V64 — The choice is remembered, and reset returns to Line

**Proves**: FR-150, G18, G19

1. Select **Dial**, close the sheet, and fully reload the page.
2. The dial is showing on the first painted frame, with no flash of the line.
3. Repeat on the phone app: select **Dial**, force-quit, relaunch.
4. Open Settings and press **Reset to defaults**. The line returns, along with
   440 Hz, Sharps and Match device.

**Upgrade path** — with DevTools, write a pre-007 record and reload:

```js
localStorage.setItem(
  'chromatic-tuner:preferences',
  JSON.stringify({ a4Hz: 432, accidentalStyle: 'flat', appearance: 'dark', schemaVersion: 1 })
);
```

The tuner must load at 432 Hz, flats, dark, and the **line** — every field
preserved, the missing one defaulted (G18).

**Garbage path** — the same record with `tunerDisplay: 'circle'` must also load as
the line, with 432/flat/dark still intact (G16, G17).

---

## V65 — Storage refusal still switches the display

**Proves**: FR-153

1. Open the site in a context where writes fail (Safari private browsing, or
   `localStorage.setItem` stubbed to throw).
2. Switch to **Dial**.
3. The dial appears, and the existing "apply now but could not be saved" warning
   appears in the sheet. Nothing crashes and tuning continues.

---

## V66 — Reduced motion removes the sweep

**Proves**: FR-165, D11

1. Turn on Reduce Motion (macOS: System Settings → Accessibility → Display;
   iOS: Accessibility → Motion; Android: Remove animations).
2. With the dial selected, play a string.
3. The needle updates position with **no tween** — it is at each new angle
   immediately, not easing towards it.
4. Crossing twelve o'clock still takes the short way (V61 still holds; unwrapping
   is not an animation concern).

---

## V67 — Contrast, in both appearances, composited

**Proves**: FR-166, FR-167, G22

1. Screenshot the dial in light and dark, on both platforms.
2. Segment labels ≥ 4.5:1 against the background they are on; needle, ticks and
   rim ≥ 3:1.
3. Measure the **composited** result, not the token. `pnpm test:e2e` covers this
   for web via `a11y.spec.ts`; the tokens contrast test covers the palette.
4. Search the dial's source for `opacity`. There should be none (G22). Any that
   exists must have its own token and its own composited assertion.

---

## V68 — Greyscale still says sharp, flat and in tune

**Proves**: FR-160, SC-070, Principle IV

1. Apply a greyscale filter (macOS: Accessibility → Display → Colour Filters).
2. Play sharp, flat and in-tune notes on the dial.
3. Each is still identifiable — needle position relative to the segment centre
   tick, plus the cents number and the tighten/loosen cue, which FR-168 keeps.

---

## V69 — The dial fits, and the layout does not jump

**Proves**: FR-168, edge cases

1. On the narrowest supported phone width, in portrait: the dial fits with the
   note name, cents readout, direction cue and microphone control all visible and
   nothing clipped.
2. Rotate to landscape. Same.
3. Turn text size up to the largest step. The twelve labels stay legible and do
   not overlap each other or the needle.
4. Switch Line ↔ Dial repeatedly with the sheet open. The sheet itself must not
   move under the finger (`layout-stability` covers the sheet's own rows).

---

## V70 — The dial says nothing to a screen reader

**Proves**: FR-164, G24

1. Turn on VoiceOver (macOS/iOS) or TalkBack.
2. With the dial selected, play a string.
3. The announcement is the same note/octave/status it has always been, on
   discrete change only. The needle's movement is never spoken, and the twelve
   segment labels are not reachable.

---

## V71 — Performance: no regression against the line

**Proves**: Principle V, SC-067

Required in `tasks.md` as before/after numbers, because this touches the render
loop:

1. Chrome DevTools Performance, 30 seconds of continuous tuning on the **line**.
   Record p95 frame time and dropped frames.
2. Repeat on the **dial**.
3. The dial must sustain 60 fps with no frame budget overrun. A regression above
   10% blocks merge.
4. Confirm `pnpm test` still passes `allocation.test.ts` — the third scalar on the
   reading channel must not have introduced a per-frame allocation (G14).

---

## Release gates (not merge gates)

These cannot run on CI's Ubuntu runners:

```bash
pnpm listing:screenshots   # needs macOS + Xcode for iOS, Android SDK + emulator
```

Store artwork is unaffected — the dial adds no colour, so `color.background` is
unchanged and `pnpm verify:listing` should not report artwork drift. If it does,
something in the dial changed a token, which is a defect, not a reason to
regenerate.
