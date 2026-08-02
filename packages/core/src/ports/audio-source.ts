/**
 * The most important boundary in the project.
 *
 * Both platforms deliver mono Float32Array PCM in the -1.0..1.0 range — web via
 * an AudioWorkletProcessor, mobile via react-native-audio-api's AudioRecorder —
 * so the core never learns which platform it is running on.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §1
 */

export interface AudioSourceConfig {
  /** Requested sample rate. The ACTUAL rate comes back in AudioSourceInfo. */
  readonly sampleRate: number;
  /** Frames delivered per callback — the hop size. */
  readonly bufferLength: number;
}

/**
 * Typed failures. Each variant maps 1:1 onto a TunerStatus the UI can act on,
 * which is what makes SC-014's "zero dead ends" checkable.
 */
export type AudioSourceError =
  | { kind: 'permission-denied'; canRetry: boolean }
  | { kind: 'no-microphone' }
  | { kind: 'microphone-busy' }
  | { kind: 'unsupported' }
  | { kind: 'unknown'; message: string };

export interface AudioSourceInfo {
  /**
   * The rate audio is ACTUALLY arriving at, which may differ from the rate
   * requested — platforms silently substitute, and 48 kHz is common. Using the
   * requested rate instead would put every reading off by a fixed ratio
   * (obligation A5).
   */
  readonly sampleRate: number;
}

export interface AudioSource {
  /**
   * Begin capturing. Resolves once audio is flowing, or rejects with an
   * {@link AudioSourceError} — never a bare Error, never a silent failure.
   *
   * The `frames` buffer passed to `onFrames` is only valid FOR THE DURATION OF
   * THE CALLBACK. Implementations may reuse it. Consumers must copy
   * immediately and must not retain the reference (obligation A2).
   *
   * Calling start twice without an intervening stop rejects (obligation A7).
   */
  start(
    config: AudioSourceConfig,
    onFrames: (frames: Float32Array) => void
  ): Promise<AudioSourceInfo>;

  /**
   * Stop capturing. Idempotent. MUST release the OS microphone handle, not
   * merely detach the callback — the platform recording indicator must clear
   * (obligation A4, FR-033).
   */
  stop(): Promise<void>;

  /**
   * Fires when the platform revokes or loses input mid-session: a call, an
   * alarm, a device change, or revoked permission. Enables automatic recovery
   * without a restart (obligation A6, FR-029).
   *
   * @returns an unsubscribe function.
   */
  onInterrupted(handler: (error: AudioSourceError) => void): () => void;
}

/** Type guard for the typed error shape, for use at adapter boundaries. */
export function isAudioSourceError(value: unknown): value is AudioSourceError {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  const kind = (value as { kind: unknown }).kind;
  return (
    kind === 'permission-denied' ||
    kind === 'no-microphone' ||
    kind === 'microphone-busy' ||
    kind === 'unsupported' ||
    kind === 'unknown'
  );
}
