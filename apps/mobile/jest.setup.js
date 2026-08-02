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
      // Deliberately NOT the rate the caller asked for. iOS substitutes 48 kHz
      // on some routes, and an adapter that echoes the requested rate back
      // would skew every reading by a fixed ratio (obligation A5).
      return { sampleRate: 48000 };
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

  return {
    AudioRecorder: MockAudioRecorder,
    AudioContext: class {},
    // Permission state drives whether the explainer is shown before the OS
    // prompt (FR-028). Granted by default so tests exercise the tuner itself;
    // the permission-gate test overrides it.
    AudioManager: {
      checkRecordingPermissions: jest.fn(async () => 'Granted'),
      requestRecordingPermissions: jest.fn(async () => 'Granted'),
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
