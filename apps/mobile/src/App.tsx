import { TunerProvider } from '@chromatic-tuner/react';

import { RNAudioSource } from './adapters/rn-audio-source';
import { TunerScreen } from './components/screens/TunerScreen';

// A no-op stands in until the real wake lock lands in US3 (T073).
const wakeLock = {
  async acquire() {},
  async release() {},
};

const audioSource = new RNAudioSource();

export default function App() {
  return (
    <TunerProvider audioSource={audioSource} wakeLock={wakeLock}>
      <TunerScreen />
    </TunerProvider>
  );
}
