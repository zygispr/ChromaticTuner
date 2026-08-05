import type { TunerStatus } from '@chromatic-tuner/core';

/** What the microphone control should say, and what pressing it should do. */
export interface CaptureControlState {
  /**
   * Whether the microphone is actually open — what the label describes.
   *
   * Not the same thing as the user's intent, which is what the caller passes
   * in: intent survives a start that failed.
   */
  readonly capturing: boolean;
  /**
   * Pressing should retry the failed start rather than flip intent.
   *
   * Same path as the banner's "Try again", so the two controls on a failure
   * screen cannot come to mean different things.
   */
  readonly retries: boolean;
}

/**
 * Whether the session is parked on a failure to open, or keep, the microphone.
 *
 * Exhaustive on purpose: a new status kind must decide which side it falls on
 * rather than defaulting into "the microphone is fine".
 */
function failedToOpen(status: TunerStatus): boolean {
  switch (status.kind) {
    case 'permission-denied':
    case 'no-microphone':
    case 'microphone-busy':
    case 'error':
      return true;

    // `idle` and `requesting-permission` with intent on mean "starting", which
    // the status banner already says. Calling them not-capturing would flip the
    // label to "Start listening" for the first frames of every launch.
    case 'idle':
    case 'requesting-permission':
    case 'listening':
    case 'reading':
      return false;
  }
}

/**
 * Reconcile what the user asked for with what the microphone actually did
 * (FR-036, FR-039).
 *
 * `captureEnabled` is intent, and intent survives a failed start — so deriving
 * the control from it alone produced this defect: denying the browser's prompt
 * left "Try again" and "Stop listening" side by side, the second one asserting
 * that the tuner held the very microphone it had just failed to open. The label
 * names the action pressing will take, so on a failure screen it must offer to
 * start, and pressing it must actually try (FR-038).
 *
 * Shared rather than decided in each app's organism for the same reason the
 * label copy is: two platforms answering this differently is invisible by eye
 * and obvious to anyone who denies permission on both.
 */
export function captureControlState(
  status: TunerStatus,
  captureEnabled: boolean
): CaptureControlState {
  const blocked = captureEnabled && failedToOpen(status);
  return { capturing: captureEnabled && !blocked, retries: blocked };
}
