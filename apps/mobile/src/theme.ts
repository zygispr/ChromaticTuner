import type { TuningState } from '@chromatic-tuner/core';
import { color } from '@chromatic-tuner/tokens';
import { useColorScheme } from 'react-native';

export type Appearance = 'light' | 'dark';

/** Follows the platform appearance by default (FR-019). */
export function useAppearance(): Appearance {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
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
