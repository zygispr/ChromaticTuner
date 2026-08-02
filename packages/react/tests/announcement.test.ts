import { describe, expect, it } from 'vitest';

import type { PitchReading, TunerStatus, TuningState } from '@chromatic-tuner/core';

import { readingAnnouncement, spellNoteForSpeech } from '../src/announcement';

/**
 * FR-020: state changes announced without spamming assistive technology.
 *
 * The "without spamming" half is enforced by where this is called from — the
 * discrete channel — and is tested at the component level. What is testable
 * here is the other half: that when something IS announced, it is one complete,
 * pronounceable sentence rather than a fragment.
 */

function reading(cents: number, state: TuningState): PitchReading {
  return { frequency: 82.41, midi: 40, cents, clarity: 0.99, state, timestamp: 0 };
}

function readingStatus(cents: number, state: TuningState): TunerStatus {
  return { kind: 'reading', reading: reading(cents, state) };
}

describe('spellNoteForSpeech', () => {
  it('turns musical glyphs into words a screen reader can pronounce', () => {
    // Screen readers handle ♯ and ♭ inconsistently — some say "number sign",
    // some drop them silently, which turns D♯ into D and makes the
    // announcement wrong rather than merely awkward.
    expect(spellNoteForSpeech('D♯')).toBe('D sharp');
    expect(spellNoteForSpeech('E♭')).toBe('E flat');
  });

  it('leaves natural notes alone', () => {
    for (const note of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      expect(spellNoteForSpeech(note)).toBe(note);
    }
  });
});

describe('readingAnnouncement', () => {
  it('says nothing when there is no reading', () => {
    expect(readingAnnouncement({ kind: 'idle' }, null, null)).toBeNull();
    expect(readingAnnouncement({ kind: 'listening' }, null, null)).toBeNull();
    expect(readingAnnouncement({ kind: 'no-microphone' }, 'E', 2)).toBeNull();
    // A reading with no note name is not announceable.
    expect(readingAnnouncement(readingStatus(0, 'in-tune'), null, 2)).toBeNull();
  });

  it('announces the note, the deviation, and what to do, in one sentence', () => {
    expect(readingAnnouncement(readingStatus(-20, 'flat'), 'E', 2)).toBe(
      'E 2, 20 cents flat. Tighten.'
    );
    expect(readingAnnouncement(readingStatus(20, 'sharp'), 'A', 2)).toBe(
      'A 2, 20 cents sharp. Loosen.'
    );
  });

  it('does not read out a deviation when the string is in tune', () => {
    // "E 2, 1 cents flat" is noise when the answer the player wants is "done".
    expect(readingAnnouncement(readingStatus(1, 'in-tune'), 'E', 2)).toBe('E 2, in tune.');
    expect(readingAnnouncement(readingStatus(-4, 'in-tune'), 'E', 2)).toBe('E 2, in tune.');
  });

  it('reports the magnitude, not the sign, since the word already carries it', () => {
    // "minus 20 cents flat" is doubly negative and easy to misparse aloud.
    const flat = readingAnnouncement(readingStatus(-33, 'flat'), 'G', 3);
    expect(flat).toContain('33 cents flat');
    expect(flat).not.toContain('-33');
  });

  it('spells accidentals in the announcement, not just in isolation', () => {
    expect(readingAnnouncement(readingStatus(-10, 'flat'), 'D♯', 2)).toBe(
      'D sharp 2, 10 cents flat. Tighten.'
    );
  });

  it('copes with a missing octave rather than saying "null"', () => {
    expect(readingAnnouncement(readingStatus(0, 'in-tune'), 'E', null)).toBe('E, in tune.');
  });

  it('rounds, so the sentence never contains a decimal to read out', () => {
    const announcement = readingAnnouncement(readingStatus(-20.4917, 'flat'), 'E', 2);
    expect(announcement).toBe('E 2, 20 cents flat. Tighten.');
  });
});
