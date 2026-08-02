import { createContext } from 'react';

import type { PreferencesStore, TunerSession } from '@chromatic-tuner/core';

export interface TunerContextValue {
  readonly session: TunerSession;
  /** Reserved for usePreferences in US4 (T083); unused by useTuner. */
  readonly preferences: PreferencesStore | null;
}

/**
 * Null by default so `useTuner` can throw a useful error instead of returning
 * undefined and failing somewhere far away (guarantee R3).
 */
export const TunerContext = createContext<TunerContextValue | null>(null);
