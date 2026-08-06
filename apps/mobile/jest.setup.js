// react-native-audio-api is a native module with no JS fallback, so it cannot
// load under jest-expo. Mock it at the boundary — the RNAudioSource adapter
// (T044) is the only code that touches it, and the shared port contract suite
// (T028) verifies the adapter's behaviour against this mock.
jest.mock('react-native-audio-api', () => {
  /**
   * The recorder REPORTS failure rather than throwing it.
   *
   * Every method resolves with the library's `Result<T>` union —
   * `{ status: 'success' } & T` or `{ status: 'error', message }`, declared in
   * `react-native-audio-api/src/types.ts` and assembled in
   * `AudioRecorderHostObject.cpp`. A refused microphone comes back that way:
   * `IOSAudioRecorder::start` returns `Err("Microphone permissions are not
   * granted")` before it touches the engine.
   *
   * This mock used to resolve with a bare `{ sampleRate: 48000 }`, a shape the
   * native module has never produced, and that fiction hid a real defect for as
   * long as it stood: the adapter read any resolved value as success, so a user
   * who had turned the microphone off in Settings got a tuner sitting on
   * "Listening — play a string" forever.
   */
  class MockAudioRecorder {
    /** Scripted by `__setRecorderStartResult`, so a test can refuse a start. */
    static startResult = { status: 'success' };
    /** The most recently constructed recorder, for tests that drive frames in. */
    static last = null;

    constructor() {
      this.onAudioReadyCallback = null;
      this.callbackOptions = null;
      this.started = false;
      MockAudioRecorder.last = this;
    }

    onAudioReady(options, callback) {
      this.callbackOptions = options;
      this.onAudioReadyCallback = callback;
    }

    async start() {
      if (MockAudioRecorder.startResult.status === 'error') {
        return MockAudioRecorder.startResult;
      }
      this.started = true;
      return { status: 'success' };
    }

    async stop() {
      this.started = false;
      return { status: 'success' };
    }

    /** Test helper: push a frame through as if the microphone produced it. */
    __emit(frames) {
      if (!this.onAudioReadyCallback) return;
      this.onAudioReadyCallback({
        // The library resamples the hardware input to the rate the callback was
        // configured with and builds the delivered buffer at that rate, so this
        // is the rate the frames genuinely arrive at (obligation A5).
        buffer: {
          sampleRate: this.callbackOptions?.sampleRate,
          getChannelData: () => frames,
        },
        numFrames: frames.length,
        when: 0,
      });
    }
  }

  return {
    AudioRecorder: MockAudioRecorder,
    AudioContext: class {},
    /** Refuse (or stop refusing) the next `start()`. `null` restores success. */
    __setRecorderStartResult: (result) => {
      MockAudioRecorder.startResult = result ?? { status: 'success' };
    },
    __lastRecorder: () => MockAudioRecorder.last,
    // Permission state drives whether the explainer is shown before the OS
    // prompt (FR-028). Granted by default so tests exercise the tuner itself;
    // the permission-gate test overrides it.
    AudioManager: {
      checkRecordingPermissions: jest.fn(async () => 'Granted'),
      requestRecordingPermissions: jest.fn(async () => 'Granted'),
      // The iOS session defaults to a playback-only category that silently
      // records nothing, so the adapter must configure and activate it before
      // capturing. Mocked as spies because that call is the thing under test.
      setAudioSessionOptions: jest.fn(),
      setAudioSessionActivity: jest.fn(async () => {}),
    },
  };
});

// AsyncStorage is a native module. The package ships its own in-memory mock,
// which is exactly the right fidelity here: the adapter is thin, and what needs
// proving is that it satisfies the port contract, not that the native store
// works.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(async () => {}),
}));

// Reanimated drives the marker on the UI thread, which has no equivalent under
// Jest. Its own shipped mock still initialises react-native-worklets, whose
// native module does not exist in this environment, so it cannot be used here.
//
// TuningLine uses exactly five APIs from this package, so they are mocked
// directly: animations resolve to their target value immediately, which is the
// right semantics for an integration test that asserts on rendered content
// rather than on intermediate animation frames.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');

  const AnimatedView = React.forwardRef((props, ref) =>
    React.createElement(View, { ...props, ref })
  );
  AnimatedView.displayName = 'Animated.View';

  const easingFn = () => 0;

  return {
    __esModule: true,
    default: { View: AnimatedView },
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (factory) => factory(),
    withTiming: (target) => target,
    Easing: { out: () => easingFn, quad: easingFn, linear: easingFn },
  };
});
