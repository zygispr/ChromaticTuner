import { pitchClassOf } from '@chromatic-tuner/core';
import {
  readingAnnouncement,
  showsCaptureControl,
  usePreferences,
  useTuner,
} from '@chromatic-tuner/react';
import { space } from '@chromatic-tuner/tokens';
import { useState } from 'react';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { ReferenceBadge } from '../atoms/ReferenceBadge';
import { ScreenReaderAnnouncer } from '../atoms/ScreenReaderAnnouncer';
import { MicrophoneToggle } from '../molecules/MicrophoneToggle';
import { StatusBanner, STATUS_SLOT_PX } from '../molecules/StatusBanner';
import { TuningDial } from '../molecules/TuningDial';
import { TuningLine } from '../molecules/TuningLine';
import { SettingsSheet } from './SettingsSheet';

/**
 * The whole tuner in one screen.
 *
 * Tuning state is carried by three independent channels, which is what FR-015
 * requires and what makes the display readable in greyscale and to
 * colour-vision-deficient users: colour (note and marker), position (marker on
 * the line), and text (cents readout and direction cue).
 *
 * Every non-tuning state — starting, listening, and each way the microphone can
 * fail — is rendered by `StatusBanner`, which owns the recovery copy so no
 * failure can reach the screen without a next step (SC-014).
 */

export interface TunerDisplayProps {
  readonly capturing: boolean;
  readonly onToggleCapture: () => void;
}

export function TunerDisplay({ capturing, onToggleCapture }: TunerDisplayProps) {
  const {
    status,
    note,
    octave,
    tuningState,
    direction,
    cents,
    subscribeToCents,
    subscribeToReading,
    retry,
  } = useTuner();
  const { a4Hz, accidentalStyle, isNonStandardReference, tunerDisplay } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // `capturing` is what the user asked for, not what the microphone did — the
  // two part company on a failure screen, where the banner is already offering
  // the only action there is.
  const showsToggle = showsCaptureControl(status, capturing);

  return (
    <section
      data-testid="tuner-display"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${space.lg}px`,
        width: '100%',
      }}
    >
      {/* Above the note so a non-standard reference is read before the reading
          it silently changes the meaning of (FR-022). */}
      <ReferenceBadge
        a4Hz={a4Hz}
        isNonStandard={isNonStandardReference}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <NoteLabel note={note} octave={octave} state={tuningState} />
      <CentsReadout cents={cents} subscribeToCents={subscribeToCents} />

      {/* Two sibling displays and a ternary, not one parameterised meter: they
          share a props shape and nothing else (research D1). Everything around
          them is unchanged whichever is chosen, which is FR-168 — the dial adds
          a channel rather than replacing the three that were already here. */}
      {tunerDisplay === 'dial' ? (
        <TuningDial
          state={tuningState}
          accidentalStyle={accidentalStyle}
          // Taken from the DISCRETE channel on purpose. The needle needs pitch
          // class and cents in the same frame and gets both from
          // subscribeToReading; this only decides which label is highlighted,
          // where a frame of lag is invisible.
          activePitchClass={status.kind === 'reading' ? pitchClassOf(status.reading.midi) : null}
          subscribeToReading={subscribeToReading}
        />
      ) : (
        <TuningLine state={tuningState} subscribeToCents={subscribeToCents} />
      )}

      <DirectionCue direction={direction} state={tuningState} />

      <div
        style={{
          minHeight: STATUS_SLOT_PX,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <StatusBanner status={status} onRetry={retry} captureStopped={!capturing} />
      </div>

      {/* Below the readout, not above it: the tuning display is what must be
          legible from a metre away (FR-018), and the control is something the
          player looks down at deliberately. */}
      {showsToggle && <MicrophoneToggle capturing={capturing} onToggle={onToggleCapture} />}

      {/* The one thing assistive technology reads for a live reading. Every
          visual channel above is aria-hidden; this speaks all of them once,
          on discrete change only (FR-020). */}
      <ScreenReaderAnnouncer message={readingAnnouncement(status, note, octave)} />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </section>
  );
}
