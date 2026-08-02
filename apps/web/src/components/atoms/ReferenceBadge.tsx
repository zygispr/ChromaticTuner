import { a11y, space, type } from '@chromatic-tuner/tokens';

import { themedVar } from '../../theme';

export interface ReferenceBadgeProps {
  readonly a4Hz: number;
  readonly isNonStandard: boolean;
  readonly onOpenSettings: () => void;
}

/**
 * The persistent reference-pitch indicator (FR-022, T089).
 *
 * A non-standard A4 must be "visibly obvious on the tuner screen so it is never
 * a silent surprise": a player who picks up someone else's phone set to 432 Hz
 * would otherwise tune an entire guitar a third of a semitone flat and have no
 * way to know why it sounds wrong against a recording.
 *
 * So it is deliberately louder when non-standard than when it is not, and it
 * doubles as the way into settings — which keeps the tuner screen to one
 * control without hiding the setting that most needs surfacing.
 */
export function ReferenceBadge({ a4Hz, isNonStandard, onOpenSettings }: ReferenceBadgeProps) {
  return (
    <button
      type="button"
      data-testid="reference-badge"
      data-non-standard={String(isNonStandard)}
      onClick={onOpenSettings}
      aria-label={
        isNonStandard
          ? `Settings. Reference pitch is ${a4Hz} hertz, not the standard 440.`
          : 'Settings. Reference pitch is the standard 440 hertz.'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space.xs,
        minHeight: a11y.minTouchTarget,
        padding: `${space.xs}px ${space.md}px`,
        fontSize: `${type.labelSize}px`,
        fontWeight: isNonStandard ? type.weightBold : type.weightRegular,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.04em',
        // Non-standard gets the flat/sharp attention colour and a border;
        // standard is a quiet, unobtrusive label.
        color: isNonStandard ? themedVar('sharp') : themedVar('text'),
        opacity: isNonStandard ? 1 : 0.6,
        background: 'transparent',
        border: `1px solid ${isNonStandard ? themedVar('sharp') : 'transparent'}`,
        borderRadius: space.sm,
        cursor: 'pointer',
      }}
    >
      {/* Text, not just colour — FR-015's rule applies here too. */}
      <span aria-hidden="true">A4</span>
      <span>{a4Hz} Hz</span>
    </button>
  );
}
