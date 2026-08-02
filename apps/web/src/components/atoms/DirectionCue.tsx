import { space, type } from '@chromatic-tuner/tokens';

import { stateColorVar } from '../../theme';
import type { TuningState } from '@chromatic-tuner/core';

export interface DirectionCueProps {
  readonly direction: 'tighten' | 'loosen' | null;
  readonly state: TuningState;
}

const LABEL: Record<'tighten' | 'loosen', string> = {
  tighten: '↑ Tighten',
  loosen: '↓ Loosen',
};

/**
 * Says outright which way to turn the peg (FR-007).
 *
 * "Left means flat" is obvious to an experienced player and not at all obvious
 * to a beginner, so the app spells it out rather than relying on the marker's
 * position alone. This is also the third redundant channel for FR-015.
 */
export function DirectionCue({ direction, state }: DirectionCueProps) {
  const text = direction ? LABEL[direction] : state === 'in-tune' ? '✓ In tune' : ' ';

  return (
    <div
      data-testid="direction-cue"
      // Was a live region of its own. It announced "TIGHTEN" with no note to
      // attach it to, and competed with the status banner's region — so the
      // single announcer now owns all tuning speech (FR-020).
      aria-hidden="true"
      style={{
        color: stateColorVar[state],
        fontSize: `${type.labelSize}px`,
        fontWeight: type.weightMedium,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        minHeight: `${space.lg}px`,
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  );
}
