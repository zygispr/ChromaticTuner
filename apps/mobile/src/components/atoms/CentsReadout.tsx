import { type as typeTokens } from '@chromatic-tuner/tokens';
import { StyleSheet, Text } from 'react-native';

import { useThemeColors } from '../../theme';

export interface CentsReadoutProps {
  readonly cents: number | null;
}

/**
 * Signed numeric deviation (FR-004) — one of the two non-colour channels that
 * keep the tuning state readable without colour (FR-015).
 */
export function CentsReadout({ cents }: CentsReadoutProps) {
  const colors = useThemeColors();
  const text = cents === null ? '–' : `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents`;

  return (
    <Text testID="cents-readout" style={[styles.text, { color: colors.text }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typeTokens.centsSize,
    fontWeight: '500',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
