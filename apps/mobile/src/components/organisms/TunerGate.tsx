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
  const { start } = useTuner();
  const [accepted, setAccepted] = useState(false);

  const needsExplainer = permission === 'prompt' && !accepted;
  const ready = permission !== 'unknown' && !needsExplainer;

  useEffect(() => {
    if (ready) start();
  }, [ready, start]);

  useMicrophoneLifecycle(ready);

  if (permission === 'unknown') return null;

  if (needsExplainer) {
    return <PermissionPrompt onAllow={() => setAccepted(true)} />;
  }

  return <TunerDisplay />;
}
