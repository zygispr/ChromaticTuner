import type { WakeLock } from '../src/ports/wake-lock';

/**
 * Spying {@link WakeLock} double.
 *
 * `unsupported` models a platform with no wake lock at all. Per obligation W1
 * the calls still resolve — a missing wake lock degrades the experience, it
 * does not break the tuner.
 */
export class NoopWakeLock implements WakeLock {
  public acquireCount = 0;
  public releaseCount = 0;
  public held = false;

  constructor(public unsupported = false) {}

  async acquire(): Promise<void> {
    this.acquireCount += 1;
    if (this.unsupported) return;
    this.held = true;
  }

  async release(): Promise<void> {
    this.releaseCount += 1;
    this.held = false;
  }
}
