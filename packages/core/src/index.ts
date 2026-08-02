/**
 * @chromatic-tuner/core
 *
 * Pure TypeScript domain and DSP layer. Imports of React, react-native, or any
 * DOM global are a lint error here — Constitution Principle VI.
 *
 * This barrel is the package's public surface, defined in
 * specs/001-chromatic-guitar-tuner/contracts/core-api.md. Anything not exported
 * below is internal and may change without notice.
 */

// --- Note math (contract §1) ---
export {
  A4_DEFAULT_HZ,
  A4_MAX_HZ,
  A4_MIN_HZ,
  MIDI_A0,
  MIDI_C8,
  MIDI_E1,
  MIDI_E6,
  frequencyOf,
  isGuaranteedAccurate,
  isSupportedMidi,
  midiFromFrequency,
  nearestNote,
  noteName,
  octaveOf,
  pitchClassOf,
} from './notes/frequency';

export {
  DISPLAY_RANGE_CENTS,
  IN_TUNE_TOLERANCE_CENTS,
  directionCue,
  tuningStateOf,
} from './notes/state';

// --- Domain types (data-model §2-§4) ---
export { statusForAudioError } from './types';
export type {
  AccidentalStyle,
  ActiveStatusKind,
  PitchReading,
  TunerStatus,
  TuningState,
} from './types';

// --- Platform ports (contracts/platform-ports.md) ---
export { isAudioSourceError } from './ports/audio-source';
export type {
  AudioSource,
  AudioSourceConfig,
  AudioSourceError,
  AudioSourceInfo,
} from './ports/audio-source';

export type { PreferencesStore, StoredPreferences } from './ports/preferences-store';
export type { WakeLock } from './ports/wake-lock';

// Phase 3 adds: RingBuffer, PitchAnalyzer (contract §2), TunerSession (§3).
// Phase 6 adds: the Preferences model (data-model §6).
