import { space } from '@chromatic-tuner/tokens';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';

import { useAppearance, useThemeColors } from '../../theme';
import { TunerDisplay } from '../organisms/TunerDisplay';

/**
 * Full-screen, centred, no scrolling — the player's hands are on the
 * instrument, so the display must be readable without interaction (FR-018).
 */
export function TunerScreen() {
  const colors = useThemeColors();
  const appearance = useAppearance();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={appearance === 'dark' ? 'light-content' : 'dark-content'} />
      <TunerDisplay />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
});
