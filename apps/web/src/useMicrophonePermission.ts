import { useEffect, useState } from 'react';

export type MicrophonePermission = 'unknown' | 'granted' | 'prompt' | 'denied';

/**
 * Tracks whether the site already holds microphone permission.
 *
 * This exists to reconcile two requirements that pull against each other:
 * FR-028 wants an explanation shown *before* the system prompt, and FR-026
 * wants a live tuner within two seconds of a cold start. Both hold if the
 * explainer is shown only when a prompt is actually coming — a returning user
 * who has already granted access goes straight to the tuner.
 *
 * `navigator.permissions` with the `microphone` name is unsupported in some
 * browsers (Safari, historically), and the honest fallback there is `prompt`:
 * showing the explainer unnecessarily costs one tap, while skipping it when a
 * prompt is coming is the failure FR-028 exists to prevent.
 *
 * The value updates live, so granting access in browser settings mid-session
 * moves the UI on without a reload (FR-029).
 */
export function useMicrophonePermission(): MicrophonePermission {
  const [permission, setPermission] = useState<MicrophonePermission>('unknown');

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (status && !cancelled) setPermission(status.state);
    };

    if (!navigator.permissions?.query) {
      setPermission('prompt');
      return;
    }

    navigator.permissions
      // `microphone` is not in every browser's PermissionName union, hence the
      // cast; an unsupported name rejects, which the catch below handles.
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        setPermission(result.state);
        result.addEventListener('change', onChange);
      })
      .catch(() => {
        if (!cancelled) setPermission('prompt');
      });

    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, []);

  return permission;
}
