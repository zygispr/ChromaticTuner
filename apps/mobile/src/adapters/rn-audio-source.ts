import { AudioManager, AudioRecorder } from 'react-native-audio-api';

import type {
  AudioSource,
  AudioSourceConfig,
  AudioSourceError,
  AudioSourceInfo,
} from '@chromatic-tuner/core';

interface OnAudioReadyEvent {
  buffer: { getChannelData(channel: number): Float32Array };
  numFrames: number;
  when: number;
}

/**
 * What every `AudioRecorder` method resolves with — the library's `Result<T>`
 * (`react-native-audio-api/src/types.ts`), NOT a rejected promise.
 *
 * Declared here because the library's own types describe `start()` as
 * `Promise<Result<{}>>`, and `{}` accepts any object: a call site that never
 * looks at `status` type-checks perfectly while ignoring every failure the
 * platform reports.
 */
type RecorderResult = { status: 'success' } | { status: 'error'; message?: string };

/**
 * Mobile adapter for the {@link AudioSource} port, backed by
 * react-native-audio-api's AudioRecorder.
 *
 * React Native has no Web Audio API; this package supplies one for iOS and
 * Android, and its onAudioReady callback hands us the same shape of float PCM
 * the web worklet does. That symmetry is what lets `packages/core` stay
 * completely platform-agnostic (research D2).
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §1
 */
export class RNAudioSource implements AudioSource {
  private recorder: AudioRecorder | null = null;
  private interruptHandlers = new Set<(error: AudioSourceError) => void>();
  private running = false;

  async start(
    config: AudioSourceConfig,
    onFrames: (frames: Float32Array) => void
  ): Promise<AudioSourceInfo> {
    if (this.running) {
      // Obligation A7.
      throw { kind: 'unknown', message: 'Audio source already started' } satisfies AudioSourceError;
    }

    try {
      // Refuse a blocked microphone before opening anything. `TunerSession`
      // retries this once a second for as long as the banner is up (FR-029), and
      // activating the `record` category interrupts whatever else the device is
      // playing — a tuner that cannot hear must not stop the user's music every
      // second to find that out again. Only an explicit 'Denied' short-circuits:
      // 'Undetermined' is what raises the iOS prompt when the recorder starts,
      // and blocking on it would mean the prompt could never appear.
      if ((await this.permissionStatus()) === 'Denied') {
        throw { kind: 'permission-denied', canRetry: true } satisfies AudioSourceError;
      }

      await this.openSession();

      const recorder = new AudioRecorder();
      this.recorder = recorder;

      recorder.onAudioReady(
        {
          sampleRate: config.sampleRate,
          bufferLength: config.bufferLength,
          channelCount: 1,
        },
        (event: OnAudioReadyEvent) => {
          // Only valid for the duration of this callback; the core copies into
          // its ring buffer immediately and never retains it (obligation A2).
          onFrames(event.buffer.getChannelData(0));
        }
      );

      const result = (await recorder.start()) as RecorderResult | undefined;

      // `start()` does not REJECT when the platform refuses it — it resolves
      // with `{ status: 'error', message }`, and iOS returns exactly that for a
      // microphone turned off in Settings, before it touches the engine
      // (`IOSAudioRecorder::start`). Reading the resolved value as success left
      // nothing for `TunerSession` to fail on, so it went to `listening`, took
      // the wake lock, and waited for frames that could never arrive: a tuner
      // that says "Listening — play a string" and cannot hear a thing. Reported
      // from a phone (obligation A3, guarantee S1).
      if (result?.status === 'error') {
        throw new Error(result.message ?? 'The recorder did not start.');
      }

      this.running = true;

      // Obligation A5. Unlike a browser, this library does not substitute a
      // rate: it resamples the hardware input to the rate requested for the
      // callback — AVAudioConverter on iOS, Oboe's converter on Android — and
      // builds the delivered buffer at that rate. So the requested rate IS the
      // rate the frames arrive at, and there is nothing to prefer over it.
      // `start()` reports no rate of its own; the `sampleRate` this used to read
      // off the result has never existed in the native payload.
      return { sampleRate: config.sampleRate };
    } catch (error) {
      await this.stop();
      throw await this.toAudioSourceError(error);
    }
  }

