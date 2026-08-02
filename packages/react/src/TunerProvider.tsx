import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DEFAULT_PREFERENCES,
  TunerSession,
  clampA4Hz,
  isNonStandardReference,
  loadPreferences,
  savePreferences,
} from '@chromatic-tuner/core';
import type {
  AccidentalStyle,
  AudioSource,
  PreferencesStore,
  StoredPreferences,
  WakeLock,
} from '@chromatic-tuner/core';

import { TunerContext } from './TunerContext';

export interface TunerProviderProps {
  readonly audioSource: AudioSource;
  readonly wakeLock: WakeLock;
  /** Omit to keep preferences in memory for the session only. */
  readonly preferences?: PreferencesStore;
  /** Starting reference pitch, used until a stored preference is loaded. */
  readonly a4Hz?: number;
  /** Set false to require an explicit start() — the default is to listen. */
  readonly autoStart?: boolean;
  readonly children: ReactNode;
}

/**
 * Supplies the tuner session and the resolved preferences to the tree.
 *
 * The ports are injected here rather than constructed inside, which is what
 * keeps `packages/core` free of platform imports and testable headlessly
 * (Constitution Principle VI).
 */
export function TunerProvider({
  audioSource,
  wakeLock,
  preferences,
  a4Hz = DEFAULT_PREFERENCES.a4Hz,
  autoStart = true,
  children,
}: TunerProviderProps) {
  const session = useMemo(
    () => new TunerSession({ audioSource, wakeLock, a4Hz }),
    // A new session per port swap; a4Hz changes go through setReferencePitch.
    [audioSource, wakeLock]
  );

  const [stored, setStored] = useState<StoredPreferences>({
    ...DEFAULT_PREFERENCES,
    a4Hz: clampA4Hz(a4Hz),
  });
  const [persistenceFailed, setPersistenceFailed] = useState(false);

  // Held in a ref as well as state so the setters can persist without being
  // re-created on every change, which would restart the effects below.
  const storeRef = useRef<PreferencesStore | undefined>(preferences);
  storeRef.current = preferences;

  useEffect(() => {
    if (!preferences) return;
    let cancelled = false;

    void loadPreferences(preferences).then((loaded) => {
      if (!cancelled) setStored(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, [preferences]);

  /**
   * T086: push the reference pitch into the LIVE analyzer.
   *
   * `setReferencePitch` deliberately does not discard buffered audio, so
   * dragging an A4 control against a ringing string re-labels the reading
   * continuously instead of blanking the display for the whole gesture
   * (guarantee N7).
   */
  useEffect(() => {
    session.setReferencePitch(stored.a4Hz);
  }, [session, stored.a4Hz]);

  useEffect(() => {
    if (autoStart) void session.start();

    // The cleanup is registered unconditionally, and that is not a detail.
    // Both apps run with autoStart off — TunerGate decides when to open the
    // microphone (FR-028) — so an early return here would mean the session is
    // never stopped on unmount: the microphone stays open against FR-033, and
    // a session parked in a recoverable failure keeps its retry timer firing
    // forever against a tree that no longer exists.
    return () => {
      void session.stop();
    };
  }, [session, autoStart]);

  /**
   * Apply a change immediately, then persist.
   *
   * Optimistic on purpose: a settings control must track the user's finger at
   * 60 fps, and waiting for storage to acknowledge each step would make the
   * slider stutter. A write that fails is reported through `persistenceFailed`
   * rather than reverting the value the user can plainly see they chose.
   */
  const apply = useCallback((next: StoredPreferences) => {
    setStored(next);

    const store = storeRef.current;
    if (!store) return;

    void savePreferences(store, next).then((ok) => setPersistenceFailed(!ok));
  }, []);

  const setA4Hz = useCallback(
    (hz: number) => apply({ ...stored, a4Hz: clampA4Hz(hz) }),
    [apply, stored]
  );

  const setAccidentalStyle = useCallback(
    (accidentalStyle: AccidentalStyle) => apply({ ...stored, accidentalStyle }),
    [apply, stored]
  );

  const reset = useCallback(() => {
    setStored({ ...DEFAULT_PREFERENCES });
    setPersistenceFailed(false);

    const store = storeRef.current;
    if (!store) return;

    // clear(), not save(defaults): FR-024 asks for a reset to defaults, and a
    // cleared record is what a fresh install actually looks like.
    void store.clear().catch(() => setPersistenceFailed(true));
  }, []);

  const value = useMemo(
    () => ({
      session,
      preferences: {
        a4Hz: stored.a4Hz,
        accidentalStyle: stored.accidentalStyle,
        isNonStandardReference: isNonStandardReference(stored.a4Hz),
        persistenceFailed,
        setA4Hz,
        setAccidentalStyle,
        reset,
      },
    }),
    [session, stored, persistenceFailed, setA4Hz, setAccidentalStyle, reset]
  );

  return <TunerContext.Provider value={value}>{children}</TunerContext.Provider>;
}
