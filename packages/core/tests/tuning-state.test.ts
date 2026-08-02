import { describe, expect, it } from 'vitest';

import {
  DISPLAY_RANGE_CENTS,
  IN_TUNE_TOLERANCE_CENTS,
  directionCue,
  tuningStateOf,
} from '../src/notes/state';

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

  it('stays consistent with tuningStateOf across the whole display range', () => {
    for (let cents = -DISPLAY_RANGE_CENTS; cents <= DISPLAY_RANGE_CENTS; cents += 0.5) {
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
