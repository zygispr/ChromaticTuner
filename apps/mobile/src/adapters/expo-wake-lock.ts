import type { WakeLock } from '@chromatic-tuner/core';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/** Namespaces the lock so it cannot collide with another keep-awake holder. */
const TAG = 'chromatic-tuner';

/**
 * Mobile adapter for the {@link WakeLock} port, backed by `expo-keep-awake`.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §3
 *
 * Neither method rejects (obligation W1), and both are idempotent: the session
 * binds the lock to its status, and a status can be re-published for reasons
 * that have nothing to do with the screen.
 */
export class ExpoWakeLock implements WakeLock {
  private held = false;

  async acquire(): Promise<void> {
    if (this.held) return;
    this.held = true;

    try {
      await activateKeepAwakeAsync(TAG);
    } catch {
      // The screen may dim; the tuner still works. Marking it held anyway keeps
      // acquire/release balanced, so a later release cannot leave a stray lock.
    }
  }

  async release(): Promise<void> {
    if (!this.held) return;
    this.held = false;

    try {
      await deactivateKeepAwake(TAG);
    } catch {
      // Already inactive, or the activity is gone. The lock is not held either
      // way, which is all release() promises.
    }
  }
}
