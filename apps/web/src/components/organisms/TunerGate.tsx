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
  const { start } = useTuner();
  const [accepted, setAccepted] = useState(false);

  const needsExplainer = permission === 'prompt' && !accepted;
  const ready = permission !== 'unknown' && !needsExplainer;

  useEffect(() => {
    if (ready) start();
  }, [ready, start]);

  useMicrophoneLifecycle(ready);

  if (permission === 'unknown') {
    // One frame at most, while the permission query resolves. Rendering the
    // explainer here would make it flash for users who already granted access.
    return null;
  }

  if (needsExplainer) {
    return <PermissionPrompt onAllow={() => setAccepted(true)} />;
  }

  return <TunerDisplay />;
}
