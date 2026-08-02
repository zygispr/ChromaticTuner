import type {
  AudioSource,
  AudioSourceConfig,
  AudioSourceError,
  AudioSourceInfo,
} from '../src/ports/audio-source';

export interface ScriptedAudioSourceOptions {
  /** Samples to replay, hop by hop. Defaults to silence. */
  readonly samples?: Float32Array;
  /**
   * Rate to REPORT from start(), which may deliberately differ from the rate
   * requested — real platforms substitute, and obligation A5 requires the
   * actual rate to win.
   */
  readonly actualSampleRate?: number;
  /** Make start() reject with this error, to exercise the failure paths. */
  readonly failWith?: AudioSourceError;
}

/**
 * Deterministic {@link AudioSource} double.
 *
 * Frames are pumped explicitly rather than on a timer, so tests never depend on
 * wall-clock timing (Constitution Principle III: tests MUST be deterministic).
 *
 * It deliberately REUSES a single Float32Array across callbacks, exactly as the
 * real platforms are permitted to. A consumer that retains the reference
 * instead of copying will observe corrupted audio here — which is the point
 * (obligation A2).
 */
export class ScriptedAudioSource implements AudioSource {
  private readonly options: ScriptedAudioSourceOptions;
  private onFrames: ((frames: Float32Array) => void) | null = null;
  private interruptHandlers = new Set<(error: AudioSourceError) => void>();
  private scratch: Float32Array | null = null;
  private readIndex = 0;
  private running = false;

  /** Number of times stop() has actually released the microphone. */
  public releaseCount = 0;

  private resolveStarted!: () => void;
  /**
   * Resolves once start() has completed.
   *
   * Consumers such as TunerProvider start the source inside an effect, so tests
   * need a deterministic point to await rather than guessing with timers.
   */
  public readonly startedPromise: Promise<void>;

  constructor(options: ScriptedAudioSourceOptions = {}) {
    this.options = options;
    this.startedPromise = new Promise<void>((resolve) => {
      this.resolveStarted = resolve;
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(
    config: AudioSourceConfig,
    onFrames: (frames: Float32Array) => void
  ): Promise<AudioSourceInfo> {
    if (this.options.failWith) {
      throw this.options.failWith;
    }
    if (this.running) {
      // Obligation A7: never open a second stream.
      throw { kind: 'unknown', message: 'Audio source already started' } satisfies AudioSourceError;
    }

    this.running = true;
    this.onFrames = onFrames;
    this.readIndex = 0;
    this.scratch = new Float32Array(config.bufferLength);
    this.resolveStarted();

    return { sampleRate: this.options.actualSampleRate ?? config.sampleRate };
  }

  async stop(): Promise<void> {
    if (!this.running) return; // Idempotent.
    this.running = false;
    this.onFrames = null;
    this.scratch = null;
    this.releaseCount += 1;
  }

  onInterrupted(handler: (error: AudioSourceError) => void): () => void {
    this.interruptHandlers.add(handler);
    return () => this.interruptHandlers.delete(handler);
  }

  /** Deliver `hops` buffers of scripted audio. Returns frames actually sent. */
  pump(hops = 1): number {
    let sent = 0;
    for (let hop = 0; hop < hops; hop += 1) {
      if (!this.running || !this.onFrames || !this.scratch) break;

      const source = this.options.samples;
      for (let i = 0; i < this.scratch.length; i += 1) {
        this.scratch[i] =
          source && this.readIndex + i < source.length ? source[this.readIndex + i]! : 0;
      }
      this.readIndex += this.scratch.length;

      this.onFrames(this.scratch);
      sent += this.scratch.length;
    }
    return sent;
  }

  /** Simulate the platform revoking or losing input mid-session. */
  interrupt(error: AudioSourceError): void {
    for (const handler of this.interruptHandlers) handler(error);
  }
}
