import { useContext } from 'react';

import { TunerContext, type PreferencesContextValue } from './TunerContext';

export type UsePreferencesResult = PreferencesContextValue;

/**
 * The two persisted settings and the controls that change them.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/core-api.md §4
 *
 * `setA4Hz` clamps rather than rejecting (guarantee R4), so a slider dragged
 * past its end stop settles at the end stop instead of throwing the gesture
 * away. State lives in `TunerProvider`, which means the reference pitch shown
 * here and the one the analyzer is using cannot drift apart.
 */
export function usePreferences(): UsePreferencesResult {
  const context = useContext(TunerContext);
  if (context === null) {
    throw new Error(
      'usePreferences must be used inside a <TunerProvider>. Wrap your app root in one and pass it an AudioSource and a WakeLock.'
    );
  }

  return context.preferences;
}
