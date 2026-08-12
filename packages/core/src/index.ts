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

// --- Dial geometry (007 contract §1-§2) ---
export { DIAL_SEGMENT_DEGREES, dialAngleDegrees, unwrapDegrees } from './notes/dial';

// --- Domain types (data-model §2-§4) ---
export { isFailureStatus, statusForAudioError } from './types';
export type {
  AccidentalStyle,
  ActiveStatusKind,
  Appearance,
  AppearancePreference,
  PitchReading,
  TunerDisplay,
  TunerStatus,
  TuningState,
} from './types';

// --- Appearance resolution (005 contract §1) ---
export { resolveAppearance } from './appearance';

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

// --- DSP (contract §2) ---
export { RingBuffer } from './dsp/ring-buffer';
export { PitchAnalyzer } from './dsp/pitch-analyzer';
export type { AnalyzerOptions } from './dsp/pitch-analyzer';

// --- Session orchestration (contract §3) ---
export { TunerSession } from './tuning/session';
export type {
  ReadingHandler,
  ScheduleRetry,
  StatusHandler,
  TunerSessionDeps,
} from './tuning/session';

// --- Preferences (data-model §6) ---
export {
  DEFAULT_PREFERENCES,
  PREFERENCES_SCHEMA_VERSION,
  PREFERENCES_STORAGE_KEY,
  clampA4Hz,
  isNonStandardReference,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from './preferences';
