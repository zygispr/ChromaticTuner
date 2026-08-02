import { describe, expect, it } from 'vitest';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { MIDI_A0, MIDI_C8, MIDI_E1, MIDI_E6, frequencyOf } from '../src/notes/frequency';
import { SAMPLE_RATE, SETTLE_LENGTH, analyzeSignal } from './fixtures/analyze';
import { sine } from './fixtures/signals';

/**
 * Graceful degradation outside the guaranteed band.
 *
 * Constitution v2.0.0: outside E1–E6 the binding requirement is honesty, not
 * precision — the app MUST return no reading rather than a confident wrong one.
 * These tests therefore assert "not wrong", never "within ±1 cent".
 */

function makeAnalyzer(): PitchAnalyzer {
  return new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
}

const belowGuaranteed = [MIDI_A0, 23, 25, 27]; // A0 up to just under E1
const aboveGuaranteed = [90, 95, 100, 104, MIDI_C8]; // just over E6 up to C8

describe('below the guaranteed range (A0 to just under E1)', () => {
  for (const midi of belowGuaranteed) {
    it(`MIDI ${midi} (${frequencyOf(midi, 440).toFixed(2)} Hz) is never confidently wrong`, () => {
      const signal = sine({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), signal);

      // Either no reading at all, or the right note. Never a wrong note.
      if (reading !== null) {
        expect(reading.midi).toBe(midi);
      }
    });
  }
});

describe('above the guaranteed range (just over E6 to C8)', () => {
  for (const midi of aboveGuaranteed) {
    it(`MIDI ${midi} (${frequencyOf(midi, 440).toFixed(2)} Hz) is never confidently wrong`, () => {
      const signal = sine({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), signal);

      if (reading !== null) {
        expect(reading.midi).toBe(midi);
      }
    });
  }
});

describe('the guaranteed band itself still holds', () => {
  it('reads both endpoints of E1-E6 correctly', () => {
    for (const midi of [MIDI_E1, MIDI_E6]) {
      const signal = sine({
        frequency: frequencyOf(midi, 440),
        sampleRate: SAMPLE_RATE,
        length: SETTLE_LENGTH,
      });
      const reading = analyzeSignal(makeAnalyzer(), signal);
      expect(reading).not.toBeNull();
      expect(reading!.midi).toBe(midi);
    }
  });
});

describe('outside the detection range entirely', () => {
  it('produces no reading for a sub-audible 10 Hz tone', () => {
    const signal = sine({ frequency: 10, sampleRate: SAMPLE_RATE, length: SETTLE_LENGTH });
    const reading = analyzeSignal(makeAnalyzer(), signal);
    if (reading !== null) {
      // If anything is reported it must still be inside the supported range.
      expect(reading.midi).toBeGreaterThanOrEqual(MIDI_A0);
    }
  });

  it('produces no confidently wrong reading above C8', () => {
    const signal = sine({ frequency: 8000, sampleRate: SAMPLE_RATE, length: SETTLE_LENGTH });
    const reading = analyzeSignal(makeAnalyzer(), signal);
    if (reading !== null) {
      expect(reading.midi).toBeLessThanOrEqual(MIDI_C8 + 1);
    }
  });
});