  async stop(): Promise<void> {
    if (!this.recorder) return;
    const recorder = this.recorder;
    this.recorder = null;
    this.running = false;

    try {
      await recorder.stop();
    } catch {
      // Already stopped, or the session was torn down by the OS. Nothing to
      // recover — but the handle is released either way, which is what A4 asks.
    }

    try {
      // Stopping the recorder does not surrender the audio session. Leaving it
      // active keeps the OS recording indicator lit and keeps other apps ducked
      // after the tuner is done, which is precisely what A4 and FR-033 forbid.
      await AudioManager.setAudioSessionActivity(false);
    } catch {
      // Deactivation fails when something else already claimed the session.
      // The tuner is stopped regardless, and that is all stop() promises.
    }
  }

  /**
   * Put iOS into a state where the microphone actually produces samples.
   *
   * `react-native-audio-api` defaults its session to `Playback`
   * (AudioSessionManager.mm), a category that cannot record. Nothing fails
   * loudly when a recorder is started under it — `start()` resolves, frames
   * arrive, and every sample is zero — so the tuner sits in `listening`
   * forever and the defect reads as "the app does not hear my guitar".
   *
   * The library's own NativeAudioRecorder notes that recording is only valid
   * once the session is active, and it never activates the session itself.
   * That makes this the adapter's job.
   */
  private async openSession(): Promise<void> {
    AudioManager.setAudioSessionOptions({
      // `record` rather than `playAndRecord`: this app never plays audio —
      // reference tones are explicitly out of scope — so requesting output
      // would interrupt whatever the user is listening to for no benefit.
      iosCategory: 'record',
      // The reason this is not `default`. `measurement` disables the input
      // chain iOS otherwise applies: automatic gain control, noise
      // suppression, and EQ. All three reshape the waveform, and the ±1 cent
      // accuracy budget is measured on the waveform — AGC in particular
      // pumps the amplitude of a decaying plucked string, which is the exact
      // signal this app exists to analyse.
      iosMode: 'measurement',
    });

    await AudioManager.setAudioSessionActivity(true);
  }

  onInterrupted(handler: (error: AudioSourceError) => void): () => void {
    this.interruptHandlers.add(handler);
    return () => this.interruptHandlers.delete(handler);
  }

  /**
   * The platform's own answer, or `null` when it cannot be read.
   *
   * `null` rather than a guess, because the two callers want opposite defaults:
   * one must not refuse to start on a state it could not read, and the other
   * must not claim the microphone is blocked on one.
   *
   * Wrapped in `Promise.resolve` for the same reason `useMicrophonePermission`
   * does it: a native module returning something other than a promise would
   * throw synchronously, past the catch.
   */
  private async permissionStatus(): Promise<string | null> {
    try {
      return await Promise.resolve(AudioManager.checkRecordingPermissions());
    } catch {
      return null;
    }
  }

  /** Called by the app's AppState/audio-focus wiring in US3 (T075). */
  notifyInterrupted(error: AudioSourceError): void {
    for (const handler of this.interruptHandlers) handler(error);
  }

  private async toAudioSourceError(error: unknown): Promise<AudioSourceError> {
    if (typeof error === 'object' && error !== null && 'kind' in error) {
      return error as AudioSourceError;
    }

    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    // Ask the platform before reading the message. iOS says "Microphone
    // permissions are not granted", but Android checks nothing before opening
    // the stream, so the same cause arrives from Oboe as "Failed to open audio
    // stream: ErrorInternal" — no word a string match can recognise. The
    // permission state is that question asked where it has an answer, and it
    // decides the one banner that names Settings (SC-014).
    const permission = await this.permissionStatus();
    if (permission !== null && permission !== 'Granted') {
      return { kind: 'permission-denied', canRetry: true };
    }

    if (lower.includes('permission') || lower.includes('denied')) {
      return { kind: 'permission-denied', canRetry: true };
    }
    if (lower.includes('busy') || lower.includes('in use')) {
      return { kind: 'microphone-busy' };
    }
    if (lower.includes('no microphone') || lower.includes('not found')) {
      return { kind: 'no-microphone' };
    }
    return { kind: 'unknown', message };
  }
}
