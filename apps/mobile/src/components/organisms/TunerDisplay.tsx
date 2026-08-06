import {
  readingAnnouncement,
  showsCaptureControl,
  usePreferences,
  useTuner,
} from '@chromatic-tuner/react';
import { space } from '@chromatic-tuner/tokens';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { ReferenceBadge } from '../atoms/ReferenceBadge';
import { ScreenReaderAnnouncer } from '../atoms/ScreenReaderAnnouncer';
import { MicrophoneToggle } from '../molecules/MicrophoneToggle';
import { StatusBanner, STATUS_SLOT } from '../molecules/StatusBanner';
import { TuningLine } from '../molecules/TuningLine';
import { SettingsScreen } from '../screens/SettingsScreen';

/**
 * The whole tuner in one screen, mirroring the web organism exactly.
 *
 * Same three redundant channels as web — colour, marker position, and text —
 * so the two platforms speak one visual language (FR-018). Every non-tuning
 * state, including each way the microphone can fail, is rendered by
 * `StatusBanner`, so no failure reaches the screen without a next step
 * (SC-014).
 */
export interface TunerDisplayProps {
  readonly capturing: boolean;
  readonly onToggleCapture: () => void;
}

export function TunerDisplay({ capturing, onToggleCapture }: TunerDisplayProps) {
  const { status, note, octave, tuningState, direction, cents, subscribeToCents, retry } =
    useTuner();
  const { a4Hz, isNonStandardReference } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // `capturing` is what the user asked for, not what the microphone did — the
  // two part company on a failure screen, where the banner is already offering
  // the only action there is.
  const showsToggle = showsCaptureControl(status, capturing);

  return (
    <View testID="tuner-display" style={styles.container}>
      {/* Above the note so a non-standard reference is read before the reading
          it silently changes the meaning of (FR-022). */}
      <ReferenceBadge
        a4Hz={a4Hz}
        isNonStandard={isNonStandardReference}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <NoteLabel note={note} octave={octave} state={tuningState} />
      <CentsReadout cents={cents} subscribeToCents={subscribeToCents} />
      <TuningLine state={tuningState} subscribeToCents={subscribeToCents} />
      <DirectionCue direction={direction} state={tuningState} />

      <View style={styles.statusSlot}>
        <StatusBanner status={status} onRetry={retry} captureStopped={!capturing} />
      </View>

      {/* Below the readout, not above it: the tuning display is what must be
          legible from a metre away (FR-018), and the control is something the
          player looks down at deliberately. */}
      {showsToggle && <MicrophoneToggle capturing={capturing} onToggle={onToggleCapture} />}

      {/* The one thing assistive technology reads for a live reading. Every
          visual channel above is hidden from it; this speaks all of them once,
          on discrete change only (FR-020). */}
      <ScreenReaderAnnouncer message={readingAnnouncement(status, note, octave)} />

      <SettingsScreen open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
  statusSlot: {
    minHeight: STATUS_SLOT,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
