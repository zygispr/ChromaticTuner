import { type } from '@chromatic-tuner/tokens';

import { themedVar } from '../../theme';

export interface CentsReadoutProps {
  readonly cents: number | null;
}

/**
 * Signed numeric deviation (FR-004).
 *
 * One of the two non-colour channels required by FR-015 — the tuning state must
 * never be readable only by colour.
 */
export function CentsReadout({ cents }: CentsReadoutProps) {
  const text = cents === null ? '–' : `${cents > 0 ? '+' : ''}${cents.toFixed(0)}`;

  return (
    <div
      data-testid="cents-readout"
      style={{
        color: themedVar('text'),
        fontSize: `${type.centsSize}px`,
        fontWeight: type.weightMedium,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
      }}
    >
      {text}
      {cents !== null && (
        <span style={{ fontSize: `${type.labelSize}px`, opacity: 0.7 }}> cents</span>
      )}
    </div>
  );
}
