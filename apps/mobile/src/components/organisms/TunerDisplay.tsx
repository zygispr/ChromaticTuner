import { useTuner } from '@chromatic-tuner/react';
import { space, type as typeTokens } from '@chromatic-tuner/tokens';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../../theme';
import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { TuningLine } from '../molecules/TuningLine';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Starting…',
  'requesting-permission': 'Waiting for microphone access…',
  'permission-denied': 'Microphone access is blocked.',
  'no-microphone': 'No microphone found.',
  'microphone-busy': 'The microphone is in use by another app.',
  listening: 'Listening — play a string',
  error: 'Something went wrong.',
};

/**
 * The whole tuner in one screen, mirroring the web organism exactly.
 *
 * Same three redundant channels as web — colour, marker position, and text —
 * so the two platforms speak one visual language (FR-018). The richer failure
 * states get their own molecules in US3 (T070).
 */
export function TunerDisplay() {
  const colors = useThemeColors();
  const { status, note, octave, tuningState, direction, cents, subscribeToCents } = useTuner();

  const statusText =
    status.kind === 'reading' ? null : (STATUS_TEXT[status.kind] ?? 'Listening — play a string');

  return (
    <View testID="tuner-display" style={styles.container}>
      <NoteLabel note={note} octave={octave} state={tuningState} />
      <CentsReadout cents={cents} subscribeToCents={subscribeToCents} />
      <TuningLine state={tuningState} subscribeToCents={subscribeToCents} />
      <DirectionCue direction={direction} state={tuningState} />

      {statusText !== null && (
        <Text testID="tuner-status" style={[styles.status, { color: colors.text }]}>
          {statusText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    width: '100%',
  },
  status: {
    fontSize: typeTokens.labelSize,
    opacity: 0.7,
    textAlign: 'center',
  },
});
