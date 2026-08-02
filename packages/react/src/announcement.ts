import type { TunerStatus } from '@chromatic-tuner/core';

/**
 * Spell an accidental so a screen reader says "E flat", not "E three-bar-b".
 *
 * The display uses the proper musical glyphs (♯ ♭), which screen readers
 * pronounce inconsistently — some read them as "number sign", some skip them
 * silently, which turns "D♯" into "D" and makes the announcement actively
 * wrong rather than merely awkward.
 */
export function spellNoteForSpeech(note: string): string {
  return note.replace('♯', ' sharp').replace('♭', ' flat');
}

/**
 * One sentence describing the current reading, for assistive technology.
 *
 * FR-020 requires state changes to be announced "without spamming assistive
 * tech on every reading". Two things follow, and both are load-bearing:
 *
 * 1. It is built from the DISCRETE channel only. The continuous cents channel
 *    fires ~43 times a second; a live region fed from it would talk over
 *    itself continuously and be worse than silence.
 * 2. It is ONE sentence covering note, deviation, and direction. The visual
 *    design splits those across four elements, and a screen reader announcing
 *    each separately produces four fragments per change — technically
 *    conformant and practically unusable.
 *
 * Returns null when there is nothing to say, so the caller renders no live
 * region at all rather than an empty one.
 */
export function readingAnnouncement(
  status: TunerStatus,
  note: string | null,
  octave: number | null
): string | null {
  if (status.kind !== 'reading' || note === null) return null;

  const { cents, state } = status.reading;
  const spoken = spellNoteForSpeech(note);
  const name = octave === null ? spoken : `${spoken} ${octave}`;
  const rounded = Math.abs(Math.round(cents));

  switch (state) {
    case 'in-tune':
      return `${name}, in tune.`;
    case 'flat':
      return `${name}, ${rounded} cents flat. Tighten.`;
    case 'sharp':
      return `${name}, ${rounded} cents sharp. Loosen.`;
    case 'no-reading':
      return null;
  }
}
