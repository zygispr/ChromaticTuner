import type { Appearance } from '@chromatic-tuner/core';
import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { useRef, type ReactNode } from 'react';

/**
 * A minimal provider for tests that render one component in isolation.
 *
 * Needed since `005`: `useAppearance()` reads the resolved appearance from
 * context rather than calling `useColorScheme()` itself (M9), so every component
 * that takes a colour from `theme.ts` now depends on a `TunerProvider` being
 * somewhere above it. Before that change these components read a global and
 * rendered bare quite happily.
 *
 * That dependency is the point rather than an inconvenience — a component that
 * could still resolve its own colours without the provider would be a component
 * able to disagree with the rest of the app about what appearance is in effect.
 *
 * Not a test file: `jest.config.js` matches only `*.test.{ts,tsx}`.
 */
export function Themed({
  children,
  device = 'light',
}: {
  children: ReactNode;
  device?: Appearance;
}) {
  // The ports are created once per mount, not per render: `TunerProvider`
  // rebuilds its session whenever their identities change.
  const ports = useRef({
    audioSource: new ScriptedAudioSource(),
    wakeLock: new NoopWakeLock(),
    preferences: new InMemoryPreferencesStore(),
  });

  return (
    <TunerProvider
      audioSource={ports.current.audioSource}
      wakeLock={ports.current.wakeLock}
      preferences={ports.current.preferences}
      deviceAppearance={device}
      autoStart={false}
    >
      {children}
    </TunerProvider>
  );
}
