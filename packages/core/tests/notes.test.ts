import { describe, expect, it } from 'vitest';

import {
  A4_DEFAULT_HZ,
  MIDI_A0,
  MIDI_C8,
  MIDI_E1,
  MIDI_E6,
  frequencyOf,
  isGuaranteedAccurate,
  isSupportedMidi,
  midiFromFrequency,
  nearestNote,
  noteName,
  octaveOf,
  pitchClassOf,
} from '../src/notes/frequency';

describe('frequencyOf', () => {
  it('anchors A4 to the reference pitch', () => {
    expect(frequencyOf(69, 440)).toBeCloseTo(440, 10);
    expect(frequencyOf(69, 432)).toBeCloseTo(432, 10);
    expect(frequencyOf(69, 415)).toBeCloseTo(415, 10);
  });

  it('matches known equal-temperament frequencies at A4=440', () => {
    // Reference values from standard pitch tables.
    expect(frequencyOf(MIDI_A0, 440)).toBeCloseTo(27.5, 4);
    expect(frequencyOf(MIDI_E1, 440)).toBeCloseTo(41.203, 2);
    expect(frequencyOf(40, 440)).toBeCloseTo(82.407, 2); // E2, guitar low E
    expect(frequencyOf(60, 440)).toBeCloseTo(261.626, 2); // C4
    expect(frequencyOf(64, 440)).toBeCloseTo(329.628, 2); // E4, guitar high E
    expect(frequencyOf(MIDI_E6, 440)).toBeCloseTo(1318.51, 1);
    expect(frequencyOf(MIDI_C8, 440)).toBeCloseTo(4186.01, 1);
  });

  it('doubles frequency for every octave', () => {
    for (let midi = MIDI_A0; midi <= MIDI_C8 - 12; midi += 1) {
      expect(frequencyOf(midi + 12, 440)).toBeCloseTo(frequencyOf(midi, 440) * 2, 6);
    }
  });

  it('scales linearly with the reference pitch', () => {
    // A 432 Hz reference makes every note flatter by the same ratio.
    const ratio = 432 / 440;
    for (const midi of [MIDI_A0, 40, 60, MIDI_C8]) {
      expect(frequencyOf(midi, 432)).toBeCloseTo(frequencyOf(midi, 440) * ratio, 8);
    }
  });
});

describe('midiFromFrequency', () => {
  it('is the exact inverse of frequencyOf across A0-C8', () => {
    for (const a4 of [415, 432, 440, 466]) {
      for (let midi = MIDI_A0; midi <= MIDI_C8; midi += 1) {
        expect(midiFromFrequency(frequencyOf(midi, a4), a4)).toBeCloseTo(midi, 9);
      }
    }
  });

  it('returns fractional values between notes', () => {
    const halfway = Math.sqrt(frequencyOf(69, 440) * frequencyOf(70, 440));
    expect(midiFromFrequency(halfway, 440)).toBeCloseTo(69.5, 6);
  });
});

describe('nearestNote', () => {
  it('reports zero deviation on exact note frequencies', () => {
    for (let midi = MIDI_A0; midi <= MIDI_C8; midi += 1) {
      const result = nearestNote(frequencyOf(midi, 440), 440);
      expect(result.midi).toBe(midi);
      expect(result.cents).toBeCloseTo(0, 6);
    }
  });

  it('always reports cents within +/-50 by construction', () => {
    // Sweep in 1-cent steps across the whole range; a value outside +/-50 is a
    // bug in the note math, not something to clamp at runtime.
    for (let midi = MIDI_A0; midi <= MIDI_C8 - 1; midi += 1) {
      for (let offset = -49; offset <= 49; offset += 7) {
        const freq = frequencyOf(midi, 440) * Math.pow(2, offset / 1200);
        const result = nearestNote(freq, 440);
        expect(result.cents).toBeGreaterThanOrEqual(-50);
        expect(result.cents).toBeLessThanOrEqual(50);
        expect(result.midi).toBe(midi);
        expect(result.cents).toBeCloseTo(offset, 4);
      }
    }
  });

  it('rounds to the higher note just past the midpoint', () => {
    const justSharpOfMidpoint = frequencyOf(69, 440) * Math.pow(2, 50.5 / 1200);
    expect(nearestNote(justSharpOfMidpoint, 440).midi).toBe(70);

    const justFlatOfMidpoint = frequencyOf(69, 440) * Math.pow(2, 49.5 / 1200);
    expect(nearestNote(justFlatOfMidpoint, 440).midi).toBe(69);
  });

  it('honours a non-standard reference pitch', () => {
    // With A4 = 432, a 440 Hz tone sits ~+31.8 cents above A4.
    const result = nearestNote(440, 432);
    expect(result.midi).toBe(69);
    expect(result.cents).toBeCloseTo(31.77, 1);
  });
});

