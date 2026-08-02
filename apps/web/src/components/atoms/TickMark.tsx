import { themedVar } from '../../theme';

export interface TickMarkProps {
  /** Position in cents, -50..+50. */
  readonly cents: number;
  readonly major?: boolean;
}

/** A graduation on the horizontal line, positioned by cents. */
export function TickMark({ cents, major = false }: TickMarkProps) {
  const percent = ((cents + 50) / 100) * 100;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: `${percent}%`,
        top: '50%',
        width: major ? 2 : 1,
        height: major ? 28 : 16,
        transform: 'translate(-50%, -50%)',
        background: themedVar('line'),
        opacity: major ? 0.9 : 0.5,
      }}
    />
  );
}
