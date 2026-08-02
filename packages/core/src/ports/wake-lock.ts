/**
 * Keeps the screen awake while the tuner is listening (FR-034).
 *
 * A missing wake lock degrades the experience; it does not break the tuner. So
 * both methods are idempotent and MUST NOT reject on unsupported platforms
 * (obligation W1).
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §3
 */
export interface WakeLock {
  /** Idempotent. Resolves even where the platform has no wake lock at all. */
  acquire(): Promise<void>;

  /** Idempotent. Safe to call when no lock is held. */
  release(): Promise<void>;
}
