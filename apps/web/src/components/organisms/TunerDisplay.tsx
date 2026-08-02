import { useTuner } from '@chromatic-tuner/react';
import { space } from '@chromatic-tuner/tokens';

import { CentsReadout } from '../atoms/CentsReadout';
import { DirectionCue } from '../atoms/DirectionCue';
import { NoteLabel } from '../atoms/NoteLabel';
import { StatusBanner } from '../molecules/StatusBanner';
import { TuningLine } from '../molecules/TuningLine';

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
      <NoteLabel note={note} octave={octave} state={tuningState} />
      <CentsReadout cents={cents} subscribeToCents={subscribeToCents} />
      <TuningLine state={tuningState} subscribeToCents={subscribeToCents} />
      <DirectionCue direction={direction} state={tuningState} />

      <StatusBanner status={status} onRetry={retry} />
    </section>
  );
}