describe('pitchClassOf and octaveOf', () => {
  it('maps middle C and concert A correctly', () => {
    expect(pitchClassOf(60)).toBe(0);
    expect(octaveOf(60)).toBe(4);
    expect(pitchClassOf(69)).toBe(9);
    expect(octaveOf(69)).toBe(4);
  });

  it('is correct at octave boundaries', () => {
    expect(octaveOf(59)).toBe(3); // B3
    expect(octaveOf(60)).toBe(4); // C4 — the octave increments at C, not A
    expect(octaveOf(71)).toBe(4); // B4
    expect(octaveOf(72)).toBe(5); // C5
  });

  it('places the range endpoints in the expected octaves', () => {
    expect(octaveOf(MIDI_A0)).toBe(0);
    expect(pitchClassOf(MIDI_A0)).toBe(9);
    expect(octaveOf(MIDI_C8)).toBe(8);
    expect(pitchClassOf(MIDI_C8)).toBe(0);
    expect(octaveOf(MIDI_E1)).toBe(1);
    expect(octaveOf(MIDI_E6)).toBe(6);
  });
});

describe('noteName', () => {
  it('renders naturals identically in both accidental styles', () => {
    for (const midi of [60, 62, 64, 65, 67, 69, 71]) {
      expect(noteName(midi, 'sharp')).toBe(noteName(midi, 'flat'));
    }
  });

  it('renders the full sharp spelling', () => {
    const names = Array.from({ length: 12 }, (_, i) => noteName(60 + i, 'sharp'));
    expect(names).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
  });

  it('renders the full flat spelling', () => {
    const names = Array.from({ length: 12 }, (_, i) => noteName(60 + i, 'flat'));
    expect(names).toEqual(['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']);
  });

  it('is octave-independent — the octave is reported separately', () => {
    expect(noteName(40, 'sharp')).toBe('E');
    expect(noteName(52, 'sharp')).toBe('E');
    expect(noteName(64, 'sharp')).toBe('E');
  });
});

describe('range predicates', () => {
  it('supports detection across A0-C8 and nothing outside it', () => {
    expect(isSupportedMidi(MIDI_A0)).toBe(true);
    expect(isSupportedMidi(MIDI_C8)).toBe(true);
    expect(isSupportedMidi(MIDI_A0 - 1)).toBe(false);
    expect(isSupportedMidi(MIDI_C8 + 1)).toBe(false);
  });

  it('guarantees +/-1 cent accuracy only across E1-E6 (Constitution v2.0.0)', () => {
    expect(isGuaranteedAccurate(MIDI_E1)).toBe(true);
    expect(isGuaranteedAccurate(MIDI_E6)).toBe(true);
    expect(isGuaranteedAccurate(40)).toBe(true); // guitar low E
    expect(isGuaranteedAccurate(64)).toBe(true); // guitar high E
    expect(isGuaranteedAccurate(MIDI_E1 - 1)).toBe(false);
    expect(isGuaranteedAccurate(MIDI_E6 + 1)).toBe(false);
    // A0 and C8 are detectable but explicitly not guaranteed accurate.
    expect(isSupportedMidi(MIDI_A0) && !isGuaranteedAccurate(MIDI_A0)).toBe(true);
    expect(isSupportedMidi(MIDI_C8) && !isGuaranteedAccurate(MIDI_C8)).toBe(true);
  });
});

describe('constants', () => {
  it('exposes the documented reference pitch default', () => {
    expect(A4_DEFAULT_HZ).toBe(440);
  });
});
