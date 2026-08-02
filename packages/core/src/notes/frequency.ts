import type { AccidentalStyle } from '../types';

/** Default concert pitch for A4, in Hz (FR-022). */
export const A4_DEFAULT_HZ = 440;

/** Lowest and highest configurable reference pitch for A4, in Hz (FR-022). */
export const A4_MIN_HZ = 415;
export const A4_MAX_HZ = 466;

/**
 * Detection range: A0 through C8.
 *
 * The app names notes across this whole span. Accuracy inside it is bounded —
 * see {@link isGuaranteedAccurate}.
 */
export const MIDI_A0 = 21;
export const MIDI_C8 = 108;

/**
 * Guaranteed-accuracy range: E1 through E6.
 *
 * Constitution v2.0.0 guarantees +/-1 cent only across this band, which covers
 * every note a guitar can produce — from a heavily detuned low string to the
 * 24th fret of the high E. Outside it, +/-1 cent is not physically attainable
 * at 44.1 kHz and the binding requirement becomes returning no reading rather
 * than a confident wrong one.
 */
export const MIDI_E1 = 28;
export const MIDI_E6 = 88;

/** MIDI note number of A4, the anchor for the whole tuning system. */
const MIDI_A4 = 69;

const SEMITONES_PER_OCTAVE = 12;
const CENTS_PER_SEMITONE = 100;

/** Frequency in Hz of a MIDI note, in 12-tone equal temperament. */
export function frequencyOf(midi: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (midi - MIDI_A4) / SEMITONES_PER_OCTAVE);
}

/**
 * Real-valued MIDI note number for a frequency. The fractional part is the
 * deviation from the nearest note; {@link nearestNote} splits the two.
 */
export function midiFromFrequency(frequency: number, a4Hz: number): number {
  return MIDI_A4 + SEMITONES_PER_OCTAVE * Math.log2(frequency / a4Hz);
}

/**
 * Nearest note to a frequency, plus the signed deviation in cents.
 *
 * `cents` is always within +/-50 by construction: it is the remainder after
 * rounding to the nearest semitone. A value outside that range is a bug here,
 * not something callers should clamp.
 */
export function nearestNote(frequency: number, a4Hz: number): { midi: number; cents: number } {
  const exact = midiFromFrequency(frequency, a4Hz);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * CENTS_PER_SEMITONE };
}

/** Pitch class 0-11, where 0 is C. */
export function pitchClassOf(midi: number): number {
  return ((midi % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
}

/** Octave in scientific pitch notation: middle C (MIDI 60) is C4. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / SEMITONES_PER_OCTAVE) - 1;
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

/**
 * Note name without octave, spelled per the user's accidental preference.
 *
 * This is the ONLY place accidental style is applied, which is what makes
 * FR-023's "consistently everywhere a note is shown" structurally true rather
 * than a review checklist item.
 */
export function noteName(midi: number, style: AccidentalStyle): string {
  const names = style === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClassOf(midi)]!;
}

/** Whether the note falls inside the A0-C8 detection range. */
export function isSupportedMidi(midi: number): boolean {
  return midi >= MIDI_A0 && midi <= MIDI_C8;
}

/** Whether +/-1 cent accuracy is guaranteed for this note (Constitution v2.0.0). */
export function isGuaranteedAccurate(midi: number): boolean {
  return midi >= MIDI_E1 && midi <= MIDI_E6;
}
