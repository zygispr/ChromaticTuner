import { type } from '@chromatic-tuner/tokens';

import { stateColorVar } from '../../theme';
import type { TuningState } from '@chromatic-tuner/core';

export interface NoteLabelProps {
  readonly note: string | null;
  readonly octave: number | null;
  readonly state: TuningState;
  /**
   * Any CSS length. The dial passes a container-relative expression so the note
   * scales with the circle it sits inside (FR-169); the line display passes
   * nothing and gets the token.
   */
  readonly size?: string;
}

/**
 * The largest element on the screen. FR-017 requires it to be legible from
 * roughly a metre away on a phone standing on a music stand.
 */
export function NoteLabel({ note, octave, state, size = `${type.noteSize}px` }: NoteLabelProps) {
  return (
    <div
      data-testid="note-label"
      // Hidden from assistive technology on purpose: this is one of four
      // visual channels for the same reading, and ScreenReaderAnnouncer
      // speaks all of them as a single sentence instead (FR-020).
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: '0.05em',
        color: stateColorVar[state],
        fontSize: size,
        fontWeight: type.weightBold,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span>{note ?? '–'}</span>
      {octave !== null && (
        // Relative to the note, not to the token, so the pair scales as one
        // block wherever it is drawn. `0.25em` is exactly the ratio the two
        // tokens already stood in — 32 of 128 — so nothing moves in the line
        // display, which passes no size at all.
        <span style={{ fontSize: '0.25em', fontWeight: type.weightMedium }}>{octave}</span>
      )}
    </div>
  );
}
