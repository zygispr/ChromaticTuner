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

  return (
    <View
      pointerEvents="none"
      style={[
        styles.tick,
        {
          left: `${percent}%`,
          // Was 2/1 with a 0.5 dim on minors, which composited to 1.85:1
          // against the 3:1 graphic floor. Size carries the hierarchy instead.
          width: major ? 3 : 2,
          height: major ? 28 : 16,
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
    marginTop: -14,
  },
});
