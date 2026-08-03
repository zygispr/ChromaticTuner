import { useTuner } from '@chromatic-tuner/react';
import { useEffect, useState } from 'react';

import { useMicrophoneLifecycle } from '../../useMicrophoneLifecycle';
import { useMicrophonePermission } from '../../useMicrophonePermission';
import { PermissionPrompt } from '../molecules/PermissionPrompt';
import { TunerDisplay } from './TunerDisplay';

/**
 * Decides whether the microphone explainer is needed before the tuner starts.
 *
 * Mirrors the web gate exactly (FR-018). Permission already granted → straight
 * to the tuner, against the two-second cold-start budget (FR-026). Otherwise
 * the explainer comes first, so the OS prompt never arrives unannounced
 * (FR-028, FR-031) — which matters more here than on the web, because the
 * mobile prompt is one-shot.
 *
 * A *denied* permission falls through to the tuner, where `StatusBanner` shows
 * the Settings path that actually applies. A second explainer for a prompt that
 * will never appear would be a dead end (SC-014).
 */
export function TunerGate() {
  const permission = useMicrophonePermission();
  const { start, stop } = useTuner();
  const [accepted, setAccepted] = useState(false);

  /**
   * Whether the user wants the microphone on (FR-036–FR-040).
   *
   * Mirrors the web gate exactly. Separate state rather than something derived
   * from the session, because `status.kind === 'idle'` cannot tell "the user
   * switched this off" apart from "this has not started yet" or "backgrounding
   * released it" — and the three need opposite handling on return to the
   * foreground.
   *
   * Not persisted: a tuner that silently does nothing on launch because of a
   * decision made last week looks broken (data-model.md).
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
  // microphone the user just switched off — silently reversing an explicit
  // decision the next time the app is backgrounded (FR-040).
  useMicrophoneLifecycle(active);

  if (permission === 'unknown') return null;

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
