/**
 * @chromatic-tuner/react
 *
 * The shared React layer — the seam between shared business logic and
 * per-platform presentation. Everything down to and including useTuner() is
 * shared; components below it are written once per platform.
 *
 * React only: no DOM, no react-native primitives (lint-enforced).
 */

export { TunerProvider } from './TunerProvider';
export type { TunerProviderProps } from './TunerProvider';

export { useTuner } from './useTuner';
export type { UseTunerOptions, UseTunerResult } from './useTuner';

export { captureControlLabel, readingAnnouncement, spellNoteForSpeech } from './announcement';

export { showsCaptureControl } from './capture-control';

export { usePreferences } from './usePreferences';
export type { UsePreferencesResult } from './usePreferences';

export { TunerContext } from './TunerContext';
export type { PreferencesContextValue, TunerContextValue } from './TunerContext';
