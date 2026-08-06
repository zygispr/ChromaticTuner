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

/**
 * One line box of banner text, pinned rather than left to the font.
 *
 * `TunerDisplay` reserves a fixed slot for this banner so the centred column
 * cannot re-centre when the banner appears, changes, or vanishes. That
 * reservation is only correct if a "line" is a known height — the slot used to
 * be `labelSize * 4`, which assumed a 16px line box while the browser was
 * actually giving the title ~18px and the steps 24px.
 */
export const STATUS_LINE_HEIGHT = type.labelSize * 1.5;

/**
 * The height `TunerDisplay` reserves, derived from what this banner renders.
 *
 * One title line, the gap, and one line of recovery text — the tallest ROUTINE
 * banner, which is the stopped state. That the recovery sentence fits on one
 * line even at the narrowest supported viewport is a REQUIREMENT, not luck: it
 * used to be a longer sentence that wrapped to two lines on any phone, putting
 * the banner at 74px against a 64px slot and shifting the whole centred column
 * ~5px on every Start/Stop. `layout-stability.spec.ts` asserts the fit at 360px
 * so a future edit to the copy fails a gate instead of quietly bringing the jump
 * back.
 *
 * Reserving MORE was the obvious fix and is not available: the tuner column has
 * about ten pixels of slack inside the smallest supported viewport (see
 * `vite.config.ts`), and a taller slot pushes the microphone control into the
 * scroll cue — which `fold.spec.ts` catches. Shortening the worst case was the
 * only direction with room in it, and it gives 8px back.
 *
 * Exported from here, not declared in `TunerDisplay`, so the reservation and the
 * thing being reserved for cannot drift apart. They did.
 *
 * The rare failure banners still grow past this, which remains the right trade —
 * those are terminal states where nothing is being tuned.
 */
export const STATUS_SLOT_PX = STATUS_LINE_HEIGHT * 2 + space.sm;

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
        steps: 'Choose Start listening to tune again.',
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
          lineHeight: `${STATUS_LINE_HEIGHT}px`,
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
            lineHeight: `${STATUS_LINE_HEIGHT}px`,
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
