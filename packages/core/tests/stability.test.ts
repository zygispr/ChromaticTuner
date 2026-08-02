import { describe, expect, it } from 'vitest';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { frequencyOf } from '../src/notes/frequency';
import type { PitchReading } from '../src/types';
import { SAMPLE_RATE } from './fixtures/analyze';
import { sawtooth, sine, withNoise } from './fixtures/signals';

/**
 * Readout stability — SC-005 and quickstart V2: the displayed cents value must
 * not vary by more than ±2 cents while a steady tone is held. A tuner whose
 * number twitches reads as inaccurate even when the mean is perfect.
 */

const HOP = 1024;
const FIVE_SECONDS = SAMPLE_RATE * 5;

function collectCents(signal: Float32Array, a4Hz = 440): number[] {
  const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz });
  const values: number[] = [];
  let now = 0;

  for (let offset = 0; offset + HOP <= signal.length; offset += HOP) {
    analyzer.push(signal.subarray(offset, offset + HOP));
    now += (HOP / SAMPLE_RATE) * 1000;
    const reading: PitchReading | null = analyzer.analyze(now);
    if (reading) values.push(reading.cents);
  }

  // Drop the first few readings: the window is still filling.
  return values.slice(4);
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe('stability on a held tone', () => {
  it('varies by no more than 2 cents over 5 seconds of a clean tone', () => {
    const signal = sine({
      frequency: frequencyOf(40, 440), // E2, guitar low E
      sampleRate: SAMPLE_RATE,
      length: FIVE_SECONDS,
    });

    const values = collectCents(signal);
    expect(values.length).toBeGreaterThan(100);
    expect(spread(values)).toBeLessThanOrEqual(2);
  });

  it('varies by no more than 2 cents over 5 seconds of a noisy tone', () => {
    const clean = sawtooth({
      frequency: frequencyOf(45, 440), // A2
      sampleRate: SAMPLE_RATE,
      length: FIVE_SECONDS,
    });

    const values = collectCents(withNoise(clean, 20, 3));
    expect(values.length).toBeGreaterThan(100);
    expect(spread(values)).toBeLessThanOrEqual(2);
  });

  it('stays stable at the top of the guitar range', () => {
    const signal = sine({
      frequency: frequencyOf(64, 440), // E4, high E
      sampleRate: SAMPLE_RATE,
      length: FIVE_SECONDS,
    });

    expect(spread(collectCents(signal))).toBeLessThanOrEqual(2);
  });

  it('does not drift over the run', () => {
    const signal = sawtooth({
      frequency: frequencyOf(50, 440), // D3
      sampleRate: SAMPLE_RATE,
      length: FIVE_SECONDS,
    });

    const values = collectCents(signal);
    const firstQuarter = values.slice(0, Math.floor(values.length / 4));
    const lastQuarter = values.slice(-Math.floor(values.length / 4));

    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean(firstQuarter) - mean(lastQuarter))).toBeLessThanOrEqual(1);
  });
});
