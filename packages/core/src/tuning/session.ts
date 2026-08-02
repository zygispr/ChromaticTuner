import { PitchAnalyzer } from '../dsp/pitch-analyzer';
import type { AudioSource, AudioSourceError } from '../ports/audio-source';
import { isAudioSourceError } from '../ports/audio-source';
import type { WakeLock } from '../ports/wake-lock';
import type { TunerStatus } from '../types';
import { statusForAudioError } from '../types';

/**
 * Schedules one deferred retry and returns a function that cancels it.
 *
 * Injected rather than assumed because `packages/core` compiles against `ES2022`
 * alone — no DOM, no Node types — and because Principle III forbids tests that
 * depend on the wall clock. Tests pass a manual scheduler and fire it by hand.
 */
export type ScheduleRetry = (callback: () => void, delayMs: number) => () => void;

export interface TunerSessionDeps {
  readonly audioSource: AudioSource;
  readonly wakeLock: WakeLock;
  readonly a4Hz: number;
  /** Requested capture rate; the source reports the actual one (obligation A5). */
  readonly sampleRate?: number;
  /** How long to wait before re-attempting a recoverable failure. */
  readonly retryDelayMs?: number;
  readonly scheduleRetry?: ScheduleRetry;
}

export type StatusHandler = (status: TunerStatus) => void;
export type ReadingHandler = (cents: number, clarity: number) => void;

const DEFAULT_SAMPLE_RATE = 44100;
const HOP_SIZE = 1024;

/**
 * Long enough not to hammer the platform's permission machinery, short enough
 * that a player who just granted access sees the tuner come alive rather than
 * wondering whether to reload (FR-029).
 */
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Default scheduler, reaching through `globalThis` because core has no ambient
 * timer types. Every host the app runs on — browser, React Native, Node —
 * provides these; a host that does not simply gets manual retry only.
 */
const defaultScheduleRetry: ScheduleRetry = (callback, delayMs) => {
  const host = globalThis as {
    setTimeout?: (cb: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
  };
  if (!host.setTimeout) return () => undefined;

  const handle = host.setTimeout(callback, delayMs);
  return () => host.clearTimeout?.(handle);
};

/**
 * Can waiting and trying again plausibly fix this?
 *
 * Permission and device availability change while the app is open, so those are
 * worth retrying — including a permission blocked in settings, because the user
 * may be walking over to settings right now. An unsupported platform will still
 * be unsupported in a second, and spinning on it only costs battery.
 */
function isRecoverable(status: TunerStatus): boolean {
  switch (status.kind) {
    case 'permission-denied':
    case 'no-microphone':
    case 'microphone-busy':
      return true;
    default:
      return false;
  }
}

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

  private readonly retryDelayMs: number;
  private readonly scheduleRetryWith: ScheduleRetry;
  private cancelRetry: (() => void) | null = null;
  /** Mirrors the wake lock's real state, so it is never double-acquired. */
  private wakeLockHeld = false;

  constructor(deps: TunerSessionDeps) {
    this.audioSource = deps.audioSource;
    this.wakeLock = deps.wakeLock;
    this.a4Hz = deps.a4Hz;
    this.requestedSampleRate = deps.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.scheduleRetryWith = deps.scheduleRetry ?? defaultScheduleRetry;
    this.analyzer = new PitchAnalyzer({
      sampleRate: this.requestedSampleRate,
      a4Hz: this.a4Hz,
    });

    // Subscribed for the session's lifetime rather than per start, because the
    // platform can revoke input at any moment and a handler attached only while
    // running would miss the very event it exists for (obligation A6, FR-035).
    this.audioSource.onInterrupted((error) => this.handleInterruption(error));
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
   * Attempt to open the microphone again after a failure.
   *
   * Called automatically on a schedule while a recoverable failure persists,
   * and directly by a "Try again" control. Both paths run the same code, so the
   * button cannot drift from the automatic behaviour (SC-014).
   */
  retry(): Promise<void> {
    return this.enqueue(() => this.doRetry());
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
    await this.openSource();
  }

  private async doRetry(): Promise<void> {
    this.cancelPendingRetry();
    if (this.running) return;
    await this.openSource();
  }

  /**
   * Open the microphone and go live, or turn the failure into a status.
   *
   * The single path into `listening`, shared by the first start and by every
   * recovery attempt, so a recovered session is indistinguishable from a fresh
   * one — which is what "without requiring the user to restart" means (FR-029).
   */
  private async openSource(): Promise<void> {
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

      this.setStatus({ kind: 'listening' });
    } catch (error) {
      this.running = false;
      this.fail(
        isAudioSourceError(error)
          ? statusForAudioError(error)
          : { kind: 'error', message: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * The platform took the microphone away mid-session (obligation A6, FR-035).
   *
   * The handler is deliberately thin and defers to the same queue as start and
   * stop: an interruption arriving while a start is still in flight would
   * otherwise tear down state that start is about to assign.
   */
  private handleInterruption(error: AudioSourceError): void {
    if (!this.running) return;
    void this.enqueue(() => this.doInterrupt(error));
  }

  private async doInterrupt(error: AudioSourceError): Promise<void> {
    // Several interruptions can arrive in the same tick — a device change often
    // ends and mutes every track at once. The first one ends the session; the
    // rest would only re-arm the retry.
    if (!this.running) return;
    this.running = false;

    // Release the handle rather than sitting on a dead one: the platform's
    // recording indicator must clear, and another app must be able to take the
    // device (obligation A4, FR-033).
    await this.audioSource.stop();
    this.analyzer.reset();
    this.fail(statusForAudioError(error));
  }

  /** Publish a failure and line up a recovery attempt if one could help. */
  private fail(status: TunerStatus): void {
    this.setStatus(status);
    this.cancelPendingRetry();
    if (!isRecoverable(status)) return;
    this.cancelRetry = this.scheduleRetryWith(() => {
      void this.retry();
    }, this.retryDelayMs);
  }

  private cancelPendingRetry(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  private async doStop(): Promise<void> {
    // Cancel first and unconditionally: stopping while parked in an error state
    // must not leave a retry armed to reopen the microphone behind the user's
    // back, which is exactly what backgrounding the app relies on (FR-033).
    this.cancelPendingRetry();

    if (this.running) {
      this.running = false;
      await this.audioSource.stop();
      this.analyzer.reset();
    }

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
    this.syncWakeLock(next);
    for (const handler of this.statusHandlers) handler(next);
  }

  /**
   * Hold the wake lock exactly while the tuner is active (T074, guarantee W2).
   *
   * Deriving this from the status rather than calling acquire/release alongside
   * start and stop is what makes it correct on the paths nobody thinks about:
   * an interruption, a failed recovery, a permission revoked mid-session. A
   * tuner showing "microphone busy" is not tuning anything, and holding the
   * screen awake there is pure battery drain (FR-034).
   */
  private syncWakeLock(status: TunerStatus): void {
    const shouldHold = status.kind === 'listening' || status.kind === 'reading';
    if (shouldHold === this.wakeLockHeld) return;
    this.wakeLockHeld = shouldHold;

    const operation = shouldHold ? this.wakeLock.acquire() : this.wakeLock.release();
    void operation.catch(() => {
      // Obligation W1: no wake lock is a degraded screen, never a broken tuner.
      // The port promises not to reject; this is belt and braces for an adapter
      // that breaks that promise, and swallowing it here is the correct scope.
    });
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
