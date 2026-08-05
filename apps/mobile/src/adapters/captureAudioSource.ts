import type {
  AudioSource,
  AudioSourceConfig,
  AudioSourceError,
  AudioSourceInfo,
} from '@chromatic-tuner/core';

/**
 * An {@link AudioSource} that emits a generated tone instead of opening the
 * microphone — used **only** by a screenshot-capture build (research D7).
 *
 * FR-100 requires store screenshots of the real running app showing a real
 * reading, and SC-039 requires the process to reproduce from a clean checkout.
 * Those two pull against each other for a tuner: with no signal it shows an
 * empty state, and with a live microphone it shows whatever the room is doing.
 *
 * The port boundary is what resolves it, and resolving exactly this is what the
 * boundary is for — Principle VI requires every I/O boundary to sit behind a
 * narrow interface with at least one test double. The app under capture is the
 * real app: real components, real filter chain, real render path. Only the
 * microphone is synthetic, and it is synthetic in the same way the end-to-end
 * suite's generated reference signals already are.
 *
 * **This must never reach a release build.** `EXPO_PUBLIC_*` values are inlined
 * at build time, so "it is only set locally" is a statement about a developer's
 * shell rather than about the artefact. Contract L12.3 asserts the artefact
 * itself, and that assertion is a deliverable of this feature (T047).
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §1.
 * Every obligation below is numbered against it and checked by the shared suite
 * in `packages/core/testing/port-contract-tests.ts`.
 */
export class CaptureAudioSource implements AudioSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private interruptHandlers = new Set<(error: AudioSourceError) => void>();
  private running = false;
  private phase = 0;

  /** A4 sitting a touch sharp, so a screenshot shows a live reading off centre. */
  constructor(private readonly frequency = 440 * Math.pow(2, 6 / 1200)) {}

  async start(
    config: AudioSourceConfig,
    onFrames: (frames: Float32Array) => void
  ): Promise<AudioSourceInfo> {
    if (this.running) {
      // Obligation A7.
      throw { kind: 'unknown', message: 'Audio source already started' } satisfies AudioSourceError;
    }

    this.running = true;

    // One buffer, reused for every callback — the steady-state audio path
    // allocates nothing (Principle V), and the port explicitly permits reuse
    // because consumers must copy within the callback (obligation A2).
    const frames = new Float32Array(config.bufferLength);
    const step = (2 * Math.PI * this.frequency) / config.sampleRate;
    const interval = Math.max(1, Math.round((config.bufferLength / config.sampleRate) * 1000));

    this.timer = setInterval(() => {
      for (let i = 0; i < frames.length; i += 1) {
        frames[i] = Math.sin(this.phase) * 0.5;
        this.phase += step;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
      }
      onFrames(frames);
    }, interval);

    // Obligation A5: the rate audio actually arrives at. Here it is the rate
    // requested, because this source generates it — but it is still reported
    // from `start()` rather than assumed by the caller.
    return { sampleRate: config.sampleRate };
  }

  async stop(): Promise<void> {
    // Obligation A4: idempotent, and releases everything it holds.
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  onInterrupted(handler: (error: AudioSourceError) => void): () => void {
    // Obligation A6. A generated tone is never interrupted, so this registers
    // the handler and never fires it — the unsubscribe must still work.
    this.interruptHandlers.add(handler);
    return () => this.interruptHandlers.delete(handler);
  }
}
