import { useTuner } from '@chromatic-tuner/react';
import { space } from '@chromatic-tuner/tokens';
import { StyleSheet, View } from 'react-native';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { StatusBanner } from '../molecules/StatusBanner';
import { TuningLine } from '../molecules/TuningLine';

/**
 * The whole tuner in one screen, mirroring the web organism exactly.
 *
 * Same three redundant channels as web — colour, marker position, and text —
 * so the two platforms speak one visual language (FR-018). Every non-tuning
 * state, including each way the microphone can fail, is rendered by
 * `StatusBanner`, so no failure reaches the screen without a next step
 * (SC-014).
 */
export function TunerDisplay() {
  const { status, note, octave, tuningState, direction, cents, subscribeToCents, retry } =
    useTuner();

  return (
    <View testID="tuner-display" style={styles.container}>
      <NoteLabel note={note} octave={octave} state={tuningState} />
      <CentsReadout cents={cents} subscribeToCents={subscribeToCents} />
      <TuningLine state={tuningState} subscribeToCents={subscribeToCents} />
      <DirectionCue direction={direction} state={tuningState} />

      <StatusBanner status={status} onRetry={retry} />
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
});
