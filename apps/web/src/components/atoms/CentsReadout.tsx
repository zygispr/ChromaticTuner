import { type } from '@chromatic-tuner/tokens';
import { useEffect, useRef } from 'react';

import { themedVar } from '../../theme';

export interface CentsReadoutProps {
  /** Latest discrete snapshot; null when there is no reading. */
  readonly cents: number | null;
  readonly subscribeToCents: (handler: (cents: number) => void) => () => void;
}

/**
 * How often the number is allowed to change, in milliseconds.
 *
 * Readings arrive ~43 times a second. Rewriting the digits that often makes the
 * last digit strobe on a held note, which fights FR-010's stability intent, so
 * the readout refreshes at 10 Hz instead. That is still far faster than a hand
 * turns a peg, so nothing about a retune is lost.
 */
const REFRESH_MS = 100;

function format(cents: number): string {
  return `${cents > 0 ? '+' : ''}${cents.toFixed(0)}`;
}

/**
 * Signed numeric deviation (FR-004).
 *
 * One of the two non-colour channels required by FR-015 — the tuning state must
 * never be readable only by colour.
 *
 * The number is driven from the CONTINUOUS channel and written straight to the
 * text node, for the same reason the marker's transform is (research D6): the
 * discrete snapshot only changes when the note name or the flat/in-tune/sharp
 * state does, so a readout bound to it sits frozen through most of a retune —
 * reading "-5" beside a marker parked at the far end of the line. React still
 * owns the no-reading case, which is genuinely discrete.
 */
export function CentsReadout({ cents, subscribeToCents }: CentsReadoutProps) {
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastWrittenAt = Number.NEGATIVE_INFINITY;
    let lastText = '';

    return subscribeToCents((next) => {
      const node = valueRef.current;
      if (!node) return;

      const now = performance.now();
      if (now - lastWrittenAt < REFRESH_MS) return;

      const text = format(next);
      if (text === lastText) return;

      lastWrittenAt = now;
      lastText = text;
      node.textContent = text;
    });
  }, [subscribeToCents]);

  return (
    <div
      data-testid="cents-readout"
      // Hidden from assistive technology: the number is rewritten 10 times a
      // second, and the announcer speaks the deviation once per change.
      aria-hidden="true"
      style={{
        color: themedVar('text'),
        fontSize: `${type.centsSize}px`,
        fontWeight: type.weightMedium,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
      }}
    >
      <span ref={valueRef}>{cents === null ? '–' : format(cents)}</span>
      {cents !== null && (
        <span style={{ fontSize: `${type.labelSize}px`, opacity: 0.7 }}> cents</span>
      )}
    </div>
  );
}
