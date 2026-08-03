import type { TunerStatus } from '@chromatic-tuner/core';
import { a11y, space, type } from '@chromatic-tuner/tokens';

import { themedVar } from '../../theme';

export interface StatusBannerProps {
  readonly status: TunerStatus;
  readonly onRetry: () => void;
  /**
   * The user switched capture off, as opposed to it not having started yet.
   *
   * Both land the session in `idle`, and without this the deliberate stop shows
   * "Starting…" — telling the user the opposite of what just happened (FR-039).
   */
  readonly captureStopped?: boolean;
}

interface Recovery {
  readonly title: string;
  /** What the user should do next. Never absent for a failure (SC-014). */
  readonly steps: string | null;
  readonly canRetry: boolean;
}

/**
 * The recovery copy for every status the tuner can be parked in.
 *
 * Written out per status rather than derived, because a generic "something went
 * wrong, try again" is exactly the dead end SC-014 forbids: the user needs to
 * know which knob to turn, and that differs completely between a blocked
 * permission and a microphone another app is holding.
 */
function recoveryFor(status: TunerStatus): Recovery | null {
  switch (status.kind) {
    case 'reading':
      return null;

    case 'listening':
      return { title: 'Listening — play a string', steps: null, canRetry: false };

    case 'idle':
      return { title: 'Starting…', steps: null, canRetry: false };

    case 'requesting-permission':
      return { title: 'Waiting for microphone access…', steps: null, canRetry: false };

    case 'permission-denied':
      return {
        title: 'Microphone access is blocked',
        steps: status.canRetry
          ? 'Choose the padlock or camera icon in your browser’s address bar, allow the microphone for this site, then try again.'
          : 'Open your browser’s site settings for this page, set Microphone to Allow, then reload and try again.',
        canRetry: true,
      };

    case 'no-microphone':
      return {
        title: 'No microphone found',
        steps:
          'Connect a microphone or a headset with one, then try again. Built-in laptop microphones work well for tuning.',
        canRetry: true,
      };

    case 'microphone-busy':
      return {
        title: 'The microphone is in use',
        steps:
          'Another app or browser tab has the microphone — a video call or a recorder is the usual culprit. Close it, then try again.',
        canRetry: true,
      };

    case 'error':
      return {
        title: 'The tuner could not start',
        steps: `${status.message} Reloading the page usually clears this.`,
        canRetry: true,
      };
  }
}

/**
 * Explains any non-tuning state and offers the way out of it.
 *
 * The session retries recoverable failures on its own (FR-029), so this button
 * is a shortcut rather than the only escape — but it must exist, because
 * waiting with no visible control reads as a hang.
 */
export function StatusBanner({ status, onRetry, captureStopped = false }: StatusBannerProps) {
  const recovery = captureStopped
    ? {
        title: 'The microphone is off',
        steps: 'Choose Start listening when you want to tune again.',
        canRetry: false,
      }
    : recoveryFor(status);
  if (!recovery) return null;

  return (
    <div
      data-testid="status-banner"
      data-status={status.kind}
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${space.sm}px`,
        maxWidth: 460,
        textAlign: 'center',
        color: themedVar('text'),
      }}
    >
      <p
        data-testid="tuner-status"
        style={{
          margin: 0,
          fontSize: `${type.labelSize}px`,
          fontWeight: recovery.steps ? type.weightMedium : type.weightRegular,
          opacity: recovery.steps ? 1 : 0.7,
        }}
      >
        {recovery.title}
      </p>

      {recovery.steps && (
        <p
          data-testid="recovery-steps"
          style={{
            margin: 0,
            fontSize: `${type.labelSize}px`,
            opacity: 0.75,
            lineHeight: 1.5,
          }}
        >
          {recovery.steps}
        </p>
      )}

      {recovery.canRetry && (
        <button
          type="button"
          data-testid="retry-button"
          onClick={onRetry}
          style={{
            minHeight: a11y.minTouchTarget,
            minWidth: a11y.minTouchTarget * 2,
            marginTop: space.xs,
            padding: `${space.sm}px ${space.lg}px`,
            fontSize: `${type.labelSize}px`,
            fontWeight: type.weightMedium,
            color: themedVar('background'),
            background: themedVar('text'),
            border: 'none',
            borderRadius: space.sm,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
