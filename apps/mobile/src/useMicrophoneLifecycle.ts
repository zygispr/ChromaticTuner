import { useTuner } from '@chromatic-tuner/react';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Releases the microphone whenever the app is not in the foreground, and picks
 * it up again on return (FR-033).
 *
 * Mirrors the web hook (FR-018), but matters more here: iOS and Android both
 * show a persistent recording indicator, and an app that keeps it lit in the
 * background is one users uninstall. It also frees the audio session so a call
 * or another app can take it, which is half of behaving predictably when focus
 * is lost (FR-035).
 *
 * `inactive` — the iOS state during the app switcher or an incoming call — is
 * treated as backgrounded on purpose. Waiting for `background` means holding
 * the microphone through a phone call.
 *
 * @param active whether the tuner should be running at all right now
 */
export function useMicrophoneLifecycle(active: boolean): void {
  const { start, stop } = useTuner();

  useEffect(() => {
    if (!active) return;

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        start();
      } else {
        stop();
      }
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [active, start, stop]);
}
