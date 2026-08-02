import type { TuningState } from '@chromatic-tuner/core';
import { type as typeTokens } from '@chromatic-tuner/tokens';
import { StyleSheet, Text, View } from 'react-native';

import { stateColor, useAppearance } from '../../theme';

export interface NoteLabelProps {
  readonly note: string | null;
  readonly octave: number | null;
  readonly state: TuningState;
}

/** The largest element on the screen — legible at ~1 m (FR-017). */
export function NoteLabel({ note, octave, state }: NoteLabelProps) {
  const appearance = useAppearance();
  const tint = stateColor(state, appearance);

  return (
    <View style={styles.row} testID="note-label" accessibilityRole="header">
      <Text style={[styles.note, { color: tint }]}>{note ?? '–'}</Text>
      {octave !== null && <Text style={[styles.octave, { color: tint }]}>{octave}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  note: {
    fontSize: typeTokens.noteSize,
    fontWeight: '700',
    lineHeight: typeTokens.noteSize * 1.05,
  },
  octave: {
    fontSize: typeTokens.centsSize,
    fontWeight: '500',
    paddingBottom: typeTokens.centsSize * 0.6,
  },
});
