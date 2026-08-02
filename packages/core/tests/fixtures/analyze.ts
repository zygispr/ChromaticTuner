import { PitchAnalyzer } from '../../src/dsp/pitch-analyzer';
import type { PitchReading } from '../../src/types';

export const SAMPLE_RATE = 44100;

/** Enough audio to fill the 4096 window and settle the median-of-5 filter. */
export const SETTLE_LENGTH = 16384;

export interface SettledReading {
  readonly midi: number;
  readonly cents: number;
  readonly clarity: number;
  readonly frequency: number;
}

/**
 * Push a signal through an analyzer hop by hop and return the final reading.
 *
 * Returns null if the analyzer never produced a confident reading — which for
 * several tests is the correct, expected outcome.
 */
export function analyzeSignal(
  analyzer: PitchAnalyzer,
  signal: Float32Array,
  hopSize = 1024
): SettledReading | null {
  let last: PitchReading | null = null;
  let now = 0;

  for (let offset = 0; offset + hopSize <= signal.length; offset += hopSize) {
    analyzer.push(signal.subarray(offset, offset + hopSize));
    now += (hopSize / SAMPLE_RATE) * 1000;
    const reading = analyzer.analyze(now);
    if (reading) {
      // Copy: the analyzer reuses one object, so retaining it would alias.
      last = { ...reading };
    }
  }

  return last;
}

/** Cents error between a detected reading and the note that was actually played. */
export function centsError(reading: SettledReading, expectedMidi: number): number {
  return (reading.midi - expectedMidi) * 100 + reading.cents;
}
