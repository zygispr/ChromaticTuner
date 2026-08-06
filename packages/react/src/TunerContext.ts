import { createContext } from 'react';

import type {
  AccidentalStyle,
  Appearance,
  AppearancePreference,
  TunerSession,
} from '@chromatic-tuner/core';

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

  /**
   * The appearance to RENDER — already resolved against the device (M9).
   *
   * Resolved once in the provider so no two surfaces can disagree about which
   * appearance is in effect. No component may call `resolveAppearance` itself,
   * and no component may consult the platform appearance directly.
   */
  readonly appearance: Appearance;
  /**
   * The appearance the user CHOSE, which is what the control shows as selected.
   *
   * Distinct from `appearance` because `'system'` is a real stored choice
   * (FR-119) and cannot be recovered from the resolved value: "dark, because
   * the device is dark" and "dark, because I said so" render identically and
   * must not be offered identically.
   */
  readonly appearancePreference: AppearancePreference;

  /** Clamped to the supported range rather than rejected (guarantee R4). */
  readonly setA4Hz: (hz: number) => void;
  readonly setAccidentalStyle: (style: AccidentalStyle) => void;
  readonly setAppearancePreference: (preference: AppearancePreference) => void;
  readonly reset: () => void;

  /**
   * False until storage has answered; true from then on, never false again
   * (M10).
   *
   * Narrow and load-bearing: the web app must not write `data-theme` from React
   * state before this is true. Writing the DEFAULT state's appearance on mount
   * would overwrite what the inline no-flash script correctly established, and
   * reintroduce the exact flash that script exists to prevent (FR-120).
   */
  readonly preferencesLoaded: boolean;
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
