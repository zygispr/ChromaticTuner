import { useEffect, useState } from 'react';
import { AudioManager } from 'react-native-audio-api';

export type MicrophonePermission = 'unknown' | 'granted' | 'prompt' | 'denied';

/**
 * Tracks whether the app already holds microphone permission.
 *
 * Deliberately the same four-value shape as the web hook, so both platforms
 * gate on identical logic and the flows cannot drift (FR-018).
 *
 * This reconciles FR-028 (explain before the system prompt) with FR-026 (live
 * tuner within two seconds of a cold start): the explainer is shown only when a
 * prompt is actually coming. A returning user goes straight to the tuner.
 *
 * There is no change event to subscribe to here as there is on the web, because
 * granting permission in Settings backgrounds the app — the check re-runs when
 * the app returns to the foreground, which `App.tsx` already handles by
 * restarting the session.
 */
export function useMicrophonePermission(): MicrophonePermission {
  const [permission, setPermission] = useState<MicrophonePermission>('unknown');

  useEffect(() => {
    let cancelled = false;

    // Wrapped rather than chained directly: a native module that returns
    // something other than a promise would otherwise throw synchronously, past
    // the catch below, and leave the gate stuck on `unknown` — a blank screen
    // with no way forward.
    Promise.resolve(AudioManager.checkRecordingPermissions())
      .then((status) => {
        if (cancelled) return;
        setPermission(status === 'Granted' ? 'granted' : status === 'Denied' ? 'denied' : 'prompt');
      })
      .catch(() => {
        // An unreadable permission state must not strand the user on a blank
        // screen. Assuming a prompt is coming costs one tap and is the safe
        // side of FR-028.
        if (!cancelled) setPermission('prompt');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return permission;
}
