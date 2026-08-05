import { TunerProvider } from '@chromatic-tuner/react';

import { AsyncStoragePreferences } from './adapters/async-storage-preferences';
import { CaptureAudioSource } from './adapters/captureAudioSource';
import { ExpoWakeLock } from './adapters/expo-wake-lock';
import { RNAudioSource } from './adapters/rn-audio-source';
import { TunerScreen } from './components/screens/TunerScreen';

/**
 * The one configuration option this project has (004's Complexity Tracking).
 *
 * A store screenshot must show the real app displaying a real reading (FR-100)
 * and the process must reproduce from a clean checkout (SC-039). A tuner with no
 * signal shows an empty state and a tuner with a live microphone shows the room,
 * so `listing/scripts/capture-screenshots.mjs` builds with this set and swaps
 * the microphone for a generated tone. Everything above the port is the real
 * app.
 *
 * **Read here and nowhere else.** `EXPO_PUBLIC_*` values are inlined at build
 * time, which means "it is only set locally" describes a shell rather than an
 * artefact — so T047's build-output check asserts this flag and
 * `captureAudioSource` are absent from a release bundle, rather than trusting
 * the build to omit them.
 */
const CAPTURE_MODE = process.env['EXPO_PUBLIC_SCREENSHOT_CAPTURE'] === 'true';

const audioSource = CAPTURE_MODE ? new CaptureAudioSource() : new RNAudioSource();
const wakeLock = new ExpoWakeLock();
const preferences = new AsyncStoragePreferences();

/**
 * autoStart is off because `TunerGate` decides when to open the microphone:
 * immediately when permission is already held, or after the explainer when the
 * OS prompt is still to come (FR-028).
 */
export default function App() {
  return (
    <TunerProvider
      audioSource={audioSource}
      wakeLock={wakeLock}
      preferences={preferences}
      autoStart={false}
    >
      <TunerScreen />
    </TunerProvider>
  );
}
