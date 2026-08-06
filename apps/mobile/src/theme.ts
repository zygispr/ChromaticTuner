import type { Appearance, TuningState } from '@chromatic-tuner/core';
import { usePreferences } from '@chromatic-tuner/react';
import { color } from '@chromatic-tuner/tokens';

export type { Appearance };

/**
 * The appearance in effect — the user's choice, resolved against the device.
 *
 * This used to call `useColorScheme()` directly, which was right while the OS
 * was the only thing with an opinion. It now reads the value `TunerProvider`
 * resolved (M9), and the OS reaches it as `deviceAppearance` from `App.tsx`.
 *
 * The old implementation was **replaced, not left beside its successor**
 * (Principle I). That is load-bearing rather than tidy: seven components call
 * this hook, and a surviving `useColorScheme()` path would mean some surfaces
 * follow the choice and others follow the OS, which is FR-118's failure mode
 * shipped by accident. Nothing may consult the platform appearance directly —
 * `App.tsx` is the one place it enters the tree.
 */
export function useAppearance(): Appearance {
  return usePreferences().appearance;
}

export function useThemeColors(): Record<keyof typeof color, string> {
  const appearance = useAppearance();
  return Object.fromEntries(
    Object.entries(color).map(([name, value]) => [name, value[appearance]])
  ) as Record<keyof typeof color, string>;
}

export function stateColor(state: TuningState, appearance: Appearance): string {
  switch (state) {
    case 'flat':
      return color.flat[appearance];
    case 'sharp':
      return color.sharp[appearance];
    case 'in-tune':
      return color.inTune[appearance];
    case 'no-reading':
      return color.noReading[appearance];
  }
}
