import { a11y, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';

import { stateColor, useAppearance, useThemeColors } from '../../theme';

export interface ReferenceBadgeProps {
  readonly a4Hz: number;
  readonly isNonStandard: boolean;
  readonly onOpenSettings: () => void;
}

/**
 * The persistent reference-pitch indicator (FR-022, T089).
 *
 * Mirrors the web atom exactly (FR-018). A non-standard A4 must be "visibly
 * obvious on the tuner screen so it is never a silent surprise": a player who
 * picks up a phone left on 432 Hz would otherwise tune a whole guitar a third
 * of a semitone flat with no way to know why it sounds wrong against a record.
 */
export function ReferenceBadge({ a4Hz, isNonStandard, onOpenSettings }: ReferenceBadgeProps) {
  const colors = useThemeColors();
  const appearance = useAppearance();
  const accent = stateColor('sharp', appearance);

  return (
    <Pressable
      testID="reference-badge"
      accessibilityRole="button"
      accessibilityLabel={
        isNonStandard
          ? `Settings. Reference pitch is ${a4Hz} hertz, not the standard 440.`
          : 'Settings. Reference pitch is the standard 440 hertz.'
      }
      onPress={onOpenSettings}
      // The wash while the finger is still down (FR-059) — the mobile
      // equivalent of the web's hover, since hover does not exist here. It
      // becomes the background rather than layering, because this control is
      // transparent at rest and there is nothing to layer over.
      style={({ pressed }) => [
        styles.badge,
        pressed && { backgroundColor: colors.pressed },
        {
          // Both states carry a border, because this is the only way into
          // settings and a borderless label does not read as pressable
          // (FR-052). The non-standard state stays louder on two channels —
          // the attention colour and a heavier weight — so FR-022's "never a
          // silent surprise" survives the quiet state gaining an affordance
          // (FR-053).
          //
          // No opacity multiplier: dimming is what defeated a correct colour
          // token at 3.9:1 in `001`.
          borderColor: isNonStandard ? accent : colors.line,
        },
      ]}
    >
      {/* Text, not just colour — FR-015's rule applies here too. */}
      <Text
        style={[
          styles.label,
          {
            color: isNonStandard ? accent : colors.text,
            fontWeight: isNonStandard ? '700' : '400',
          },
        ]}
      >
        A4 {a4Hz} Hz
      </Text>
      {/*
        The gear says what the control DOES; the pitch says what it shows.
        Trailing rather than leading for that reason — the label here is data,
        not the button's name, so the affordance follows it the way a disclosure
        indicator does.

        The same text glyph the web atom uses, character for character (FR-018).
        An SVG would mean adding `react-native-svg` for one icon; `−` and `+` in
        the settings stepper are already drawn as glyphs. U+FE0E forces text
        presentation, so it does not arrive as a colour emoji in a design that is
        otherwise entirely token-driven.

        Not announced: the Pressable above carries an `accessibilityLabel` that
        already begins "Settings.", and that label is what VoiceOver reads —
        these Text children are not traversed separately.
      */}
      <Text style={[styles.gear, { color: isNonStandard ? accent : colors.text }]}>{'⚙︎'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: a11y.minTouchTarget,
    paddingHorizontal: space.md,
    // A row, since the gear sits beside the pitch rather than under it. The
    // web atom is an `inline-flex` with the same `space.xs` gap.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: space.sm,
  },
  label: {
    fontSize: typeTokens.labelSize,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  /**
   * Never bold, unlike the pitch beside it.
   *
   * The non-standard state is louder on two channels — the attention colour and
   * a heavier weight (FR-053) — and both belong to the VALUE that changed. A
   * gear that thickened too would add a third signal carrying no information,
   * and blunt the two that do.
   */
  gear: {
    fontSize: typeTokens.labelSize,
    fontWeight: '400',
  },
});
