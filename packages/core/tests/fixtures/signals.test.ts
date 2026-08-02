import { describe, expect, it } from 'vitest';

import { sawtooth, silence, sine, sweep, weakFundamental, withNoise } from './signals';

// The accuracy tests in Phase 3 are only as trustworthy as these generators, so
// the generators get their own tests.

const SAMPLE_RATE = 44100;
const LENGTH = 4096;

function peak(signal: Float32Array): number {
  let max = 0;
  for (let i = 0; i < signal.length; i += 1) max = Math.max(max, Math.abs(signal[i]!));
  return max;
}

/**
 * Zero-crossing frequency estimate, independent of the DSP under test.
 *
 * Measures between the FIRST and LAST upward crossing rather than counting over
 * the whole buffer — counting quantises to whole periods, which at a 4096-sample
 * window is a ~10 Hz error at 440 Hz and would make this helper useless as an
 * oracle.
 */
function estimateFrequency(signal: Float32Array, sampleRate: number): number {
  const crossings: number[] = [];
  for (let i = 1; i < signal.length; i += 1) {
    const prev = signal[i - 1]!;
    const curr = signal[i]!;
    if (prev < 0 && curr >= 0) {
      // Linear interpolation for the sub-sample crossing position.
      crossings.push(i - 1 + prev / (prev - curr));
    }
  }
  if (crossings.length < 2) return 0;
  const span = crossings[crossings.length - 1]! - crossings[0]!;
  return ((crossings.length - 1) * sampleRate) / span;
}

describe('sine', () => {
  it('produces the requested frequency', () => {
    const signal = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: LENGTH });
    expect(estimateFrequency(signal, SAMPLE_RATE)).toBeCloseTo(440, -1);
  });

  it('respects the requested amplitude', () => {
    const signal = sine({
      frequency: 440,
      sampleRate: SAMPLE_RATE,
      length: LENGTH,
      amplitude: 0.5,
    });
    expect(peak(signal)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(peak(signal)).toBeGreaterThan(0.45);
  });

  it('is deterministic', () => {
    const a = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: 128 });
    const b = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: 128 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('honours the starting phase', () => {
    const zero = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: 8, phase: 0 });
    const shifted = sine({
      frequency: 440,
      sampleRate: SAMPLE_RATE,
      length: 8,
      phase: Math.PI / 2,
    });
    expect(zero[0]).toBeCloseTo(0, 6);
    expect(shifted[0]).toBeGreaterThan(0.7);
  });
});

describe('sawtooth', () => {
  it('produces the requested fundamental', () => {
    const signal = sawtooth({ frequency: 220, sampleRate: SAMPLE_RATE, length: LENGTH });
    expect(estimateFrequency(signal, SAMPLE_RATE)).toBeCloseTo(220, -1);
  });

  it('is band-limited — no energy above Nyquist to alias back down', () => {
    // A high fundamental leaves room for very few harmonics; the generator must
    // simply stop rather than fold them back as false partials.
    const signal = sawtooth({ frequency: 8000, sampleRate: SAMPLE_RATE, length: 1024 });
    expect(peak(signal)).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(Number.isFinite(peak(signal))).toBe(true);
  });

  it('stays within the requested amplitude after normalisation', () => {
    const signal = sawtooth({
      frequency: 110,
      sampleRate: SAMPLE_RATE,
      length: LENGTH,
      amplitude: 0.7,
    });
    expect(peak(signal)).toBeCloseTo(0.7, 5);
  });
});

describe('weakFundamental', () => {
  it('still crosses zero at the fundamental rate', () => {
    const signal = weakFundamental({ frequency: 82.41, sampleRate: SAMPLE_RATE, length: LENGTH });
    expect(peak(signal)).toBeGreaterThan(0);
  });

  it('puts far less energy in the fundamental than in the second harmonic', () => {
    // This is the property that makes the low-E octave-error test meaningful.
    const frequency = 82.41;
    const signal = weakFundamental({
      frequency,
      sampleRate: SAMPLE_RATE,
      length: LENGTH,
      fundamentalGain: 0.05,
    });

    const energyAt = (hz: number): number => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < signal.length; i += 1) {
        const angle = (2 * Math.PI * hz * i) / SAMPLE_RATE;
        re += signal[i]! * Math.cos(angle);
        im += signal[i]! * Math.sin(angle);
      }
      return Math.sqrt(re * re + im * im) / signal.length;
    };

    expect(energyAt(frequency)).toBeLessThan(energyAt(frequency * 2));
  });
});

describe('withNoise', () => {
  it('is deterministic for a given seed', () => {
    const clean = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: 256 });
    const a = withNoise(clean, 20, 42);
    const b = withNoise(clean, 20, 42);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces different noise for different seeds', () => {
    const clean = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: 256 });
    expect(Array.from(withNoise(clean, 20, 1))).not.toEqual(Array.from(withNoise(clean, 20, 2)));
  });

  it('adds more noise at a lower SNR', () => {
    const clean = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: 2048 });
    const deviation = (noisy: Float32Array): number => {
      let sum = 0;
      for (let i = 0; i < clean.length; i += 1) sum += Math.abs(noisy[i]! - clean[i]!);
      return sum / clean.length;
    };
    expect(deviation(withNoise(clean, 5))).toBeGreaterThan(deviation(withNoise(clean, 40)));
  });

  it('leaves the signal recognisable at the 20 dB budget', () => {
    const clean = sine({ frequency: 440, sampleRate: SAMPLE_RATE, length: LENGTH });
    const noisy = withNoise(clean, 20);
    expect(estimateFrequency(noisy, SAMPLE_RATE)).toBeGreaterThan(300);
  });
});

describe('silence', () => {
  it('is all zeros', () => {
    const signal = silence(64);
    expect(signal).toHaveLength(64);
    expect(Array.from(signal).every((v) => v === 0)).toBe(true);
  });
});

describe('sweep', () => {
  it('starts near the first frequency and ends near the second', () => {
    const signal = sweep({
      fromFrequency: 82.41,
      toFrequency: 73.42,
      sampleRate: SAMPLE_RATE,
      length: SAMPLE_RATE,
    });
    const head = signal.subarray(0, 8192);
    const tail = signal.subarray(signal.length - 8192);
    expect(estimateFrequency(head, SAMPLE_RATE)).toBeGreaterThan(
      estimateFrequency(tail, SAMPLE_RATE)
    );
  });

  it('handles a degenerate single-sample sweep', () => {
    const signal = sweep({
      fromFrequency: 100,
      toFrequency: 200,
      sampleRate: SAMPLE_RATE,
      length: 1,
    });
    expect(signal).toHaveLength(1);
    expect(Number.isFinite(signal[0]!)).toBe(true);
  });
});
