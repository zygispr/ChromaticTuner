import type { TuningState } from '../types';

/**
 * Half-width of the in-tune zone, in cents (FR-008). A string within this of
 * its target reads as in tune, and the zone is drawn on the line so the player
 * can see the target they are aiming at.
 */
export const IN_TUNE_TOLERANCE_CENTS = 5;

/**
 * Half-width of the horizontal line, in cents (FR-006). +/-50 means any pitch
 * is representable: the marker sweeps the full width between one note and the
 * next, which is what makes retuning across a semitone legible (User Story 2).
 */
export const DISPLAY_RANGE_CENTS = 50;

/**
 * Classify a cents deviation into the state the whole UI keys off.
 *
 * This is the single source of the three redundant channels required by
 * FR-014/FR-015 — colour, marker position, and text all derive from it, which
 * is what structurally prevents colour-only communication.
 */
export function tuningStateOf(cents: number | null): TuningState {
  if (cents === null) return 'no-reading';
  if (Math.abs(cents) <= IN_TUNE_TOLERANCE_CENTS) return 'in-tune';
  return cents < 0 ? 'flat' : 'sharp';
}

/**
 * Which way to turn the peg.
 *
 * FR-007: "left means flat" is not self-evident to a beginner, so the app says
 * it outright. Defined here and nowhere else, so the words and the marker can
 * never disagree.
 */
export function directionCue(state: TuningState): 'tighten' | 'loosen' | null {
  switch (state) {
    case 'flat':
      return 'tighten';
    case 'sharp':
      return 'loosen';
    case 'in-tune':
    case 'no-reading':
      return null;
  }
}
