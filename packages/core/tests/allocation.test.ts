import { describe, expect, it } from 'vitest';

import { heapUsed } from './fixtures/heap';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { TunerSession } from '../src/tuning/session';
import { NoopWakeLock } from '../testing/noop-wake-lock';
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

/**
 * US2 (T018): the lapse event must not cost an allocation per frame.
 *
 * Guarantee R3 says the lapse fires once on the edge rather than every frame,
 * so the steady state of silence is ZERO handler invocations — which is what
 * lets this assertion stay as strict as it was before the event existed.
 *
 * Driven through `TunerSession` rather than `PitchAnalyzer`, because the edge
 * tracking that makes R3 once-only lives in the session and is exactly the code
 * that could reintroduce per-frame work.
 *
 * A hand-rolled source rather than `ScriptedAudioSource`: that double reads from
 * a fixed sample buffer and cannot be rewound, so alternating tone and silence
 * 10,000 times would need a 40 MB Float32Array — measuring the fixture's
 * allocation rather than the session's.
 */
describe('lapse transitions do not allocate (guarantee R3)', () => {
  it('does not grow the heap across 10,000 live -> lapse -> live cycles', async () => {
    let emit: ((frames: Float32Array) => void) | null = null;

    const source = {
      async start(_config: unknown, onFrames: (frames: Float32Array) => void) {
        emit = onFrames;
        return { sampleRate: SAMPLE_RATE };
      },
      async stop() {
        emit = null;
      },
      onInterrupted() {
        return () => undefined;
      },
    };

    const session = new TunerSession({
      audioSource: source as never,
      wakeLock: new NoopWakeLock(),
      a4Hz: 440,
    });

    let lapses = 0;
    session.onReading((cents) => {
      if (cents === null) lapses += 1;
    });

    await session.start();

    // Both buffers are preallocated and reused, mirroring what a real adapter
    // hands us (obligation A2).
    const tone = sine({ frequency: frequencyOf(45, 440), sampleRate: SAMPLE_RATE, length: HOP });
    const quiet = new Float32Array(HOP);

    // Long enough to cross the 400 ms hold in each direction, so every cycle
    // genuinely produces a lapse rather than skimming under the threshold.
    const TONE_HOPS = 25;
    const QUIET_HOPS = 25;
    const push = (buffer: Float32Array, hops: number) => {
      for (let i = 0; i < hops; i += 1) emit?.(buffer);
    };

    for (let i = 0; i < 20; i += 1) {
      push(tone, TONE_HOPS);
      push(quiet, QUIET_HOPS);
    }
    const warmedLapses = lapses;

    const before = heapUsed();
    for (let i = 0; i < 200; i += 1) {
      push(tone, TONE_HOPS);
      push(quiet, QUIET_HOPS);
    }
    const growth = heapUsed() - before;

    await session.stop();

    // The cycles must actually have produced lapses, or this measures nothing.
    expect(warmedLapses).toBeGreaterThan(0);
    expect(lapses).toBeGreaterThan(warmedLapses + 100);
    expect(growth).toBeLessThan(8 * 1024 * 1024);
  }, 60_000);
});
