import type { TuningState } from '@chromatic-tuner/core';
import { type as typeTokens } from '@chromatic-tuner/tokens';
import { StyleSheet, Text, View } from 'react-native';

import { stateColor, useAppearance } from '../../theme';

export interface NoteLabelProps {
  readonly note: string | null;
  readonly octave: number | null;
  readonly state: TuningState;
  /**
   * Point size for the note. The dial passes a size derived from its own width
   * so the note scales with the circle it sits inside (FR-169); the line
   * display passes nothing and gets the token.
   */
  readonly size?: number;
}

/** The largest element on the screen — legible at ~1 m (FR-017). */
export function NoteLabel({ note, octave, state, size = typeTokens.noteSize }: NoteLabelProps) {
  const appearance = useAppearance();
  const tint = stateColor(state, appearance);

  return (
    // Hidden from assistive technology on purpose: this is one of four visual
    // channels for the same reading, and TunerAnnouncer speaks all of them as
    // a single sentence instead (FR-020). Left visible, it reads as "E" then
    // "2" — two fragments for one note.
    <View
      style={styles.row}
      testID="note-label"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={[styles.note, { color: tint, fontSize: size, lineHeight: size * 1.05 }]}>
        {note ?? '–'}
      </Text>
      {octave !== null && (
        <Text
          style={[
            styles.octave,
            // A quarter of the note, which is exactly the ratio the two tokens
            // already stood in — 32 of 128 — so nothing moves in the line
            // display, which passes no size at all.
            { color: tint, fontSize: size * 0.25, paddingBottom: size * 0.15 },
          ]}
        >
          {octave}
        </Text>
      )}
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
