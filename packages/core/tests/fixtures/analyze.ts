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

/**
 * Push a signal through an analyzer and return EVERY reading it produced.
 *
 * User Story 2 is about behaviour over time — when the displayed name flips and
 * how far the marker travels between flips — so its tests need the whole
 * sequence, not just where the signal happened to end up.
 */
export function collectReadings(
  analyzer: PitchAnalyzer,
  signal: Float32Array,
  hopSize = 1024
): SettledReading[] {
  const readings: SettledReading[] = [];
  let now = 0;

  for (let offset = 0; offset + hopSize <= signal.length; offset += hopSize) {
    analyzer.push(signal.subarray(offset, offset + hopSize));
    now += (hopSize / SAMPLE_RATE) * 1000;
    const reading = analyzer.analyze(now);
    if (reading) readings.push({ ...reading });
  }

  return readings;
}

/** The displayed MIDI notes in order, with consecutive duplicates collapsed. */
export function noteSequence(readings: readonly SettledReading[]): number[] {
  const sequence: number[] = [];
  for (const reading of readings) {
    if (sequence[sequence.length - 1] !== reading.midi) sequence.push(reading.midi);
  }
  return sequence;
}

/** Cents error between a detected reading and the note that was actually played. */
export function centsError(reading: SettledReading, expectedMidi: number): number {
  return (reading.midi - expectedMidi) * 100 + reading.cents;
}
