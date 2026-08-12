import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DEFAULT_PREFERENCES,
  TunerSession,
  clampA4Hz,
  isNonStandardReference,
  loadPreferences,
  resolveAppearance,
  savePreferences,
} from '@chromatic-tuner/core';
import type {
  AccidentalStyle,
  Appearance,
  AppearancePreference,
  AudioSource,
  PreferencesStore,
  StoredPreferences,
  TunerDisplay,
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
  /**
   * The device's own appearance, injected by the platform (M9, research D2).
   *
   * A prop rather than a fourth port: `packages/core` never asks for this
   * value, it only receives it as an argument to a pure function, so a stateful
   * interface with a contract suite would be ceremony around something with no
   * failure mode. Defaults to `'light'` so a test that does not care need not
   * say anything.
   */
  readonly deviceAppearance?: Appearance;
  /**
   * Already-normalised preferences to start from, skipping the async load
   * entirely (M11, research D5).
   *
   * Mobile supplies this: `index.js` reads storage before mounting the root, so
   * the first frame the user sees is already the right appearance rather than
   * the default corrected a commit later. Not re-validated — `loadPreferences`
   * has already done that.
   */
  readonly initialPreferences?: StoredPreferences;
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
  deviceAppearance = 'light',
  initialPreferences,
  children,
}: TunerProviderProps) {
  const session = useMemo(
    () => new TunerSession({ audioSource, wakeLock, a4Hz }),
    // A new session per port swap; a4Hz changes go through setReferencePitch.
    [audioSource, wakeLock]
  );

  const [stored, setStored] = useState<StoredPreferences>(
    // M11: the seed is used as-is. `useState`'s initialiser runs before the
    // first render rather than in an effect after it, which is the whole
    // difference between "the first frame is right" and "the first frame is
    // corrected" (FR-120).
    initialPreferences ?? { ...DEFAULT_PREFERENCES, a4Hz: clampA4Hz(a4Hz) }
  );
  const [persistenceFailed, setPersistenceFailed] = useState(false);
  // M10: true from the first render when seeded, otherwise once the store
  // answers. Never returns to false — see the effect below.
  const [preferencesLoaded, setPreferencesLoaded] = useState(initialPreferences !== undefined);

  // Held in a ref as well as state so the setters can persist without being
  // re-created on every change, which would restart the effects below.
  const storeRef = useRef<PreferencesStore | undefined>(preferences);
  storeRef.current = preferences;

  useEffect(() => {
    // M11: a seeded provider does not read the store at all. Racing the seed
    // against a load that can only produce the same answer would spend a render
    // to arrive where it already was, and on a slow read would show the seeded
    // appearance and then blink.
    if (initialPreferences !== undefined) return;

    if (!preferences) {
      // No store means nothing to wait for. M10 must still become true, or the
      // web effect that writes `data-theme` would never run for an app
      // configured without persistence.
      setPreferencesLoaded(true);
      return;
    }
    let cancelled = false;

    void loadPreferences(preferences).then((loaded) => {
      if (cancelled) return;
      setStored(loaded);
      setPreferencesLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [preferences, initialPreferences]);

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

  const setAppearancePreference = useCallback(
    // Stores the CHOICE, not what it currently resolves to (FR-119). Writing
    // `resolveAppearance(...)` here would silently convert "match device" into
    // whichever appearance the device happened to be in at that moment.
    (appearance: AppearancePreference) => apply({ ...stored, appearance }),
    [apply, stored]
  );

  const setTunerDisplay = useCallback(
    (tunerDisplay: TunerDisplay) => apply({ ...stored, tunerDisplay }),
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
        // M9: resolved once, here, per render. Publishing the preference alone
        // and letting each surface resolve it would be three chances for two
        // surfaces to disagree about what the app currently looks like.
        appearance: resolveAppearance(stored.appearance, deviceAppearance),
        appearancePreference: stored.appearance,
        // No resolution step, unlike appearance: what is stored is what is
        // drawn, so there is one value here rather than a pair.
        tunerDisplay: stored.tunerDisplay,
        preferencesLoaded,
        setA4Hz,
        setAccidentalStyle,
        setAppearancePreference,
        setTunerDisplay,
        reset,
      },
    }),
    [
      session,
      stored,
      persistenceFailed,
      deviceAppearance,
      preferencesLoaded,
      setA4Hz,
      setAccidentalStyle,
      setAppearancePreference,
      setTunerDisplay,
      reset,
    ]
  );

  return <TunerContext.Provider value={value}>{children}</TunerContext.Provider>;
}
