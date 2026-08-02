import { PitchDetector } from 'pitchy';

import { MIDI_A0, MIDI_C8, midiFromFrequency } from '../notes/frequency';
import { tuningStateOf } from '../notes/state';
import { ReadingFilter } from '../tuning/filters';
import type { PitchReading } from '../types';
import { RingBuffer } from './ring-buffer';

export interface AnalyzerOptions {
  readonly sampleRate: number;
  readonly a4Hz: number;
  /** Analysis window in samples. Must cover ~2 periods of the lowest target. */
  readonly windowSize?: number;
  /** Samples between analyses. Determines how often the display updates. */
  readonly hopSize?: number;
  readonly clarityThreshold?: number;
}

/**
 * 4096 samples at 44.1 kHz is 92.9 ms — the smallest power of two that holds
 * two periods of A0 (27.5 Hz), the bottom of the detection range (research D3).
 */
const DEFAULT_WINDOW_SIZE = 4096;

/**
 * 1024 samples is 23.2 ms, so the display updates ~43x/second. The window is
 * NOT the latency: after a pitch change the marker begins moving within
 * hop + compute + render (~42 ms) and settles once the window refills (~93 ms).
 */
const DEFAULT_HOP_SIZE = 1024;

/**
 * Wraps `pitchy` (McLeod Pitch Method) with the buffering and filtering the
 * product needs.
 *
 * Everything here is preallocated: the ring buffer, the linearisation scratch,
 * the detector's internal buffers, and the single reused PitchReading. The
 * steady-state path allocates nothing (Constitution Principle V, verified by
 * tests/allocation.test.ts).
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/core-api.md §2
 */
export class PitchAnalyzer {
  public readonly windowSize: number;
  public readonly hopSize: number;
  /** The rate this analyzer was built for — the ACTUAL capture rate (A5). */
  public readonly sampleRate: number;

  private a4Hz: number;

  private readonly ring: RingBuffer;
  /** Contiguous copy of the ring, because findPitch needs linear input. */
  private readonly window: Float32Array;
  private readonly detector: PitchDetector<Float32Array>;
  private readonly filter: ReadingFilter;

  /**
   * Lowest frequency at which phase refinement is trustworthy: the positive and
   * negative frequency images must be at least ~16 half-window bins apart, so
   * 2f > 16 * (sampleRate / half). About 172 Hz at 44.1 kHz with a 4096 window.
   */
  private readonly refineMinHz: number;

  /**
   * Hann window over one half-window, applied during phase refinement.
   *
   * A rectangular window's sidelobes only fall at 6 dB/octave, so on a tone
   * with a weak fundamental the much louder second harmonic leaks into the
   * fundamental's phase measurement and shifts it by over a cent. Hann's
   * sidelobes start 31 dB down and fall at 18 dB/octave, which pushes that
   * leakage below the noise floor. Precomputed once.
   */
  private readonly hann: Float64Array;

  private samplesSinceAnalysis = 0;

  /** Reused across every analysis. Callers MUST NOT retain it. */
  private readonly reading: PitchReading = {
    frequency: 0,
    midi: 0,
    cents: 0,
    clarity: 0,
    state: 'no-reading',
    timestamp: 0,
  };

