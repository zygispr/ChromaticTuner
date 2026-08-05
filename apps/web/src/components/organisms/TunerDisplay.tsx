import {
  captureControlState,
  readingAnnouncement,
  usePreferences,
  useTuner,
} from '@chromatic-tuner/react';
import { space, type } from '@chromatic-tuner/tokens';
import { useState } from 'react';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { ReferenceBadge } from '../atoms/ReferenceBadge';
import { ScreenReaderAnnouncer } from '../atoms/ScreenReaderAnnouncer';
import { MicrophoneToggle } from '../molecules/MicrophoneToggle';
import { StatusBanner } from '../molecules/StatusBanner';
import { TuningLine } from '../molecules/TuningLine';
import { SettingsSheet } from './SettingsSheet';

/**
 * Height reserved for the status banner, whether or not it has anything to say.
 *
 * `StatusBanner` renders nothing while a note is being read and something while
 * listening, stopped, or failing. Without a reserved slot the column — which is
 * centre-justified — re-centres every time it appears or vanishes: measured at
 * **37 px** of movement on stop, and **21 px** every time a note was lost or
 * re-acquired, which is what a tuner does constantly.
 *
 * Four lines of label text: the tallest routine banner is the stopped state's
 * title plus its recovery line, measured at 50 px, and a slot that merely
 * *nearly* fits still moves the display — the first attempt reserved three
 * lines and left a 1 px shift. The rare failure banners carry recovery steps
 * and a retry button and will still grow past it, which is the right trade:
 * those are terminal states where nothing is being tuned.
 */
const STATUS_SLOT_PX = type.labelSize * 4;

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
  const { status, note, octave, tuningState, direction, cents, subscribeToCents, retry } =
    useTuner();
  const { a4Hz, isNonStandardReference } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // `capturing` is what the user asked for; this is what the microphone did.
  // The two differ on every failure screen, and the banner keeps the raw intent
  // below so a deliberate stop still reads as one.
  const control = captureControlState(status, capturing);

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
      <TuningLine state={tuningState} subscribeToCents={subscribeToCents} />
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
      <MicrophoneToggle
        capturing={control.capturing}
        onToggle={control.retries ? retry : onToggleCapture}
      />

      {/* The one thing assistive technology reads for a live reading. Every
          visual channel above is aria-hidden; this speaks all of them once,
          on discrete change only (FR-020). */}
      <ScreenReaderAnnouncer message={readingAnnouncement(status, note, octave)} />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </section>
  );
}
