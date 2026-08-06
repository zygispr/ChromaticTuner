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
        // Both states carry a border, because this is the only way into
        // settings and a borderless label does not read as pressable (FR-052).
        // The non-standard state stays louder on two channels — the attention
        // colour and a heavier weight — so FR-022's "never a silent surprise"
        // survives the quiet state gaining an affordance (FR-053).
        //
        // No opacity multiplier. Dimming is what defeated a correct colour
        // token at 3.9:1 in `001`, and the tokens package's own contrast test
        // cannot see it: it checks the palette, Axe checks the composite.
        color: isNonStandard ? themedVar('sharp') : themedVar('text'),
        background: 'transparent',
        border: `1px solid ${isNonStandard ? themedVar('sharp') : themedVar('line')}`,
        borderRadius: space.sm,
        cursor: 'pointer',
      }}
    >
      {/* Text, not just colour — FR-015's rule applies here too. */}
      <span aria-hidden="true">A4</span>
      <span>{a4Hz} Hz</span>
      {/*
        The gear says what the control DOES; the pitch says what it shows.
        Trailing rather than leading for that reason — the label here is data,
        not the button's name, so the affordance follows it the way a disclosure
        indicator does. A leading gear would read as belonging to "A4".

        A text glyph rather than an inline SVG, so the mobile atom can be
        character-for-character the same (FR-018) without `react-native-svg`,
        which would be a dependency for one icon. `▾`, `−` and `+` are already
        drawn this way elsewhere in the app.

        U+FE0E is the text presentation selector: without it some platforms
        render U+2699 as a colour emoji, which would put a hue into a design
        that is otherwise entirely token-driven and greyscale-safe.

        `aria-hidden`, because the accessible name already begins "Settings." —
        letting the glyph through would only corrupt the channel that was
        already right.
      */}
      {/*
        Never bold, unlike the pitch beside it. The non-standard state is louder
        on two channels — the attention colour and a heavier weight (FR-053) —
        and both belong to the VALUE that changed. A gear that thickened too
        would add a third signal carrying no information, and blunt the two that
        do. The button sets the weight, so this has to opt out explicitly.
      */}
      <span aria-hidden="true" style={{ fontWeight: type.weightRegular }}>
        {'⚙︎'}
      </span>
    </button>
  );
}
