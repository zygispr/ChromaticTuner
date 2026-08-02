import { a11y, space, type } from '@chromatic-tuner/tokens';

import { themedVar } from '../../theme';

export interface PermissionPromptProps {
  readonly onAllow: () => void;
}

/**
 * Shown BEFORE the browser's own microphone prompt (FR-028).
 *
 * A system permission dialog with no context is the most common reason people
 * decline one, and a declined microphone is a tuner that cannot work at all. So
 * the app says what it wants and why first, and only calls `getUserMedia` when
 * the user chooses to continue.
 *
 * The privacy sentence is not decoration: FR-031 requires the app to state
 * plainly, at the point of asking, that audio is never recorded or transmitted.
 * It is the honest answer to the question the system prompt provokes.
 */
export function PermissionPrompt({ onAllow }: PermissionPromptProps) {
  return (
    <section
      data-testid="permission-prompt"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${space.md}px`,
        maxWidth: 460,
        textAlign: 'center',
        color: themedVar('text'),
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: `${type.centsSize}px`,
          fontWeight: type.weightBold,
        }}
      >
        Tune by ear-free listening
      </h1>

      <p style={{ margin: 0, fontSize: `${type.labelSize}px`, lineHeight: 1.6, opacity: 0.85 }}>
        The tuner needs your microphone to hear the string you play and measure how far it is from
        the note.
      </p>

      <p
        data-testid="privacy-note"
        style={{ margin: 0, fontSize: `${type.labelSize}px`, lineHeight: 1.6, opacity: 0.85 }}
      >
        Everything is analysed on your device. Audio is never recorded, never saved, and never sent
        anywhere — the tuner works with no network connection at all.
      </p>

      <button
        type="button"
        data-testid="allow-microphone"
        onClick={onAllow}
        style={{
          minHeight: a11y.minTouchTarget,
          minWidth: a11y.minTouchTarget * 4,
          marginTop: space.xs,
          padding: `${space.sm}px ${space.xl}px`,
          fontSize: `${type.labelSize}px`,
          fontWeight: type.weightMedium,
          color: themedVar('background'),
          background: themedVar('text'),
          border: 'none',
          borderRadius: space.sm,
          cursor: 'pointer',
        }}
      >
        Use the microphone
      </button>
    </section>
  );
}
