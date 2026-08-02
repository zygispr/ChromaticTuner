import type {
  AudioSource,
  AudioSourceConfig,
  AudioSourceError,
  AudioSourceInfo,
} from '@chromatic-tuner/core';

import { createWorkletUrl } from '../worklets/pcm-capture-source';

/**
 * Web adapter for the {@link AudioSource} port.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/platform-ports.md §1
 */
export class WebAudioSource implements AudioSource {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private interruptHandlers = new Set<(error: AudioSourceError) => void>();
  private starting = false;

  async start(
    config: AudioSourceConfig,
    onFrames: (frames: Float32Array) => void
  ): Promise<AudioSourceInfo> {
    if (this.context || this.starting) {
      // Obligation A7.
      throw { kind: 'unknown', message: 'Audio source already started' } satisfies AudioSourceError;
    }
    this.starting = true;

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
        throw { kind: 'unsupported' } satisfies AudioSourceError;
      }

      this.stream = await this.requestStream();

      const context = new AudioContext({ sampleRate: config.sampleRate });
      this.context = context;
      // Autoplay policy can leave a fresh context suspended.
      if (context.state === 'suspended') await context.resume();

      const workletUrl = createWorkletUrl();
      try {
        await context.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      const node = new AudioWorkletNode(context, 'pcm-capture', {
        numberOfInputs: 1,
        // One (silent) output on purpose. A worklet with zero outputs is not
        // reachable from the destination, so Chrome never pulls it and
        // `process` is simply never called — the tuner sits in "listening"
        // forever with perfectly good audio arriving at the stream.
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        processorOptions: { hopSize: config.bufferLength },
      });
      this.node = node;

      node.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { type: string; frames?: Float32Array };
        if (data.type === 'frames' && data.frames) onFrames(data.frames);
      };

      this.source = context.createMediaStreamSource(this.stream);
      this.source.connect(node);

      // Keep the worklet in the render graph without making a sound: its output
      // goes through a muted gain node to the destination.
      const sink = context.createGain();
      sink.gain.value = 0;
      this.sink = sink;
      node.connect(sink);
      sink.connect(context.destination);

      this.watchForInterruption(this.stream);

      // Obligation A5: report the rate audio is ACTUALLY arriving at. Browsers
      // routinely substitute the hardware rate for the one requested, and using
      // the requested value would skew every reading by a fixed ratio.
      return { sampleRate: context.sampleRate };
    } catch (error) {
      await this.stop();
      throw this.toAudioSourceError(error);
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.sink) {
      this.sink.disconnect();
      this.sink = null;
    }
    if (this.stream) {
      // Stopping every track is what actually releases the microphone and
      // clears the browser's recording indicator (obligation A4, FR-033).
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  onInterrupted(handler: (error: AudioSourceError) => void): () => void {
    this.interruptHandlers.add(handler);
    return () => this.interruptHandlers.delete(handler);
  }

  private async requestStream(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        // These three are NOT optional. Browser voice processing is tuned for
        // speech and mangles a sustained musical tone — automatic gain control
        // alone can move a reading by several cents, producing a tuner that is
        // subtly and unreproducibly wrong.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
  }

  private watchForInterruption(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => {
        this.emitInterrupt({ kind: 'no-microphone' });
      });
      track.addEventListener('mute', () => {
        this.emitInterrupt({ kind: 'microphone-busy' });
      });
    }
  }

  private emitInterrupt(error: AudioSourceError): void {
    for (const handler of this.interruptHandlers) handler(error);
  }

  /** Normalise the browser's DOMException zoo into the typed port error (A3). */
  private toAudioSourceError(error: unknown): AudioSourceError {
    if (typeof error === 'object' && error !== null && 'kind' in error) {
      return error as AudioSourceError;
    }
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
        case 'SecurityError':
          return { kind: 'permission-denied', canRetry: true };
        case 'NotFoundError':
        case 'OverconstrainedError':
          return { kind: 'no-microphone' };
        case 'NotReadableError':
        case 'AbortError':
          return { kind: 'microphone-busy' };
        default:
          return { kind: 'unknown', message: error.message };
      }
    }
    return { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };
  }
}
