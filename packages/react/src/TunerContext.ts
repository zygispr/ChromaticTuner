import { createContext } from 'react';

import type { AccidentalStyle, TunerSession } from '@chromatic-tuner/core';

/**
 * The resolved preference state, shared by every consumer.
 *
 * Held in the provider rather than fetched per hook so there is one source of
 * truth: the reference pitch the analyzer is using and the one the settings
 * screen shows are the same value, and FR-023's "everywhere a note is shown"
 * becomes structural rather than something each screen has to remember.
 */
export interface PreferencesContextValue {
  readonly a4Hz: number;
  readonly accidentalStyle: AccidentalStyle;
  /** Derived once, so no screen can forget the FR-022 indicator. */
  readonly isNonStandardReference: boolean;
  /**
   * True when the last write did not reach storage — a full quota, private
   * browsing, a revoked permission. Tuning is unaffected; the settings screen
   * can say the choice will not be remembered rather than lying by silence
   * (obligation P2, Principle I).
   */
  readonly persistenceFailed: boolean;

  /** Clamped to the supported range rather than rejected (guarantee R4). */
  readonly setA4Hz: (hz: number) => void;
  readonly setAccidentalStyle: (style: AccidentalStyle) => void;
  readonly reset: () => void;
}

export interface TunerContextValue {
  readonly session: TunerSession;
  readonly preferences: PreferencesContextValue;
}

/**
 * Null by default so `useTuner` can throw a useful error instead of returning
 * undefined and failing somewhere far away (guarantee R3).
 */
export const TunerContext = createContext<TunerContextValue | null>(null);
