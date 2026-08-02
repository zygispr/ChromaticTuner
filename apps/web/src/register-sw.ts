/**
 * Registers the offline service worker (FR-030, SC-011).
 *
 * Production only: `sw.js` is emitted by the build, and a stale precache in
 * front of the dev server is a confusing way to spend an afternoon.
 *
 * Registration is deliberately fire-and-forget and deferred until after load.
 * Nothing about the tuner depends on it, and the two-second cold-start budget
 * (FR-026) belongs to getting the microphone open, not to installing a cache.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline support this session. The tuner itself is unaffected, so
      // there is nothing to tell the user about.
    });
  });
}
