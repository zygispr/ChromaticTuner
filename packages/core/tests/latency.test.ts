import { describe, expect, it } from 'vitest';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { frequencyOf } from '../src/notes/frequency';
import { SAMPLE_RATE } from './fixtures/analyze';

/**
 * V7 / SC-002 / FR-027 — latency from a pitch change to the display moving.
 *
 * The quickstart calls V7 "manual, on device" and warns that measuring settle
 * time instead of first movement makes a passing implementation look like a
 * failure. Both numbers are dominated by the same deterministic term — the hop
 * size and the window length — so they are measured here rather than with a
 * stopwatch, which makes the budget a regression gate instead of a one-off
 * observation.
 *
 * What this does NOT cover is the render half: getting the number onto a
 * physical screen. That is V8's frame-timing measurement and the on-device
 * check, and it is small relative to the ~42 ms floor established here.
 */

const HOP = 1024;
const HOP_MS = (HOP / SAMPLE_RATE) * 1000;

/** A tone that changes pitch instantly, part-way through. */
function pitchStep(fromHz: number, toHz: number, stepAtSample: number, length: number) {
  const out = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    // Phase is accumulated, not recomputed, so the step is a change of
    // frequency and not also a discontinuity the detector could latch onto.
    phase += (2 * Math.PI * (i < stepAtSample ? fromHz : toHz)) / SAMPLE_RATE;
    out[i] = 0.8 * Math.sin(phase);
  }
  return out;
}

interface StepResponse {
  readonly firstMovementMs: number;
  readonly settleMs: number;
}

/**
 * Push a step through the analyzer and time the response.
 *
 * "First movement" is the first hop whose reading has moved a visible amount
 * from the pre-step value — the moment the marker starts travelling, which is
 * what a player perceives as responsiveness. "Settle" is when it arrives within
 * a cent of the new pitch.
 */
function measureStep(fromMidi: number, toCents: number): StepResponse {
  const fromHz = frequencyOf(fromMidi, 440);
  const toHz = fromHz * Math.pow(2, toCents / 1200);

  // Two seconds of settling before the step, so the filter chain is in steady
  // state and is not still converging when the change arrives.
  const stepAtSample = SAMPLE_RATE * 2;
  const signal = pitchStep(fromHz, toHz, stepAtSample, SAMPLE_RATE * 4);

  const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });

  let baseline: number | null = null;
  let firstMovementMs = Number.NaN;
  let settleMs = Number.NaN;
  let now = 0;

  for (let offset = 0; offset + HOP <= signal.length; offset += HOP) {
    analyzer.push(signal.subarray(offset, offset + HOP));
    now += HOP_MS;
    const reading = analyzer.analyze(now);
    if (!reading) continue;

    // The step lands at the END of the hop that contains it: the analyzer
    // cannot react to samples it has not been given yet.
    const hopEndSample = offset + HOP;
    if (hopEndSample <= stepAtSample) {
      baseline = reading.cents;
      continue;
    }
    if (baseline === null) continue;

    const msSinceStep = ((hopEndSample - stepAtSample) / SAMPLE_RATE) * 1000;
    const moved = Math.abs(reading.cents - baseline);

    if (Number.isNaN(firstMovementMs) && moved > 2) firstMovementMs = msSinceStep;
    if (Number.isNaN(settleMs) && Math.abs(reading.cents - (baseline + toCents)) < 1) {
      settleMs = msSinceStep;
    }
    if (!Number.isNaN(firstMovementMs) && !Number.isNaN(settleMs)) break;
  }

  return { firstMovementMs, settleMs };
}

/**
 * Measured budgets, and why they are not the quickstart's stated figures.
 *
 * V7 says "begins moving within 50 ms; fully settles within ~100 ms", derived
 * in research D3 from the 1024 hop and the 4096 window alone. That derivation
 * omitted the median-of-5 filter added in US1 (research D7 stage 3), which by
 * construction needs three of its five samples to be new before its output
 * moves — three hops, 69.6 ms, before the display can react at all.
 *
 * The binding requirement is FR-027 and Principle V: the on-screen reading MUST
 * update within 100 ms of a pitch change. First movement IS that update, and it
 * is measured below at ~67 ms. The thresholds here guard that requirement plus
 * a regression margin on settle; they are deliberately not set to the measured
 * values, which would make any regression invisible.
 *
 * Dropping the median window to 3 brings first movement to ~43 ms and settle to
 * ~113 ms — measured, not estimated. That trades outlier rejection for latency
 * and changes shipped DSP behaviour, so it is recorded as an option rather than
 * applied here.
 */
const FIRST_MOVEMENT_BUDGET_MS = 100;
const SETTLE_BUDGET_MS = 150;

describe('latency (V7, SC-002, FR-027)', () => {
  const response = measureStep(40, 40); // E2, stepped 40 cents sharp

  it('updates the reading within the 100 ms requirement (FR-027)', () => {
    expect(response.firstMovementMs).not.toBeNaN();
    expect(response.firstMovementMs).toBeLessThanOrEqual(FIRST_MOVEMENT_BUDGET_MS);
  });

  it('settles within the window-bound budget', () => {
    // The window is 4096 samples — 92.9 ms — and a full settle cannot beat
    // that. This is the number that looks like a failure if it is mistaken for
    // the first-movement figure, which is exactly what T093 warns about.
    expect(response.settleMs).not.toBeNaN();
    expect(response.settleMs).toBeLessThanOrEqual(SETTLE_BUDGET_MS);
  });

  it('reports first movement strictly sooner than settle', () => {
    // If these were ever equal the measurement would be meaningless — it would
    // mean the display jumps rather than travels.
    expect(response.firstMovementMs).toBeLessThan(response.settleMs);
  });

  it('holds across the guaranteed range, not just at one note', () => {
    for (const midi of [28, 40, 52, 64, 76, 88]) {
      const { firstMovementMs, settleMs } = measureStep(midi, 40);
      expect(firstMovementMs, `MIDI ${midi} first movement`).toBeLessThanOrEqual(
        FIRST_MOVEMENT_BUDGET_MS
      );
      expect(settleMs, `MIDI ${midi} settle`).toBeLessThanOrEqual(SETTLE_BUDGET_MS);
    }
  });
});
