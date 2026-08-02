import { TunerProvider } from '@chromatic-tuner/react';

import { ExpoWakeLock } from './adapters/expo-wake-lock';
import { RNAudioSource } from './adapters/rn-audio-source';
import { TunerScreen } from './components/screens/TunerScreen';

const audioSource = new RNAudioSource();
const wakeLock = new ExpoWakeLock();

/**
 * autoStart is off because `TunerGate` decides when to open the microphone:
 * immediately when permission is already held, or after the explainer when the
 * OS prompt is still to come (FR-028).
 */
export default function App() {
  return (
    <TunerProvider audioSource={audioSource} wakeLock={wakeLock} autoStart={false}>
      <TunerScreen />
    </TunerProvider>
  );
}
