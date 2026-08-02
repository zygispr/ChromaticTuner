import { describe, expect, it } from 'vitest';

import { PitchAnalyzer } from '../src/dsp/pitch-analyzer';
import { frequencyOf } from '../src/notes/frequency';
import {
  DISPLAY_RANGE_CENTS,
  IN_TUNE_TOLERANCE_CENTS,
  directionCue,
  tuningStateOf,
} from '../src/notes/state';
import { NOTE_HYSTERESIS_CENTS } from '../src/tuning/filters';
import { SAMPLE_RATE, collectReadings } from './fixtures/analyze';
import { sweep } from './fixtures/signals';

describe('tuningStateOf', () => {
  it('reports no-reading when there is no measurement', () => {
    expect(tuningStateOf(null)).toBe('no-reading');
  });

  it('reports in-tune at dead centre', () => {
    expect(tuningStateOf(0)).toBe('in-tune');
  });

  it('treats the tolerance boundary as in tune, inclusively', () => {
    expect(tuningStateOf(IN_TUNE_TOLERANCE_CENTS)).toBe('in-tune');
    expect(tuningStateOf(-IN_TUNE_TOLERANCE_CENTS)).toBe('in-tune');
  });

  it('reports flat and sharp just outside the tolerance', () => {
    expect(tuningStateOf(IN_TUNE_TOLERANCE_CENTS + 0.001)).toBe('sharp');
    expect(tuningStateOf(-IN_TUNE_TOLERANCE_CENTS - 0.001)).toBe('flat');
  });

  it('reports flat below the target and sharp above it', () => {
    expect(tuningStateOf(-49)).toBe('flat');
    expect(tuningStateOf(-20)).toBe('flat');
    expect(tuningStateOf(20)).toBe('sharp');
    expect(tuningStateOf(49)).toBe('sharp');
  });

  it('never returns no-reading for a real measurement, however far off', () => {
    for (let cents = -50; cents <= 50; cents += 1) {
      expect(tuningStateOf(cents)).not.toBe('no-reading');
    }
  });
});

describe('directionCue', () => {
  it('tells the player to tighten when flat and loosen when sharp', () => {
    // FR-007: "left means flat" is not self-evident to a beginner, so the cue
    // must be explicit. This mapping exists in exactly one place.
    expect(directionCue('flat')).toBe('tighten');
    expect(directionCue('sharp')).toBe('loosen');
  });

  it('gives no direction when there is nothing to correct', () => {
    expect(directionCue('in-tune')).toBeNull();
    expect(directionCue('no-reading')).toBeNull();
  });

  it('stays consistent with tuningStateOf across every reportable deviation', () => {
    // Note-name hysteresis lets deviation run past +/-50 while a boundary note
    // is still being named, so the cue has to be defined out there too — that
    // is precisely where a retuning player is looking (User Story 2).
    const limit = DISPLAY_RANGE_CENTS + NOTE_HYSTERESIS_CENTS;

    for (let cents = -limit; cents <= limit; cents += 0.5) {
      const state = tuningStateOf(cents);
      const cue = directionCue(state);
      if (cents < -IN_TUNE_TOLERANCE_CENTS) {
        expect(cue).toBe('tighten');
      } else if (cents > IN_TUNE_TOLERANCE_CENTS) {
        expect(cue).toBe('loosen');
      } else {
        expect(cue).toBeNull();
      }
    }
  });
});

describe('direction cue across a multi-semitone retune (SC-008, T062)', () => {
  /** Every reading an E2 -> D2 sweep produces, paired with its cue. */
  function sweepCues() {
    const analyzer = new PitchAnalyzer({ sampleRate: SAMPLE_RATE, a4Hz: 440 });
    const signal = sweep({
      fromFrequency: frequencyOf(40, 440),
      toFrequency: frequencyOf(38, 440),
      sampleRate: SAMPLE_RATE,
      length: SAMPLE_RATE * 6,
    });

    return collectReadings(analyzer, signal).map((reading) => ({
      cents: reading.cents,
      cue: directionCue(tuningStateOf(reading.cents)),
    }));
  }

  it('never contradicts the side of the line the marker is on', () => {
    // The words and the marker are driven from the same cents value through the
    // same function, so this cannot drift — which is the point of FR-007 living
    // in exactly one place. This test is what makes that structural claim hold
    // against real detector output rather than against hand-picked numbers.
    for (const { cents, cue } of sweepCues()) {
      if (cue === 'tighten') expect(cents).toBeLessThan(0);
      if (cue === 'loosen') expect(cents).toBeGreaterThan(0);
    }
  });

  it('always gives a direction whenever the string is out of tune', () => {
    for (const { cents, cue } of sweepCues()) {
      if (Math.abs(cents) > IN_TUNE_TOLERANCE_CENTS) expect(cue).not.toBeNull();
    }
  });

  it('changes the cue only at genuine landmarks, never as a flicker', () => {
    // "Unsure which direction to keep turning" (SC-008) is what a flickering cue
    // causes. Over a full tone the cue should change only where something real
    // happens: entering and leaving each in-tune zone, and each name flip.
    const cues = sweepCues().map((entry) => entry.cue);

    const transitions: (string | null)[] = [];
    for (const cue of cues) {
      if (transitions[transitions.length - 1] !== cue) transitions.push(cue);
    }

    // E2 in tune -> flat -> (name flips to D#2) sharp -> in tune -> flat ->
    // (name flips to D2) sharp -> in tune. Three notes, no oscillation.
    expect(transitions).toEqual([null, 'tighten', 'loosen', null, 'tighten', 'loosen', null]);
  });
});

describe('constants', () => {
  it('uses the +/-5 cent tolerance from the spec (FR-008)', () => {
    expect(IN_TUNE_TOLERANCE_CENTS).toBe(5);
  });

  it('spans +/-50 cents so any pitch is representable (FR-006)', () => {
    expect(DISPLAY_RANGE_CENTS).toBe(50);
  });

  it('keeps the in-tune zone comfortably inside the display range', () => {
    expect(IN_TUNE_TOLERANCE_CENTS).toBeLessThan(DISPLAY_RANGE_CENTS);
  });
});
