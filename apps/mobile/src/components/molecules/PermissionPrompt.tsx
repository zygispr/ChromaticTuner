import { a11y, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../../theme';

export interface PermissionPromptProps {
  readonly onAllow: () => void;
}

/**
 * Shown BEFORE the OS microphone dialog (FR-028).
 *
 * On mobile the system prompt is one-shot: a user who declines it cannot be
 * asked again from inside the app, only sent to Settings. That makes explaining
 * first materially more important here than on the web, where a denied
 * permission can be re-requested from the address bar.
 *
 * The privacy sentence satisfies FR-031, which requires the app to state
 * plainly, where it asks, that audio is never recorded or transmitted.
 */
export function PermissionPrompt({ onAllow }: PermissionPromptProps) {
  const colors = useThemeColors();

  return (
    <View testID="permission-prompt" style={styles.container}>
      <Text style={[styles.heading, { color: colors.text }]}>Tune by ear-free listening</Text>

      <Text style={[styles.body, { color: colors.text }]}>
        The tuner needs your microphone to hear the string you play and measure how far it is from
        the note.
      </Text>

      <Text testID="privacy-note" style={[styles.body, { color: colors.text }]}>
        Everything is analysed on your device. Audio is never recorded, never saved, and never sent
        anywhere — the tuner works with no network connection at all.
      </Text>

      <Pressable
        testID="allow-microphone"
        accessibilityRole="button"
        onPress={onAllow}
        style={[styles.button, { backgroundColor: colors.text }]}
      >
        {({ pressed }) => (
          <>
            {/* Layered, not swapped (FR-059). This control is FILLED with
                `text`, so replacing its background with the wash would erase
                the button and take its `background`-coloured label with it.
                The overlay is what the web achieves with an inset box-shadow;
                React Native has no equivalent, so the wash is its own view. */}
            {pressed && (
              <View
                testID="allow-microphone-wash"
                style={[styles.wash, { backgroundColor: colors.pressed }]}
              />
            )}
            <Text style={[styles.buttonLabel, { color: colors.background }]}>
              Use the microphone
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: space.md,
    maxWidth: 420,
    paddingHorizontal: space.md,
  },
  heading: {
    fontSize: typeTokens.centsSize,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: typeTokens.labelSize,
    lineHeight: typeTokens.labelSize * 1.6,
    textAlign: 'center',
    opacity: 0.85,
  },
  button: {
    minHeight: a11y.minTouchTarget,
    minWidth: a11y.minTouchTarget * 4,
    marginTop: space.xs,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: space.sm,
  },
  /** Matches the button's radius so the wash cannot square off its corners. */
  wash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: space.sm,
  },
  buttonLabel: {
    fontSize: typeTokens.labelSize,
    fontWeight: '500',
  },
});
