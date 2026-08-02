import type { TuningState } from '@chromatic-tuner/core';
import { space, type as typeTokens } from '@chromatic-tuner/tokens';
import { StyleSheet, Text } from 'react-native';

import { stateColor, useAppearance } from '../../theme';

export interface DirectionCueProps {
  readonly direction: 'tighten' | 'loosen' | null;
  readonly state: TuningState;
}

const LABEL: Record<'tighten' | 'loosen', string> = {
  tighten: '↑ TIGHTEN',
  loosen: '↓ LOOSEN',
};

/**
 * Says outright which way to turn the peg (FR-007). "Left means flat" is not
 * self-evident to a beginner, and this is the third redundant channel required
 * by FR-015.
 */
export function DirectionCue({ direction, state }: DirectionCueProps) {
  const appearance = useAppearance();
  const text = direction ? LABEL[direction] : state === 'in-tune' ? '✓ IN TUNE' : ' ';

  return (
    <Text
      testID="direction-cue"
      accessibilityLiveRegion="polite"
      style={[styles.text, { color: stateColor(state, appearance) }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typeTokens.labelSize,
    fontWeight: '500',
    letterSpacing: 1.4,
    textAlign: 'center',
    minHeight: space.lg,
  },
});
