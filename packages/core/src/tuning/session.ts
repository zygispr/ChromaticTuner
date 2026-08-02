import { PitchAnalyzer } from '../dsp/pitch-analyzer';
import type { AudioSource } from '../ports/audio-source';
import { isAudioSourceError } from '../ports/audio-source';
import type { WakeLock } from '../ports/wake-lock';
import type { TunerStatus } from '../types';
import { statusForAudioError } from '../types';

export interface TunerSessionDeps {
  readonly audioSource: AudioSource;
  readonly wakeLock: WakeLock;
  readonly a4Hz: number;
  /** Requested capture rate; the source reports the actual one (obligation A5). */
  readonly sampleRate?: number;
}

export type StatusHandler = (status: TunerStatus) => void;
export type ReadingHandler = (cents: number, clarity: number) => void;

const DEFAULT_SAMPLE_RATE = 44100;
const HOP_SIZE = 1024;

/**
 * Owns the tuner's state machine and the two output channels.
 *
 * The channels are deliberately asymmetric, and that asymmetry is the whole
 * performance design (research D6):
 *
 *   onStatusChange — DISCRETE. Note name, tuning state, permission problems.
 *                    Fires only on genuine change, so React re-renders rarely.
 *   onReading      — CONTINUOUS. ~43 times a second. Drives the marker
 *                    transform directly and never touches React state.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/core-api.md §3
 */
export class TunerSession {
  private readonly audioSource: AudioSource;
  private readonly wakeLock: WakeLock;
  private readonly requestedSampleRate: number;

  private analyzer: PitchAnalyzer;
  private a4Hz: number;

  private statusHandlers = new Set<StatusHandler>();
  private readingHandlers = new Set<ReadingHandler>();

  private currentStatus: TunerStatus = { kind: 'idle' };
  private running = false;
  private elapsedMs = 0;
  /** Serialises start/stop; see enqueue(). */
  private pending: Promise<void> = Promise.resolve();

  constructor(deps: TunerSessionDeps) {
    this.audioSource = deps.audioSource;
    this.wakeLock = deps.wakeLock;
    this.a4Hz = deps.a4Hz;
    this.requestedSampleRate = deps.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.analyzer = new PitchAnalyzer({
      sampleRate: this.requestedSampleRate,
      a4Hz: this.a4Hz,
    });
  }

  get status(): TunerStatus {
    return this.currentStatus;
  }

  /**
   * Begin listening. Idempotent.
   *
   * Never rejects: a failure to open the microphone is a state the user can act
   * on, not an exception for a caller to swallow (Principle I, guarantee S1).
   */
  start(): Promise<void> {
    return this.enqueue(() => this.doStart());
  }

  /** Stop listening and release the microphone and wake lock. Idempotent. */
  stop(): Promise<void> {
    return this.enqueue(() => this.doStop());
  }

  /**
   * Serialise start/stop so they can never overlap.
   *
   * Without this, a stop() issued while start() is still awaiting getUserMedia
   * tears down state that start() then re-assigns, leaving an orphaned stream
   * delivering frames to a session that believes it is stopped. React
   * StrictMode's double-invoked effects reproduce it every single mount, and a
   * user remounting quickly hits the same window.
   */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.pending = this.pending.then(operation, operation);
    return this.pending;
  }

  private async doStart(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.elapsedMs = 0;

    // Reset BEFORE the source can deliver anything. Resetting afterwards would
    // silently discard the first frames, which on a fast-starting source is
    // most of the audio the player just played.
    this.analyzer.reset();

    try {
      const info = await this.audioSource.start(
        { sampleRate: this.requestedSampleRate, bufferLength: HOP_SIZE },
        (frames) => this.handleFrames(frames)
      );

      // The platform may have substituted a different rate. Using the requested
      // one would put every reading off by a fixed ratio (obligation A5).
      if (info.sampleRate !== this.analyzer.sampleRate) {
        this.analyzer = new PitchAnalyzer({ sampleRate: info.sampleRate, a4Hz: this.a4Hz });
      }

      await this.wakeLock.acquire();
      this.setStatus({ kind: 'listening' });
    } catch (error) {
      this.running = false;
      this.setStatus(
        isAudioSourceError(error)
          ? statusForAudioError(error)
          : { kind: 'error', message: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async doStop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    await this.audioSource.stop();
    await this.wakeLock.release();
    this.analyzer.reset();
    this.setStatus({ kind: 'idle' });
  }

  /** Change the reference pitch without interrupting capture (guarantee N7). */
  setReferencePitch(a4Hz: number): void {
    this.a4Hz = a4Hz;
    this.analyzer.setReferencePitch(a4Hz);
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onReading(handler: ReadingHandler): () => void {
    this.readingHandlers.add(handler);
    return () => this.readingHandlers.delete(handler);
  }

  private handleFrames(frames: Float32Array): void {
    if (!this.running) return;

    this.analyzer.push(frames);
    this.elapsedMs += (frames.length / this.analyzer.sampleRate) * 1000;

    const reading = this.analyzer.analyze(this.elapsedMs);

    if (reading === null) {
      this.setStatus({ kind: 'listening' });
      return;
    }

    // Continuous channel first: the marker should move even when the discrete
    // status is unchanged.
    for (const handler of this.readingHandlers) {
      handler(reading.cents, reading.clarity);
    }

    // The analyzer REUSES its reading object, so storing it directly would make
    // currentStatus alias a live-mutating value — and every change comparison
    // would then compare the object with itself and see nothing. Compare first,
    // then publish a copy, so the common suppressed case still allocates
    // nothing (Principle V).
    const current = this.currentStatus;
    const changed =
      current.kind !== 'reading' ||
      current.reading.midi !== reading.midi ||
      current.reading.state !== reading.state;

    if (changed) {
      this.setStatus({ kind: 'reading', reading: { ...reading } });
    }
  }

  /**
   * Publish a status, suppressing no-op changes (guarantee S4).
   *
   * Without this, `reading` would be republished ~43 times a second and every
   * subscribed React tree would re-render at that rate — the exact cost this
   * architecture exists to avoid.
   */
  private setStatus(next: TunerStatus): void {
    if (!this.hasChanged(next)) return;
    this.currentStatus = next;
    for (const handler of this.statusHandlers) handler(next);
  }

  private hasChanged(next: TunerStatus): boolean {
    const current = this.currentStatus;
    if (current.kind !== next.kind) return true;

    // Within `reading`, only a change of NOTE is a discrete change. The cents
    // value moves constantly and belongs on the continuous channel.
    if (current.kind === 'reading' && next.kind === 'reading') {
      return (
        current.reading.midi !== next.reading.midi || current.reading.state !== next.reading.state
      );
    }

    if (current.kind === 'permission-denied' && next.kind === 'permission-denied') {
      return current.canRetry !== next.canRetry;
    }

    if (current.kind === 'error' && next.kind === 'error') {
      return current.message !== next.message;
    }

    return false;
  }
}
