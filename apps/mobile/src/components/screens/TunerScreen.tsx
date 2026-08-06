import { space } from '@chromatic-tuner/tokens';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';

import { useAppearance, useThemeColors } from '../../theme';
import { TunerGate } from '../organisms/TunerGate';

/**
 * Full-screen, centred, no scrolling — the player's hands are on the
 * instrument, so the display must be readable without interaction (FR-018).
 */
export function TunerScreen() {
  const colors = useThemeColors();
  const appearance = useAppearance();

  return (
    <SafeAreaView
      testID="tuner-screen"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar barStyle={appearance === 'dark' ? 'light-content' : 'dark-content'} />
      {/*
        The gutter lives here rather than on the SafeAreaView, which sets its
        own padding from the safe-area insets and discards whatever the style
        asked for on those edges. Portrait has no left or right inset, so the
        gutter was dropped on every phone — invisible for as long as the ruler
        was a fixed 320pt, since a rule narrower than the screen looks padded
        whether or not anything is padding it. A fluid ruler ran to the bezel.
      */}
      <View testID="tuner-content" style={styles.content}>
        <TunerGate />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
});
