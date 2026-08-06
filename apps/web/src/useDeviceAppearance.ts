import type { Appearance } from '@chromatic-tuner/core';
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

/**
 * The device's own appearance, kept live (FR-115).
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the media query
 * is an external store, and this is the hook that exists for reading one without
 * tearing between the value React rendered and the value the browser holds.
 *
 * **It must SUBSCRIBE, not sample.** A one-off `matchMedia(QUERY).matches` at
 * mount satisfies every test in User Story 1 — the value is correct on load, and
 * an explicit choice overrides it anyway — and fails the moment the OS
 * appearance changes while the app is open, which is the whole of User Story 3.
 * That failure is invisible until someone actually flips the OS switch, which is
 * why `T046` deliberately breaks this and watches the gate catch it.
 *
 * `matchMedia` is guarded because this module is also evaluated in environments
 * that do not implement it; a missing media query means "no opinion", and light
 * is the correct thing to have no opinion about.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function getSnapshot(): Appearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(QUERY).matches ? 'dark' : 'light';
}

export function useDeviceAppearance(): Appearance {
  // The third argument is the server snapshot. There is no server — this is a
  // static bundle — but the parameter is also what React uses during hydration,
  // and returning a stable value keeps it from warning about a mismatch.
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light');
}
