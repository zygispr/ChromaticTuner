import { captureControlLabel } from '@chromatic-tuner/react';
import { a11y, motion, space, type } from '@chromatic-tuner/tokens';

import { themedVar } from '../../theme';

export interface MicrophoneToggleProps {
  readonly capturing: boolean;
  readonly onToggle: () => void;
}

/**
 * The persistent microphone control (FR-036–FR-039, FR-042).
 *
 * Replaces the one-shot "Use the microphone" button, which disappeared on press
 * and left no way to stop listening for the rest of the session. A tuner that
 * cannot be switched off is asking for more trust than it needs to.
 *
 * The label states what pressing will DO rather than what is currently true,
 * and deliberately carries no `aria-pressed` — see `captureControlLabel`, which
 * owns that reasoning and the copy for both platforms.
 *
 * Styled as a quiet tertiary control on purpose: it sits on the same screen as
 * a readout that must be legible from a metre away (FR-018, Principle IV), and
 * a loud button beside the note would compete with the one thing the player is
 * actually looking at.
 */
export function MicrophoneToggle({ capturing, onToggle }: MicrophoneToggleProps) {
  return (
    <button
      type="button"
      data-testid="microphone-toggle"
      data-capturing={String(capturing)}
      onClick={onToggle}
      style={{
        minHeight: a11y.minTouchTarget,
        minWidth: a11y.minTouchTarget * 3,
        padding: `${space.xs}px ${space.lg}px`,
        fontSize: `${type.labelSize}px`,
        fontWeight: type.weightMedium,
        color: themedVar('text'),
        background: 'transparent',
        border: `1px solid ${themedVar('line')}`,
        borderRadius: space.sm,
        cursor: 'pointer',
        transition: `border-color ${motion.colorMs}ms ${motion.easing}`,
      }}
    >
      {captureControlLabel(capturing)}
    </button>
  );
}
