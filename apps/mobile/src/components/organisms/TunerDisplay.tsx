import { readingAnnouncement, usePreferences, useTuner } from '@chromatic-tuner/react';
import { space, type as typeTokens } from '@chromatic-tuner/tokens';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { ReferenceBadge } from '../atoms/ReferenceBadge';
import { ScreenReaderAnnouncer } from '../atoms/ScreenReaderAnnouncer';
import { MicrophoneToggle } from '../molecules/MicrophoneToggle';
import { StatusBanner } from '../molecules/StatusBanner';
import { TuningLine } from '../molecules/TuningLine';
import { SettingsScreen } from '../screens/SettingsScreen';

/**
 * Height reserved for the status banner, whether or not it has anything to say.
 *
 * Mirrors the web organism. `StatusBanner` renders nothing while a note is being
 * read and something while listening, stopped, or failing, and the column is
 * centre-justified — so without a reserved slot it re-centres every time the
 * banner appears or vanishes. On web that measured 37 px of movement on stop and
 * 21 px every time a note was lost or re-acquired, which is what a tuner does
 * constantly.
 *
 * Four lines of label text: the tallest routine banner is the stopped state's
 * title plus its recovery line, and a slot that merely *nearly* fits still moves
 * the display. The rare failure banners will still grow past it, which is the
 * right trade: those are terminal states where nothing is being tuned.
 */
const STATUS_SLOT = typeTokens.labelSize * 4;

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
      <MicrophoneToggle capturing={capturing} onToggle={onToggleCapture} />

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
