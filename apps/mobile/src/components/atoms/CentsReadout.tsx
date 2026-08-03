import { type as typeTokens } from '@chromatic-tuner/tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useThemeColors } from '../../theme';

export interface CentsReadoutProps {
  /** Latest discrete snapshot; null when there is no reading. */
  readonly cents: number | null;
  readonly subscribeToCents: (handler: (cents: number | null) => void) => () => void;
}

/**
 * How often the number is allowed to change. See the web atom for the full
 * reasoning; the value is the same on both platforms so the two read
 * identically (FR-018).
 */
const REFRESH_MS = 100;

function format(cents: number): string {
  return `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents`;
}

/**
 * Signed numeric deviation (FR-004) — one of the two non-colour channels that
 * keep the tuning state readable without colour (FR-015).
 *
 * The number follows the CONTINUOUS channel, because the discrete snapshot only
 * changes when the note name or the flat/in-tune/sharp state does and so sits
 * frozen through most of a retune.
 *
 * Unlike the web atom, which writes the text node directly, this one goes
 * through React state: React Native has no equivalent of `textContent`, and the
 * alternative — an animated `TextInput` — would trade one leaf re-render for a
 * component that is no longer a `Text` to assistive technology. At the 10 Hz the
 * throttle allows, re-rendering one leaf is cheap, and the marker is untouched
 * because it animates on the UI thread through Reanimated (research D6).
 */
export function CentsReadout({ cents, subscribeToCents }: CentsReadoutProps) {
  const colors = useThemeColors();
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    let lastWrittenAt = Number.NEGATIVE_INFINITY;

    return subscribeToCents((next) => {
      const now = Date.now();
      // The throttle exists to stop the last digit strobing on a held note. A
      // lapse is a one-off edge, so it skips the throttle: waiting up to 100 ms
      // to stop showing a number the tuner no longer stands behind is the wrong
      // trade (guarantee R3).
      if (next !== null && now - lastWrittenAt < REFRESH_MS) return;
      lastWrittenAt = now;
      setLive(next);
    });
  }, [subscribeToCents]);

  // Gated on the DISCRETE snapshot, not on `live`. A lapse sets `live` to null,
  // but so does the initial state before any reading has arrived, and those two
  // must not render the same way — testing `live` here would show the
  // placeholder on the first frame of a perfectly good reading.
  //
  // The snapshot is sufficient: a lapse drives the status to `listening` in the
  // same frame it fires on the continuous channel (guarantee R3), so `cents`
  // goes null alongside it.
  const shown = cents === null ? null : (live ?? cents);

  return (
    // Hidden from assistive technology: the number changes 10 times a second,
    // and the announcer speaks the deviation once per change.
    <Text
      testID="cents-readout"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.text, { color: colors.text }]}
    >
      {shown === null ? '–' : format(shown)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typeTokens.centsSize,
    fontWeight: '500',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
