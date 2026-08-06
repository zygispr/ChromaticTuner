import { isFailureStatus, type TunerStatus } from '@chromatic-tuner/core';

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
 *
 * "Parked on a failure" is `isFailureStatus` in the core rather than a list kept
 * here, because `TunerSession.stop()` now turns on the same set — a status this
 * function reads as a failure is exactly one the session must not overwrite with
 * `idle` — and two copies of the list drifting apart is what produced the defect
 * that made it shared.
 */
export function showsCaptureControl(status: TunerStatus, captureEnabled: boolean): boolean {
  return !(captureEnabled && isFailureStatus(status));
}
