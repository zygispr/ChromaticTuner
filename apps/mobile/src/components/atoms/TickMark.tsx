import { StyleSheet, View } from 'react-native';

import { useThemeColors } from '../../theme';

export interface TickMarkProps {
  /** Position in cents, -50..+50. */
  readonly cents: number;
  readonly major?: boolean;
}

/** A graduation on the horizontal line, positioned by cents. */
export function TickMark({ cents, major = false }: TickMarkProps) {
  const colors = useThemeColors();
  const percent = ((cents + 50) / 100) * 100;

  // Was 2/1 with a 0.5 dim on minors, which composited to 1.85:1 against the
  // 3:1 graphic floor. Size carries the hierarchy instead.
  const width = major ? 3 : 2;
  const height = major ? 28 : 16;

  return (
    <View
      testID="tuning-tick"
      pointerEvents="none"
      style={[
        styles.tick,
        {
          left: `${percent}%`,
          width,
          height,
          // Derived from this tick's OWN box, both axes. Web centres with
          // `translate(-50%, -50%)`, which resolves against the transformed
          // element and so works for either weight; React Native has no
          // percentage-of-self transform, and the port compensated with a
          // constant `marginTop: -14` — half the MAJOR height, applied to both.
          // Minors were therefore drawn 6pt high, hanging above the rule with
          // their bottom edge resting on it instead of passing through it, and
          // every tick sat half its width right of the cents value it names.
          marginTop: -height / 2,
          marginLeft: -width / 2,
          backgroundColor: colors.line,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tick: {
    position: 'absolute',
    top: '50%',
  },
});