  constructor(options: AnalyzerOptions) {
    this.sampleRate = options.sampleRate;
    this.a4Hz = options.a4Hz;
    this.windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.hopSize = options.hopSize ?? DEFAULT_HOP_SIZE;

    this.ring = new RingBuffer(this.windowSize);
    this.window = new Float32Array(this.windowSize);
    this.detector = PitchDetector.forFloat32Array(this.windowSize);
    this.filter = new ReadingFilter(
      options.clarityThreshold === undefined ? {} : { clarityThreshold: options.clarityThreshold }
    );
    this.refineMinHz = (8 * this.sampleRate) / (this.windowSize >> 1);

    const half = this.windowSize >> 1;
    this.hann = new Float64Array(half);
    for (let n = 0; n < half; n += 1) {
      this.hann[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (half - 1)));
    }
  }

  /** Copy one hop of samples in. Allocation-free. */
  push(frames: Float32Array): void {
    this.ring.write(frames);
    this.samplesSinceAnalysis += frames.length;
  }

  /**
   * Analyse the current window.
   *
   * **Complexity: O(n log n) per call**, n = windowSize (Principle VI, contract
   * N6). The terms, in order of cost:
   *
   * - `readInto` — O(n), two `Float32Array.set` calls over the ring.
   * - `findPitch` — O(n log n). MPM computes its NSDF via autocorrelation,
   *   which `pitchy` evaluates with an FFT; this dominates.
   * - `refine` — O(n), one pass with incremental complex rotation rather than
   *   per-sample trigonometry.
   * - the filter chain — O(1) amortised; the median sorts at most 5 elements.
   *
   * Allocation: none. Every buffer involved is preallocated in the constructor
   * and the returned reading is reused (Principle V, verified by
   * `tests/allocation.test.ts`).
   *
   * @param now milliseconds since analysis started
   * @returns the reused PitchReading, or null when there is no confident
   *          reading. Copy it if you need to retain it beyond this call.
   */
  analyze(now: number): PitchReading | null {
    if (!this.ring.isFull) return null;

    this.ring.readInto(this.window);
    this.samplesSinceAnalysis = 0;

    const [coarse, clarity] = this.detector.findPitch(this.window, this.sampleRate);

    // pitchy returns [0, 0] when it cannot determine a pitch at all.
    const frequency = coarse > 0 && clarity > 0 ? this.refine(coarse) : 0;

    const candidate =
      frequency > 0 && clarity > 0
        ? {
            frequency,
            exactMidi: midiFromFrequency(frequency, this.a4Hz),
            clarity,
          }
        : null;

    // Reject anything outside the detection range before it reaches the filter,
    // so a subharmonic or an aliased partial cannot become a confident reading.
    const inRange =
      candidate !== null &&
      candidate.exactMidi >= MIDI_A0 - 0.5 &&
      candidate.exactMidi <= MIDI_C8 + 0.5;

    const filtered = this.filter.accept(inRange ? candidate : null, now);
    if (filtered === null) return null;

    // The displayed note comes from the filter's hysteresis stage, not from
    // rounding: near a semitone boundary the two deliberately disagree, and
    // deviation must be measured against the note actually being NAMED or the
    // marker would contradict the label (FR-011).
    const midi = filtered.displayedMidi;
    const cents = (filtered.exactMidi - midi) * 100;

    this.reading.frequency = filtered.frequency;
    this.reading.midi = midi;
    this.reading.cents = cents;
    this.reading.clarity = filtered.clarity;
    this.reading.state = tuningStateOf(cents);
    this.reading.timestamp = now;

    return this.reading;
  }

  /**
   * Change the reference pitch without discarding buffered audio, so the
   * display does not blank while the user drags the A4 control (guarantee N7).
   */
  setReferencePitch(a4Hz: number): void {
    if (a4Hz === this.a4Hz) return;
    this.a4Hz = a4Hz;
    // The filter's history is in MIDI units derived from the old reference, so
    // it would otherwise fight the new one for the next few frames.
    this.filter.reset();
  }

  reset(): void {
    this.ring.reset();
    this.filter.reset();
    this.samplesSinceAnalysis = 0;
  }

  /**
   * Refine a coarse frequency estimate using the phase advance of the
   * fundamental across the window.
   *
   * MPM locates the period by interpolating the NSDF peak, which loses
   * precision when the period is only a few dozen samples: at E6 the lag is
   * ~33 samples, and on a harmonically rich tone the interpolated peak drifts
   * by 1-2 cents — enough to miss the constitution's +/-1 cent guarantee at the
   * top of the guaranteed band.
   *
   * Demodulating the window at the coarse frequency and comparing the phase of
   * its two halves recovers the residual directly. The phase advance over H
   * samples is 2*pi*delta*H/fs, so delta follows from one wrapped angle. The
   * unambiguous range is +/-fs/(2H) — about +/-10.8 Hz here, which is ~19 cents
   * at 1 kHz and far wider than MPM's error, so there is no wrap risk.
   *
   * Only applied above {@link refineMinHz}. Demodulation sees both the positive
   * and negative frequency images of a real signal, separated by 2f. Below that
   * threshold the images overlap within the half-window's resolution and the
   * measured phase is contaminated — at 41 Hz the images are under four bins
   * apart, and refining there makes the estimate several cents WORSE. MPM's
   * interpolation is at its best in exactly that regime (a long lag), so each
   * method is used where it is strong.
   *
   * Cost is one pass over the window using incremental rotation rather than
   * per-sample trig, and it allocates nothing.
   */
  private refine(coarseHz: number): number {
    const fs = this.sampleRate;
    const w = this.windowSize;
    const half = w >> 1;

    if (coarseHz < this.refineMinHz) return coarseHz;

    const omega = (2 * Math.PI * coarseHz) / fs;

    const cosStep = Math.cos(omega);
    const sinStep = Math.sin(omega);

    // (cos(omega*n), sin(omega*n)), advanced by complex multiplication.
    let cos = 1;
    let sin = 0;

    let re1 = 0;
    let im1 = 0;
    let re2 = 0;
    let im2 = 0;

    // Each half gets the same Hann shape, so the constant window phase cancels
    // in the difference and only the signal's own phase advance survives.
    for (let n = 0; n < w; n += 1) {
      if (n < half) {
        const x = this.window[n]! * this.hann[n]!;
        re1 += x * cos;
        im1 -= x * sin;
      } else {
        const x = this.window[n]! * this.hann[n - half]!;
        re2 += x * cos;
        im2 -= x * sin;
      }
      const nextCos = cos * cosStep - sin * sinStep;
      sin = sin * cosStep + cos * sinStep;
      cos = nextCos;
    }

    // Too little energy at the fundamental to trust a phase measurement.
    if (re1 * re1 + im1 * im1 === 0 || re2 * re2 + im2 * im2 === 0) return coarseHz;

    let delta = Math.atan2(im2, re2) - Math.atan2(im1, re1);
    // Wrap into (-pi, pi].
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta <= -Math.PI) delta += 2 * Math.PI;

    const offsetHz = (delta * fs) / (2 * Math.PI * half);

    // Distrust a correction larger than half the unambiguous range: that means
    // the coarse estimate was wrong in a way phase cannot fix (an octave error,
    // say), and applying it would turn a near-miss into a confident lie.
    const maxTrusted = fs / (4 * half);
    if (!Number.isFinite(offsetHz) || Math.abs(offsetHz) > maxTrusted) return coarseHz;

    return coarseHz + offsetHz;
  }
}
