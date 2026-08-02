import { useTuner } from '@chromatic-tuner/react';
import { useEffect } from 'react';

/**
 * Releases the microphone whenever the tuner is not in the foreground, and
 * picks it up again on return (FR-033).
 *
 * This is not an optimisation. A background tab holding a live `getUserMedia`
 * stream keeps the browser's recording indicator lit, which reads to the user
 * as an app listening to them for no reason — and it is the one privacy claim
 * on the explainer screen that the app could most easily contradict.
 *
 * `pagehide` is handled as well as `visibilitychange` because it is the only
 * one that fires reliably when a tab is discarded or the page enters the
 * back/forward cache on iOS Safari.
 *
 * @param active whether the tuner should be running at all right now
 */
export function useMicrophoneLifecycle(active: boolean): void {
  const { start, stop } = useTuner();

  useEffect(() => {
    if (!active) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        start();
      }
    };
    const onPageHide = () => stop();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [active, start, stop]);
}
