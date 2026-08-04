import { captureControlLabel } from '@chromatic-tuner/react';
import { a11y, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useThemeColors } from '../../theme';

export interface MicrophoneToggleProps {
  readonly capturing: boolean;
  readonly onToggle: () => void;
}

/**
 * The persistent microphone control (FR-036–FR-039, FR-042).
 *
 * Mirrors the web molecule exactly (FR-018). The label states what pressing
 * will DO rather than what is currently true, and carries no
 * `accessibilityState.selected` — `captureControlLabel` owns that reasoning and
 * the copy for both platforms, so the two cannot drift onto opposite sides of
 * the action/state choice.
 *
 * Matters more here than on the web: iOS and Android both show a persistent
 * recording indicator, so "the app is listening" is visible at the OS level and
 * a user who wants it to stop has, until now, had to close the app.
 */
export function MicrophoneToggle({ capturing, onToggle }: MicrophoneToggleProps) {
  const colors = useThemeColors();
  const label = captureControlLabel(capturing);

  return (
    <Pressable
      testID="microphone-toggle"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onToggle}
      // Feedback while the finger is down (FR-059), the mobile counterpart of
      // the web's hover wash.
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.line },
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: a11y.minTouchTarget,
    minWidth: a11y.minTouchTarget * 3,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: space.sm,
  },
  label: {
    fontSize: typeTokens.labelSize,
    fontWeight: typeTokens.weightMedium,
  },
});
