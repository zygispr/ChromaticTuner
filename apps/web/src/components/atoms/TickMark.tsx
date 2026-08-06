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
      data-testid="tuning-tick"
      data-major={String(major)}
      style={{
        position: 'absolute',
        left: `${percent}%`,
        top: '50%',
        // Was 2/1. A 1px hairline is not a graduation anyone can see at arm's
        // length, let alone the metre FR-017 asks for.
        width: major ? 3 : 2,
        height: major ? 28 : 16,
        transform: 'translate(-50%, -50%)',
        // NO opacity multiplier — see the rule in TuningLine. Minor ticks were
        // dimmed to 0.5, which composited to 1.85:1 against a 3:1 floor. The
        // hierarchy between major and minor is carried by SIZE, which survives
        // greyscale and costs no contrast.
        background: themedVar('line'),
      }}
    />
  );
}
