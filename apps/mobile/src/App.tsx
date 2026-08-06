import type { AudioSource } from '@chromatic-tuner/core';
import { TunerProvider } from '@chromatic-tuner/react';
import { useColorScheme } from 'react-native';

import { AsyncStoragePreferences } from './adapters/async-storage-preferences';
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
 * **Why this is a `require` inside an `if`, and not a top-level import.**
 *
 * The first version of this read the flag at one call site and chose between two
 * statically imported sources. `pnpm --filter @chromatic-tuner/mobile
 * verify:release-bundle` — T047's L12.3 check — found that this shipped
 * `captureAudioSource.ts` in the release bundle anyway: Metro collects a
 * module's dependencies from its `import` statements, and a static import is in
 * the graph whether or not the value it binds is ever used. Choosing at runtime
 * decides which object is constructed; it does not decide what is bundled.
 *
 * `EXPO_PUBLIC_*` values are inlined as literals by `babel-preset-expo` before
 * Metro collects dependencies, so this condition constant-folds to `false` in
 * any build that does not set the flag and the `require` inside it is eliminated
 * with the branch. That is what keeps the capture source out of the artefact,
 * and asserting the artefact rather than the shell is the whole point of L12.3:
 * "it is only set locally" is a statement about a developer's environment.
 */
type CaptureModule = typeof import('./adapters/captureAudioSource');

function createAudioSource(): AudioSource {
  if (process.env.EXPO_PUBLIC_SCREENSHOT_CAPTURE === 'true') {
    // The no-require-imports rule is right in general and wrong here: only a
    // `require` can sit inside a branch the bundler folds away, and what this
    // line is for is what it keeps *out* of the release bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const capture = require('./adapters/captureAudioSource') as CaptureModule;
    return new capture.CaptureAudioSource();
  }

  return new RNAudioSource();
}

const audioSource = createAudioSource();
const wakeLock = new ExpoWakeLock();
const preferences = new AsyncStoragePreferences();

/**
 * autoStart is off because `TunerGate` decides when to open the microphone:
 * immediately when permission is already held, or after the explainer when the
 * OS prompt is still to come (FR-028).
 */
export default function App() {
  /**
   * The one place the OS appearance enters the tree (M9).
   *
   * `useAppearance()` in `theme.ts` used to call this hook itself, in every
   * component that needed a colour. Reading it once here and letting the
   * provider resolve it against the stored choice is what makes an explicit
   * preference able to win at all — a component asking the OS directly would
   * ignore the choice no matter what the provider decided (FR-116).
   */
  const deviceAppearance = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <TunerProvider
      audioSource={audioSource}
      wakeLock={wakeLock}
      preferences={preferences}
      deviceAppearance={deviceAppearance}
      autoStart={false}
    >
      <TunerScreen />
    </TunerProvider>
  );
}
