import { describe, expect, it } from 'vitest';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { frequencyOf, midiFromFrequency } from '../src/notes/frequency';
import { DISPLAY_RANGE_CENTS } from '../src/notes/state';
import {
  NOTE_HYSTERESIS_CENTS,
  ReadingFilter,
  type FilteredReading,
  type RawCandidate,
} from '../src/tuning/filters';
import { SAMPLE_RATE, collectReadings, noteSequence } from './fixtures/analyze';
import { dither, sweep, weakFundamental, withNoise } from './fixtures/signals';

/**
 * User Story 2 — retuning a string to a different note.
 *
 * The two behaviours under test are the filter chain's stages 2 and 4
 * (research D7): the octave sanity check that stops a weak fundamental being
 * reported an octave high, and the note-name hysteresis that stops the display
 * flickering while a string sits on a semitone boundary.
 *
 * Both are pure functions over a small state record, so most of this file drives
 * `ReadingFilter` directly with synthetic candidates — that is the only way to
 * pin down the exact boundary semantics. The sweep and dither cases then prove
 * the same behaviour survives a real detector on a real signal.
 */

const E2 = 40;
const EB2 = 39;
const D2 = 38;

/** One analysis hop at 44.1 kHz, so the clock these tests use is the real one. */
const HOP_MS = (1024 / SAMPLE_RATE) * 1000;

/** A candidate at a given real-valued MIDI position. */
function candidate(exactMidi: number, clarity = 0.98): RawCandidate {
  return { frequency: frequencyOf(exactMidi, 440), exactMidi, clarity };
}

/**
 * Drives a filter one hop at a time against a running clock.
 *
 * Timing is not incidental here: stage 5 releases the held value after 400 ms,
 * so a test that jumps its clock forward is silently testing the release path
 * instead of the one it names. Frame counts matter too — the median-of-5 means
 * a new position needs three frames to take over, which is a real property of
 * the chain, not a detail to work around.
 */
function feeder(filter: ReadingFilter) {
  let now = 0;
  return {
    /** Push `frames` hops of one position and return the last output. */
    push(exactMidi: number | null, { clarity = 0.98, frames = 1 } = {}): FilteredReading | null {
      let last: FilteredReading | null = null;
      for (let i = 0; i < frames; i += 1) {
        now += HOP_MS;
        last = filter.accept(exactMidi === null ? null : candidate(exactMidi, clarity), now);
      }
      return last;
    },
    /** Push enough hops to fill the median window with one position. */
    settle(exactMidi: number, clarity = 0.98): FilteredReading {
      const last = this.push(exactMidi, { clarity, frames: 5 });
      expect(last).not.toBeNull();
      return last!;
    },
    /** Skip time without delivering audio, e.g. to outlast the hold. */
    advance(ms: number): void {
      now += ms;
    },
  };
}

describe('stage 4: note-name hysteresis (FR-011)', () => {
  it('anchors the first confident reading to the nearest note', () => {
    const feed = feeder(new ReadingFilter());
    expect(feed.settle(40.2).displayedMidi).toBe(E2);
  });

  it('holds the displayed note past the midpoint by the hysteresis margin', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(40);

    // Just past the E2/D#2 midpoint but inside the margin: still E2, and the
    // marker is allowed to run past -50 cents to say so.
    const inside = feed.settle(39.5 - (NOTE_HYSTERESIS_CENTS - 1) / 100);
    expect(inside.displayedMidi).toBe(E2);
    expect((inside.exactMidi - inside.displayedMidi) * 100).toBeLessThan(-DISPLAY_RANGE_CENTS);
  });

  it('changes the displayed note once the margin is exceeded', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(40);
    expect(feed.settle(39.5 - (NOTE_HYSTERESIS_CENTS + 1) / 100).displayedMidi).toBe(EB2);
  });

  it('applies the margin symmetrically on the way back up', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(39.4); // locks to D#2

    // Back above the midpoint, but not yet by the margin.
    expect(feed.settle(39.5 + (NOTE_HYSTERESIS_CENTS - 1) / 100).displayedMidi).toBe(EB2);
    // Now past it.
    expect(feed.settle(39.5 + (NOTE_HYSTERESIS_CENTS + 1) / 100).displayedMidi).toBe(E2);
  });

  it('follows a jump of more than one semitone as soon as the median crosses', () => {
    // A player moving to a different string is not a boundary wobble; the
    // hysteresis must not make the display crawl there one semitone at a time.
    const feed = feeder(new ReadingFilter());
    feed.settle(40);
    expect(feed.push(45.1, { frames: 3 })?.displayedMidi).toBe(45);
  });

  it('re-anchors freshly after the signal is lost and the hold expires', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(40);

    feed.advance(500); // well past the 400 ms hold
    expect(feed.push(null)).toBeNull();

    expect(feed.settle(39.49).displayedMidi).toBe(EB2);
  });
});

