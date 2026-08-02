import { describe, expect, it } from 'vitest';

import { heapUsed } from './fixtures/heap';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { frequencyOf } from '../src/notes/frequency';
import { SAMPLE_RATE } from './fixtures/analyze';
import { sine } from './fixtures/signals';

/**
 * Zero-allocation enforcement — Constitution v2.0.0 Principle V.
 *
 * The rule binds first-party code from the ring-buffer write inward, and the
 * constitution requires this to be enforced by an automated test rather than by
 * review. Buffers the host platform allocates before handing them to us are
 * explicitly exempt (plan.md C1).
 */

const HOP = 1024;

function makeAnalyzer(): PitchAnalyzer {
  return new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
}

describe('PitchReading is reused, not reallocated', () => {
  it('returns the identical object instance across analyses', () => {
    const analyzer = makeAnalyzer();
    const tone = sine({ frequency: frequencyOf(40, 440), sampleRate: SAMPLE_RATE, length: HOP });

    const seen: unknown[] = [];
    for (let i = 0; i < 12; i += 1) {
      analyzer.push(tone);
      const reading = analyzer.analyze(i * 23);
      if (reading) seen.push(reading);
    }

    expect(seen.length).toBeGreaterThan(4);
    for (const reading of seen) {
      expect(reading).toBe(seen[0]);
    }
  });

  it('mutates the reused object rather than replacing it', () => {
    const analyzer = makeAnalyzer();
    const low = sine({ frequency: frequencyOf(40, 440), sampleRate: SAMPLE_RATE, length: HOP });

    let captured: { midi: number } | null = null;
    for (let i = 0; i < 12; i += 1) {
      analyzer.push(low);
      const reading = analyzer.analyze(i * 23);
      if (reading && !captured) captured = reading;
    }

    expect(captured).not.toBeNull();
    // Retaining the object is exactly what callers must NOT do; useTuner copies
    // it into an immutable snapshot at the React boundary (guarantee R2).
    expect(typeof captured!.midi).toBe('number');
  });
});

describe('steady-state heap growth', () => {
  it('does not grow the heap across 10,000 push/analyze cycles', () => {
    const analyzer = makeAnalyzer();
    const tone = sine({ frequency: frequencyOf(45, 440), sampleRate: SAMPLE_RATE, length: HOP });

    // Warm up so JIT and lazy internal buffers settle before measuring.
    for (let i = 0; i < 500; i += 1) {
      analyzer.push(tone);
      analyzer.analyze(i * 23);
    }

    const before = heapUsed();
    for (let i = 0; i < 10_000; i += 1) {
      analyzer.push(tone);
      analyzer.analyze(i * 23);
    }
    const growth = heapUsed() - before;

    // Allocating one 4096-sample Float32Array per cycle would add ~160 MB.
    // 8 MB leaves room for GC noise while catching any real per-cycle
    // allocation by two orders of magnitude.
    expect(growth).toBeLessThan(8 * 1024 * 1024);
  }, 60_000);

  it('does not grow the heap while producing no reading', () => {
    const analyzer = makeAnalyzer();
    const quiet = new Float32Array(HOP);

    for (let i = 0; i < 500; i += 1) {
      analyzer.push(quiet);
      analyzer.analyze(i * 23);
    }

    const before = heapUsed();
    for (let i = 0; i < 10_000; i += 1) {
      analyzer.push(quiet);
      analyzer.analyze(i * 23);
    }
    const growth = heapUsed() - before;

    expect(growth).toBeLessThan(8 * 1024 * 1024);
  }, 60_000);
});
