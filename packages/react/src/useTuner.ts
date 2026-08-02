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
}

export interface UseTunerOptions {
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
  const accidentalStyle = options.accidentalStyle ?? 'sharp';

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
  };
}