describe('stage 2: octave sanity check (research D7)', () => {
  it('rejects a jump of exactly one octave when clarity is no better', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(E2);

    // The classic weak-fundamental failure: the detector latches the second
    // harmonic and reports E3.
    expect(feed.push(E2 + 12)?.displayedMidi).toBe(E2);
  });

  it('rejects a jump down an octave too', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(E2 + 12);
    expect(feed.push(E2)?.displayedMidi).toBe(E2 + 12);
  });

  it('accepts an octave jump when clarity is decisively better', () => {
    const feed = feeder(new ReadingFilter());
    // A marginal previous reading superseded by an unambiguous one is a genuine
    // change of note, not a harmonic error.
    feed.settle(E2, 0.91);
    expect(feed.push(E2 + 12, { clarity: 0.999, frames: 3 })?.displayedMidi).toBe(E2 + 12);
  });

  it('accepts a genuine octave change once the rejected reading outlives the hold', () => {
    // Rejection must not be a trap. Holding the old value forever would leave a
    // player who really did move an octave staring at the wrong note. The cost
    // of being careful is one hold period, not a permanent wrong answer.
    const feed = feeder(new ReadingFilter());
    feed.settle(E2);

    expect(feed.push(E2 + 12, { frames: 40 })?.displayedMidi).toBe(E2 + 12);
  });

  it('leaves non-octave jumps alone', () => {
    const feed = feeder(new ReadingFilter());
    feed.settle(E2);
    // A fifth is not a harmonic-lock signature; nothing should delay it beyond
    // the median's own three frames.
    expect(feed.push(47, { frames: 3 })?.displayedMidi).toBe(47);
  });

  it('never reports the harmonic for a weak-fundamental low E (T059)', () => {
    const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
    const signal = weakFundamental({
      frequency: frequencyOf(E2, 440),
      sampleRate: SAMPLE_RATE,
      length: SAMPLE_RATE, // one full second
    });

    const readings = collectReadings(analyzer, signal);
    expect(readings.length).toBeGreaterThan(5);
    for (const reading of readings) {
      expect(reading.midi).toBe(E2);
    }
  });

  it('does not let a transient harmonic lock reach the display', () => {
    // Two hops of the octave in the middle of an otherwise clean low E: exactly
    // what a decaying fundamental does to the detector for a moment.
    const feed = feeder(new ReadingFilter());
    feed.settle(E2);

    expect(feed.push(E2 + 12, { clarity: 0.99, frames: 2 })?.displayedMidi).toBe(E2);
    expect(feed.settle(E2).displayedMidi).toBe(E2);
  });
});

describe('semitone sweep E2 -> D2 (T057, V3)', () => {
  /** Six seconds is slower than a real retune, and slow is the hard case. */
  const SWEEP_LENGTH = SAMPLE_RATE * 6;

  function sweepReadings() {
    const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
    const signal = sweep({
      fromFrequency: frequencyOf(E2, 440),
      toFrequency: frequencyOf(D2, 440),
      sampleRate: SAMPLE_RATE,
      length: SWEEP_LENGTH,
    });
    return collectReadings(analyzer, signal);
  }

  it('changes the displayed name exactly once per boundary crossing', () => {
    expect(noteSequence(sweepReadings())).toEqual([E2, EB2, D2]);
  });

  it('sweeps the marker the full width between name changes', () => {
    const readings = sweepReadings();
    const middle = readings.filter((reading) => reading.midi === EB2);

    expect(middle.length).toBeGreaterThan(0);
    const cents = middle.map((reading) => reading.cents);
    // Sharp side first (just after the flip down from E2), then flat side.
    expect(Math.max(...cents)).toBeGreaterThan(DISPLAY_RANGE_CENTS - 10);
    expect(Math.min(...cents)).toBeLessThan(-(DISPLAY_RANGE_CENTS - 10));
  });

  it('changes the name once per boundary even on a noisy sweep', () => {
    // A clean synthetic sweep crosses each midpoint exactly once whether or not
    // hysteresis exists, so on its own it proves nothing. Noise is what makes
    // the detector jitter back and forth across the boundary, and jitter is the
    // whole reason FR-011 is a requirement.
    const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
    const signal = withNoise(
      sweep({
        fromFrequency: frequencyOf(E2, 440),
        toFrequency: frequencyOf(D2, 440),
        sampleRate: SAMPLE_RATE,
        length: SWEEP_LENGTH,
      }),
      20
    );

    expect(noteSequence(collectReadings(analyzer, signal))).toEqual([E2, EB2, D2]);
  });

  it('moves the marker monotonically downward within each note', () => {
    // A retune should look like one continuous slide, not a jitter. Allow a
    // small tolerance for detector noise; forbid a real reversal.
    const readings = sweepReadings();
    for (let i = 1; i < readings.length; i += 1) {
      const previous = readings[i - 1]!;
      const current = readings[i]!;
      if (current.midi !== previous.midi) continue;
      expect(current.cents - previous.cents).toBeLessThan(2);
    }
  });
});

describe('boundary dither produces no name changes (T058, FR-011)', () => {
  it('holds one name while a tone wobbles +/-2 cents across the E2/D#2 midpoint', () => {
    const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
    const midpointHz = frequencyOf(39.5, 440);
    const signal = dither({
      frequency: midpointHz,
      sampleRate: SAMPLE_RATE,
      length: SAMPLE_RATE * 3,
      cents: 2,
      rateHz: 4,
    });

    const readings = collectReadings(analyzer, signal);
    expect(readings.length).toBeGreaterThan(20);

    // Sanity: the fixture really is sitting on the boundary, so this test would
    // notice if the generator drifted.
    expect(midiFromFrequency(midpointHz, 440)).toBeCloseTo(39.5, 3);

    expect(noteSequence(readings)).toHaveLength(1);
  });

  it('holds one name for a wobble on either named side of the midpoint', () => {
    for (const offsetCents of [-4, 4]) {
      const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
      const signal = dither({
        frequency: frequencyOf(39.5 + offsetCents / 100, 440),
        sampleRate: SAMPLE_RATE,
        length: SAMPLE_RATE * 3,
        cents: 2,
        rateHz: 4,
      });

      expect(noteSequence(collectReadings(analyzer, signal))).toHaveLength(1);
    }
  });
});
