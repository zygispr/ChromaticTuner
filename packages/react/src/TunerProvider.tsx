import { useEffect, useMemo, type ReactNode } from 'react';

import { TunerSession } from '@chromatic-tuner/core';
import type { AudioSource, PreferencesStore, WakeLock } from '@chromatic-tuner/core';

import { TunerContext } from './TunerContext';

export interface TunerProviderProps {
  readonly audioSource: AudioSource;
  readonly wakeLock: WakeLock;
  /** Wired up by usePreferences in US4; accepted now so apps compose once. */
  readonly preferences?: PreferencesStore;
  readonly a4Hz?: number;
  /** Set false to require an explicit start() — the default is to listen. */
  readonly autoStart?: boolean;
  readonly children: ReactNode;
}

/**
 * Supplies the tuner session to the tree.
 *
 * The ports are injected here rather than constructed inside, which is what
 * keeps `packages/core` free of platform imports and testable headlessly
 * (Constitution Principle VI).
 */
export function TunerProvider({
  audioSource,
  wakeLock,
  preferences,
  a4Hz = 440,
  autoStart = true,
  children,
}: TunerProviderProps) {
  const session = useMemo(
    () => new TunerSession({ audioSource, wakeLock, a4Hz }),
    // A new session per port swap; a4Hz changes go through setReferencePitch.
    [audioSource, wakeLock]
  );

  useEffect(() => {
    session.setReferencePitch(a4Hz);
  }, [session, a4Hz]);

  useEffect(() => {
    if (!autoStart) return;
    void session.start();
    // Releasing the microphone on unmount is part of FR-033; the same rule
    // applies on backgrounding, which the apps wire up in US3 (T075).
    return () => {
      void session.stop();
    };
  }, [session, autoStart]);

  const value = useMemo(
    () => ({ session, preferences: preferences ?? null }),
    [session, preferences]
  );

  return <TunerContext.Provider value={value}>{children}</TunerContext.Provider>;
}
