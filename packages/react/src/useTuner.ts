import { useCallback, useContext, useEffect, useState } from 'react';

import {
  directionCue,
  noteName,
  octaveOf,
  tuningStateOf,
  type AccidentalStyle,
  type TunerStatus,
  type TuningState,
} from '@chromatic-tuner/core';

import { TunerContext } from './TunerContext';

export interface UseTunerResult {
  /** Discrete: drives re-renders. Changes rarely. */
  readonly status: TunerStatus;
  readonly note: string | null;
  readonly octave: number | null;
  readonly tuningState: TuningState;
  readonly direction: 'tighten' | 'loosen' | null;
  /** Last settled deviation, for the text readout. Not the animation source. */
  readonly cents: number | null;

  /**
   * CONTINUOUS channel, ~43 Hz. Subscribing does NOT cause a re-render and the
   * callback must not set React state — drive a transform or a Reanimated
   * shared value directly (guarantee R1, research D6).
   *
   * @returns an unsubscribe function.
   */
  readonly subscribeToCents: (handler: (cents: number) => void) => () => void;

  readonly start: () => void;
  readonly stop: () => void;

  /**
   * Try the microphone again after a failure.
   *
   * The session already retries on its own while a recoverable failure lasts
   * (FR-029); this is the same path, exposed so a "Try again" control can skip
   * the wait. Every failure state offers it, which is how SC-014's "zero dead
   * ends" is satisfied rather than merely claimed.
   */
  readonly retry: () => void;
}

export interface UseTunerOptions {
  /**
   * Override the user's stored accidental preference for this consumer only.
   *
   * Rarely wanted: FR-023 requires the choice to apply everywhere a note is
   * shown, and the default already reads it from the provider. It exists for
   * tests and for a hypothetical side-by-side comparison.
   */
  readonly accidentalStyle?: AccidentalStyle;
}

export function useTuner(options: UseTunerOptions = {}): UseTunerResult {
  const context = useContext(TunerContext);
  if (context === null) {
    throw new Error(
      'useTuner must be used inside a <TunerProvider>. Wrap your app root in one and pass it an AudioSource and a WakeLock.'
    );
  }

  const { session } = context;
  // Defaults to the user's stored choice rather than to 'sharp', so FR-023's
  // "everywhere a note is shown" holds by construction: any screen using this
  // hook already spells accidentals the way the user asked.
  const accidentalStyle = options.accidentalStyle ?? context.preferences.accidentalStyle;

  const [status, setStatus] = useState<TunerStatus>(session.status);

  useEffect(() => {
    setStatus(session.status);
    return session.onStatusChange(setStatus);
  }, [session]);

  const subscribeToCents = useCallback(
    (handler: (cents: number) => void) => session.onReading((cents) => handler(cents)),
    [session]
  );

  const start = useCallback(() => {
    void session.start();
  }, [session]);

  const stop = useCallback(() => {
    void session.stop();
  }, [session]);

  const retry = useCallback(() => {
    void session.retry();
  }, [session]);

  // The session publishes an immutable copy on each discrete change, so these
  // derived values are stable snapshots — no consumer can observe a torn or
  // mutating reading (guarantee R2).
  const reading = status.kind === 'reading' ? status.reading : null;

  return {
    status,
    note: reading ? noteName(reading.midi, accidentalStyle) : null,
    octave: reading ? octaveOf(reading.midi) : null,
    tuningState: reading ? reading.state : tuningStateOf(null),
    direction: reading ? directionCue(reading.state) : null,
    cents: reading ? reading.cents : null,
    subscribeToCents,
    start,
    stop,
    retry,
  };
}
