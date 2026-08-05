import type { TunerStatus } from '@chromatic-tuner/core';

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
    // the status banner already says. Treating them as failures would make the
    // control blink out for the first frames of every launch.
    case 'idle':
    case 'requesting-permission':
    case 'listening':
    case 'reading':
      return false;
  }
}

/**
 * Whether the microphone control belongs on screen (FR-036, FR-039).
 *
 * `captureEnabled` is INTENT, and intent survives a failed start — so deriving
 * the control from it alone produced this defect: denying the browser's prompt
 * left "Try again" and "Stop listening" side by side, the second one asserting
 * that the tuner held the very microphone it had just failed to open.
 *
 * A failure screen therefore gets one control, not two. `StatusBanner` already
 * owns that screen — it explains the failure, gives the steps out of it, and its
 * button runs `retry()`; a capture control there could only offer the same
 * action under a second name.
 *
 * **This narrows FR-036**, which asks for a persistent control rather than a
 * one-shot one. The requirement's concern is a tuner that cannot be switched
 * off, and it is met: the control is absent only while the microphone is shut
 * and something else on screen is offering to open it, and it returns the
 * moment there is capture to stop. The state FR-036 was written for — a
 * user-initiated stop — always keeps it, whatever stale failure is showing.
 *
 * Shared rather than decided in each app's organism for the same reason the
 * label copy is: two platforms answering this differently is invisible by eye
 * and obvious to anyone who denies permission on both.
 */
export function showsCaptureControl(status: TunerStatus, captureEnabled: boolean): boolean {
  return !(captureEnabled && failedToOpen(status));
}
