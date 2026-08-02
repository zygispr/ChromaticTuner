/**
 * Source for the PCM capture AudioWorkletProcessor, as a string.
 *
 * It is a string on purpose. An AudioWorkletGlobalScope cannot execute ESM
 * import statements, and bundler-specific URL imports (`?worker&url` and
 * friends) resolve differently in dev and in a production build — one of which
 * silently yields a module the worklet scope cannot run, leaving the tuner
 * listening forever with perfectly good audio arriving.
 *
 * A Blob URL sidesteps all of that: identical behaviour in dev, in the built
 * bundle, and under Playwright.
 *
 * The processor accumulates the browser's 128-frame quanta into a preallocated
 * hop buffer, so the main thread receives ~43 messages a second instead of
 * ~345 and the analyzer always gets a whole hop.
 */
export const PCM_CAPTURE_WORKLET_SOURCE = /* js */ `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const hopSize = (options && options.processorOptions && options.processorOptions.hopSize) || 1024;
    this._hop = new Float32Array(hopSize);
    this._fill = 0;
    this.port.postMessage({ type: 'ready', sampleRate: sampleRate });
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel || channel.length === 0) {
      // Keep the node alive: returning false would permanently stop it, and a
      // momentary gap in input is not a reason to tear down capture.
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      this._hop[this._fill++] = channel[i];
      if (this._fill === this._hop.length) {
        const copy = new Float32Array(this._hop);
        this.port.postMessage({ type: 'frames', frames: copy }, [copy.buffer]);
        this._fill = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
`;

/** Build a Blob URL for the processor. Caller is responsible for revoking it. */
export function createWorkletUrl(): string {
  const blob = new Blob([PCM_CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}
