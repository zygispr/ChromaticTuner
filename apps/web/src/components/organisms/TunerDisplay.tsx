import { useTuner } from '@chromatic-tuner/react';
import { space, type } from '@chromatic-tuner/tokens';

import { themedVar } from '../../theme';
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
 * The whole tuner in one screen.
 *
 * Tuning state is carried by three independent channels, which is what FR-015
 * requires and what makes the display readable in greyscale and to
 * colour-vision-deficient users: colour (note and marker), position (marker on
 * the line), and text (cents readout and direction cue).
 *
 * The richer failure states get their own molecules in US3 (T069).
 */
export function TunerDisplay() {
  const { status, note, octave, tuningState, direction, cents, subscribeToCents } = useTuner();

  const statusText =
    status.kind === 'reading' ? null : (STATUS_TEXT[status.kind] ?? 'Listening — play a string');

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

      {statusText && (
        <p
          data-testid="tuner-status"
          style={{
            margin: 0,
            color: themedVar('text'),
            opacity: 0.7,
            fontSize: `${type.labelSize}px`,
            textAlign: 'center',
          }}
        >
          {statusText}
        </p>
      )}
    </section>
  );
}
