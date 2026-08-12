import { useContext } from 'react';

import { TunerContext, type PreferencesContextValue } from './TunerContext';

export type UsePreferencesResult = PreferencesContextValue;

/**
 * The four persisted settings and the controls that change them.
 *
 * Contract: specs/001-chromatic-guitar-tuner/contracts/core-api.md §4, extended
 * by specs/005-dark-mode-toggle/contracts/appearance.md §3 and
 * specs/007-circular-tuner-display/contracts/tuner-display.md §4.
 *
 * `setA4Hz` clamps rather than rejecting (guarantee R4), so a slider dragged
 * past its end stop settles at the end stop instead of throwing the gesture
 * away. State lives in `TunerProvider`, which means the reference pitch shown
 * here and the one the analyzer is using cannot drift apart.
 *
 * The appearance comes back as TWO values, and picking the wrong one is the
 * easiest mistake at this seam:
 *
 * - `appearance` is resolved — `'light'` or `'dark'`, never `'system'`. This is
 *   what you render (M4, M9).
 * - `appearancePreference` is what the user chose, `'system'` included. This is
 *   what the control marks as selected, and the two are not interchangeable:
 *   "dark because the device is dark" and "dark because I said so" look the
 *   same but must not be offered the same (FR-119).
 *
 * `preferencesLoaded` says whether storage has answered yet (M10). Only the web
 * app needs it, and it needs it badly — see the field's own comment.
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
