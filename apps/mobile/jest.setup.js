// react-native-audio-api is a native module with no JS fallback, so it cannot
// load under jest-expo. Mock it at the boundary — the RNAudioSource adapter
// (T044) is the only code that touches it, and the shared port contract suite
// (T028) verifies the adapter's behaviour against this mock.
jest.mock('react-native-audio-api', () => {
  class MockAudioRecorder {
    constructor() {
      this.onAudioReadyCallback = null;
      this.started = false;
    }

    onAudioReady(_options, callback) {
      this.onAudioReadyCallback = callback;
    }

    async start() {
      this.started = true;
      return { sampleRate: 44100 };
    }

    async stop() {
      this.started = false;
      return {};
    }

    /** Test helper: push a frame through as if the microphone produced it. */
    __emit(frames) {
      if (!this.onAudioReadyCallback) return;
      this.onAudioReadyCallback({
        buffer: { getChannelData: () => frames },
        numFrames: frames.length,
        when: 0,
      });
    }
  }

  return { AudioRecorder: MockAudioRecorder, AudioContext: class {} };
});

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(async () => {}),
}));
