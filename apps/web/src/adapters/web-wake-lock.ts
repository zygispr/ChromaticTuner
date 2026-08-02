import type { WakeLock } from '@chromatic-tuner/core';

/**
 * Web adapter for the {@link WakeLock} port, backed by the Screen Wake Lock API.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §3
 *
 * Nothing here ever rejects (obligation W1). The API is unavailable in some
 * browsers and is refused outright in others — in an inactive tab, on low
 * battery, or under a policy — and none of that should stop a tuner from
 * tuning. A dimming screen is a worse experience, not a broken one.
 */
export class WebWakeLock implements WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  /** What the session last asked for, which survives the browser dropping it. */
  private wanted = false;
  private onVisibilityChange: (() => void) | null = null;

  async acquire(): Promise<void> {
    this.wanted = true;
    this.watchVisibility();
    await this.request();
  }

  async release(): Promise<void> {
    this.wanted = false;
    this.unwatchVisibility();

    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel) return;

    try {
      await sentinel.release();
    } catch {
      // Already released, or the document went away. Either way the lock is
      // gone, which is all release() promises.
    }
  }

  private async request(): Promise<void> {
    if (this.sentinel || !this.wanted) return;
    if (!navigator.wakeLock) return;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // The session may have stopped while the request was in flight; holding
      // the lock then would keep the screen awake with the tuner switched off.
      if (!this.wanted) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      // The browser drops the lock on its own when the tab is hidden. Clearing
      // the reference means the visibility handler re-requests rather than
      // believing it still holds one.
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      // Refused. Documented as acceptable by obligation W1.
    }
  }

  /**
   * Re-acquire when the tab becomes visible again (obligation W3).
   *
   * Browsers release a screen wake lock whenever the document is hidden and
   * never restore it. Without this, switching tabs once and coming back leaves
   * the tuner running with the screen free to sleep — the exact failure
   * FR-034 describes, and one that only shows up in real use.
   */
  private watchVisibility(): void {
    if (this.onVisibilityChange) return;

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.wanted) void this.request();
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private unwatchVisibility(): void {
    if (!this.onVisibilityChange) return;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.onVisibilityChange = null;
  }
}
