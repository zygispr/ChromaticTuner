import { readingAnnouncement, usePreferences, useTuner } from '@chromatic-tuner/react';
import { space } from '@chromatic-tuner/tokens';
import { useState } from 'react';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { ReferenceBadge } from '../atoms/ReferenceBadge';
import { ScreenReaderAnnouncer } from '../atoms/ScreenReaderAnnouncer';
import { StatusBanner } from '../molecules/StatusBanner';
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
export function TunerDisplay() {
  const { status, note, octave, tuningState, direction, cents, subscribeToCents, retry } =
    useTuner();
  const { a4Hz, isNonStandardReference } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

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

      <StatusBanner status={status} onRetry={retry} />

      {/* The one thing assistive technology reads for a live reading. Every
          visual channel above is aria-hidden; this speaks all of them once,
          on discrete change only (FR-020). */}
      <ScreenReaderAnnouncer message={readingAnnouncement(status, note, octave)} />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </section>
  );
}
