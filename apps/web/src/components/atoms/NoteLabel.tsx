import { type } from '@chromatic-tuner/tokens';

import { stateColorVar } from '../../theme';
import type { TuningState } from '@chromatic-tuner/core';

export interface NoteLabelProps {
  readonly note: string | null;
  readonly octave: number | null;
  readonly state: TuningState;
}

/**
 * The largest element on the screen. FR-017 requires it to be legible from
 * roughly a metre away on a phone standing on a music stand.
 */
export function NoteLabel({ note, octave, state }: NoteLabelProps) {
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
        fontSize: `${type.noteSize}px`,
        fontWeight: type.weightBold,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span>{note ?? '–'}</span>
      {octave !== null && (
        <span style={{ fontSize: `${type.centsSize}px`, fontWeight: type.weightMedium }}>
          {octave}
        </span>
      )}
    </div>
  );
}
