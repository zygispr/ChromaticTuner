/**
 * @chromatic-tuner/core/testing
 *
 * Test doubles and the shared port contract suite. Imported by test code only;
 * deliberately free of any test-runner dependency so the same contract suite
 * can be pointed at the Vitest-tested web adapters and the Jest-tested mobile
 * adapters alike (T045).
 */

export { ScriptedAudioSource } from './scripted-audio-source';
export type { ScriptedAudioSourceOptions } from './scripted-audio-source';

export { InMemoryPreferencesStore } from './in-memory-preferences-store';
export { NoopWakeLock } from './noop-wake-lock';

export {
  ALL_AUDIO_SOURCE_ERRORS,
  audioSourceContract,
  preferencesStoreContract,
  wakeLockContract,
} from './port-contract-tests';
export type {
  AudioSourceFactory,
  PreferencesStoreFactory,
  WakeLockFactory,
} from './port-contract-tests';
