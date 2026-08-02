import { describe, expect, it } from 'vitest';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { MIDI_E1, MIDI_E6, frequencyOf } from '../src/notes/frequency';
import { SAMPLE_RATE, SETTLE_LENGTH, analyzeSignal, centsError } from './fixtures/analyze';
import { sawtooth, sine, weakFundamental, withNoise } from './fixtures/signals';

/**
 * Reference-signal accuracy sweep — Constitution v2.0.0 Principle III and the
 * ±1 cent guarantee across E1–E6 (SC-004, quickstart V1).
 */

const TOLERANCE_CENTS = 1;

function makeAnalyzer(a4Hz = 440): PitchAnalyzer {
  return new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz });
}

/** Detune a frequency by a number of cents. */
function detune(frequency: number, cents: number): number {
  return frequency * Math.pow(2, cents / 1200);
}

describe('accuracy: pure sine across the guaranteed range E1-E6', () => {
  for (let midi = MIDI_E1; midi <= MIDI_E6; midi += 1) {
    it(`detects MIDI ${midi} (${frequencyOf(midi, 440).toFixed(2)} Hz) within ±1 cent`, () => {
      const signal = sine({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), signal);

      expect(reading).not.toBeNull();
      expect(reading!.midi).toBe(midi);
      expect(Math.abs(centsError(reading!, midi))).toBeLessThanOrEqual(TOLERANCE_CENTS);
    });
  }
});

describe('accuracy: deliberate cent offsets are reported faithfully', () => {
  // Every 6th semitone keeps the sweep meaningful without making it slow.
  const midis = [MIDI_E1, 34, 40, 46, 52, 58, 64, 70, 76, 82, MIDI_E6];
  const offsets = [-49, -20, -1, 1, 20, 49];

  for (const midi of midis) {
    for (const offset of offsets) {
      it(`MIDI ${midi} at ${offset > 0 ? '+' : ''}${offset} cents`, () => {
        const signal = sine({
          frequency: detune(frequencyOf(midi, 440), offset),
          sampleRate: SAMPLE_RATE,
          length: SETTLE_LENGTH,
        });
        const reading = analyzeSignal(makeAnalyzer(), signal);

        expect(reading).not.toBeNull();
        expect(centsError(reading!, midi)).toBeCloseTo(offset, 0);
        expect(Math.abs(centsError(reading!, midi) - offset)).toBeLessThanOrEqual(TOLERANCE_CENTS);
      });
    }
  }
});

describe('accuracy: harmonically rich tones', () => {
  const midis = [MIDI_E1, 31, 34, 40, 45, 50, 55, 59, 64, 71, 76, 83, MIDI_E6];

  for (const midi of midis) {
    it(`sawtooth at MIDI ${midi} stays within ±1 cent`, () => {
      const signal = sawtooth({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), signal);

      expect(reading).not.toBeNull();
      expect(reading!.midi).toBe(midi);
      expect(Math.abs(centsError(reading!, midi))).toBeLessThanOrEqual(TOLERANCE_CENTS);
    });
  }
});

describe('accuracy: weak fundamental must not cause an octave error', () => {
  // The six open strings of a guitar in standard tuning. The low E in
  // particular has a weak fundamental, which is the classic way a tuner ends up
  // confidently reporting the note an octave high.
  const openStrings = [
    { name: 'E2', midi: 40 },
    { name: 'A2', midi: 45 },
    { name: 'D3', midi: 50 },
    { name: 'G3', midi: 55 },
    { name: 'B3', midi: 59 },
    { name: 'E4', midi: 64 },
  ];

  for (const { name, midi } of openStrings) {
    it(`${name} is reported at the correct octave`, () => {
      const signal = weakFundamental({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), signal);

      expect(reading).not.toBeNull();
      expect(reading!.midi).toBe(midi);
      expect(Math.abs(centsError(reading!, midi))).toBeLessThanOrEqual(TOLERANCE_CENTS);
    });
  }
});

describe('accuracy: in noise at the 20 dB budget', () => {
  const midis = [40, 45, 50, 55, 59, 64];

  for (const midi of midis) {
    it(`MIDI ${midi} survives 20 dB SNR`, () => {
      const clean = sawtooth({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), withNoise(clean, 20, midi));

      expect(reading).not.toBeNull();
      expect(reading!.midi).toBe(midi);
      expect(Math.abs(centsError(reading!, midi))).toBeLessThanOrEqual(TOLERANCE_CENTS);
    });
  }
});

describe('accuracy: silence and noise produce no reading', () => {
  it('returns no reading for silence', () => {
    const reading = analyzeSignal(makeAnalyzer(), new Float32Array(SETTLE_LENGTH));
    expect(reading).toBeNull();
  });

  it('returns no reading for broadband noise with no pitch', () => {
    const noise = withNoise(new Float32Array(SETTLE_LENGTH), 0, 7);
    const reading = analyzeSignal(makeAnalyzer(), noise);
    expect(reading).toBeNull();
  });
});

describe('accuracy: reference pitch is honoured', () => {
  it('reads a 440 Hz tone as ~+32 cents when A4 is 432 (V12)', () => {
    const signal = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: SETTLE_LENGTH });
    const reading = analyzeSignal(makeAnalyzer(432), signal);

    expect(reading).not.toBeNull();
    expect(reading!.midi).toBe(69);
    expect(reading!.cents).toBeCloseTo(31.77, 0);
  });

  it('applies a reference-pitch change without needing a restart (guarantee N7)', () => {
    const analyzer = makeAnalyzer(440);
    const signal = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: SETTLE_LENGTH });

    const at440 = analyzeSignal(analyzer, signal);
    expect(at440!.cents).toBeCloseTo(0, 0);

    analyzer.setReferencePitch(432);
    const at432 = analyzeSignal(analyzer, signal);
    expect(at432!.cents).toBeCloseTo(31.77, 0);
  });

  it('does not blank the display while the reference pitch is being dragged (T086, N7)', () => {
    // The user drags an A4 slider: dozens of changes a second, against a string
    // that is still ringing. Discarding buffered audio on each one would make
    // the note name flicker to nothing for the whole gesture — the display
    // would be blank exactly while the user is watching it to judge the effect.
    const analyzer = makeAnalyzer(440);
    const signal = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: SETTLE_LENGTH });

    // Fill the window and settle first, as a live session would be.
    expect(analyzeSignal(analyzer, signal)).not.toBeNull();

    let now = 1000;
    for (let hz = 440; hz >= 415; hz -= 1) {
      analyzer.setReferencePitch(hz);
      analyzer.push(signal.subarray(0, 1024));
      now += 23;

      expect(analyzer.analyze(now), `reading lost at A4 = ${hz} Hz`).not.toBeNull();
    }
  });

  it('reports the same physical pitch under any reference, only named differently', () => {
    // A 440 Hz tone is a 440 Hz tone. Changing A4 changes what we CALL it, and
    // must never change the frequency we claim to have measured.
    const signal = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: SETTLE_LENGTH });

    for (const a4Hz of [415, 432, 440, 466]) {
      const reading = analyzeSignal(makeAnalyzer(a4Hz), signal);
      expect(reading).not.toBeNull();
      expect(reading!.frequency).toBeCloseTo(440, 0);
    }
  });
});
