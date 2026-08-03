import { useTuner } from '@chromatic-tuner/react';
import { useEffect, useState } from 'react';

import { useMicrophoneLifecycle } from '../../useMicrophoneLifecycle';
import { useMicrophonePermission } from '../../useMicrophonePermission';
import { PermissionPrompt } from '../molecules/PermissionPrompt';
import { TunerDisplay } from './TunerDisplay';

/**
 * Decides whether the microphone explainer is needed before the tuner starts.
 *
 * Permission already granted → straight to the tuner, no extra tap and no
 * wasted time against the two-second cold-start budget (FR-026). Otherwise the
 * explainer comes first, so the browser's own prompt never arrives unannounced
 * (FR-028, FR-031).
 *
 * A *denied* permission deliberately falls through to the tuner rather than to
 * the explainer: starting will fail, the session will surface
 * `permission-denied`, and `StatusBanner` will show the recovery steps that
 * actually apply — which is the useful screen, not a second explainer for a
 * prompt that will never appear.
 */
export function TunerGate() {
  const permission = useMicrophonePermission();
  const { start, stop } = useTuner();
  const [accepted, setAccepted] = useState(false);

  /**
   * Whether the user wants the microphone on (FR-036–FR-040).
   *
   * Separate state rather than something derived from the session, because
   * `status.kind === 'idle'` cannot tell "the user switched this off" apart
   * from "this has not started yet" or "backgrounding released it" — and the
   * three need opposite handling when the app returns to the foreground.
   *
   * Not persisted: a tuner that silently does nothing on launch because of a
   * decision made last week looks broken. The cost of not persisting is one
   * press (data-model.md).
   */
  const [captureEnabled, setCaptureEnabled] = useState(true);

  const needsExplainer = permission === 'prompt' && !accepted;
  const ready = permission !== 'unknown' && !needsExplainer;
  const active = ready && captureEnabled;

  useEffect(() => {
    if (active) start();
    else stop();
  }, [active, start, stop]);

  // Gated on `active`, not on `ready`. The lifecycle hook calls start() on every
  // return to the foreground, so passing `ready` here would reopen the
  // microphone the user just switched off, on the next tab switch, with no user
  // action — silently reversing an explicit decision (FR-040).
  useMicrophoneLifecycle(active);

  if (permission === 'unknown') {
    // One frame at most, while the permission query resolves. Rendering the
    // explainer here would make it flash for users who already granted access.
    return null;
  }

  if (needsExplainer) {
    return <PermissionPrompt onAllow={() => setAccepted(true)} />;
  }

  return (
    <TunerDisplay
      capturing={captureEnabled}
      onToggleCapture={() => setCaptureEnabled((on) => !on)}
    />
  );
}
