import { A4_MAX_HZ, A4_MIN_HZ, type AccidentalStyle } from '@chromatic-tuner/core';
import { usePreferences } from '@chromatic-tuner/react';
import { a11y, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { stateColor, useAppearance, useThemeColors } from '../../theme';

export interface SettingsScreenProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const ACCIDENTAL_OPTIONS: Array<{ value: AccidentalStyle; label: string; example: string }> = [
  { value: 'sharp', label: 'Sharps', example: 'C♯ D♯ F♯' },
  { value: 'flat', label: 'Flats', example: 'D♭ E♭ G♭' },
];

/** How far one press of the stepper moves the reference pitch. */
const STEP_HZ = 1;

/**
 * The two settings the product has, and a way back to defaults (FR-022–FR-024).
 *
 * A modal over the tuner rather than a route: there will never be enough
 * settings to justify navigation — the spec's out-of-scope list is binding —
 * and keeping the tuner mounted underneath means the reference pitch can be
 * adjusted against a ringing string and heard taking effect (guarantee N7).
 *
 * The reference pitch is a stepper rather than a slider. React Native has no
 * built-in slider, and a stepper is the control that can actually be operated
 * precisely to the hertz with a thumb — which is what someone matching a piano
 * is trying to do.
 */
export function SettingsScreen({ open, onClose }: SettingsScreenProps) {
  const colors = useThemeColors();
  const appearance = useAppearance();
  const accent = stateColor('sharp', appearance);
  const {
    a4Hz,
    accidentalStyle,
    isNonStandardReference,
    persistenceFailed,
    setA4Hz,
    setAccidentalStyle,
    reset,
  } = usePreferences();

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <View
          testID="settings-sheet"
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <View style={styles.header}>
            <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
            <Pressable
              testID="settings-close"
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={[styles.closeLabel, { color: colors.text }]}>Done</Text>
            </Pressable>
          </View>

          <View>
            <Text style={[styles.legend, { color: colors.text }]}>Reference pitch</Text>

            <View style={styles.stepper}>
              <Pressable
                testID="a4-decrement"
                accessibilityRole="button"
                accessibilityLabel="Lower the reference pitch by one hertz"
                onPress={() => setA4Hz(a4Hz - STEP_HZ)}
                disabled={a4Hz <= A4_MIN_HZ}
                style={[
                  styles.stepButton,
                  { borderColor: colors.line, opacity: a4Hz <= A4_MIN_HZ ? 0.4 : 1 },
                ]}
              >
                <Text style={[styles.stepLabel, { color: colors.text }]}>−</Text>
              </Pressable>

              <Text
                testID="a4-value"
                style={[styles.value, { color: isNonStandardReference ? accent : colors.text }]}
              >
                {a4Hz} Hz
              </Text>

              <Pressable
                testID="a4-increment"
                accessibilityRole="button"
                accessibilityLabel="Raise the reference pitch by one hertz"
                onPress={() => setA4Hz(a4Hz + STEP_HZ)}
                disabled={a4Hz >= A4_MAX_HZ}
                style={[
                  styles.stepButton,
                  { borderColor: colors.line, opacity: a4Hz >= A4_MAX_HZ ? 0.4 : 1 },
                ]}
              >
                <Text style={[styles.stepLabel, { color: colors.text }]}>+</Text>
              </Pressable>
            </View>

            <Text style={[styles.range, { color: colors.text }]}>
              {A4_MIN_HZ}–{A4_MAX_HZ} Hz · standard is 440
            </Text>
          </View>

          <View>
            <Text style={[styles.legend, { color: colors.text }]}>Accidentals</Text>

            <View style={styles.options}>
              {ACCIDENTAL_OPTIONS.map((option) => {
                const selected = accidentalStyle === option.value;
                return (
                  <Pressable
                    key={option.value}
                    testID={`accidental-${option.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setAccidentalStyle(option.value)}
                    style={[
                      styles.option,
                      // Selection carried by border weight as well as colour,
                      // so it survives greyscale (FR-015).
                      { borderColor: selected ? colors.text : colors.line },
                      selected ? styles.optionSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: colors.text, fontWeight: selected ? '700' : '400' },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={[styles.optionExample, { color: colors.text }]}>
                      {option.example}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {persistenceFailed && (
            <Text testID="persistence-warning" style={[styles.warning, { color: accent }]}>
              These settings apply now but could not be saved, so they will not be remembered next
              time.
            </Text>
          )}

          <Pressable
            testID="settings-reset"
            accessibilityRole="button"
            onPress={reset}
            style={[styles.reset, { borderColor: colors.line }]}
          >
            <Text style={[styles.resetLabel, { color: colors.text }]}>Reset to defaults</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
    borderTopLeftRadius: space.md,
    borderTopRightRadius: space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: typeTokens.centsSize,
    fontWeight: '700',
  },
  closeButton: {
    minWidth: a11y.minTouchTarget,
    minHeight: a11y.minTouchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: typeTokens.labelSize,
  },
  legend: {
    fontSize: typeTokens.labelSize,
    fontWeight: '500',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  stepButton: {
    minWidth: a11y.minTouchTarget,
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: space.sm,
  },
  stepLabel: {
    fontSize: typeTokens.centsSize,
  },
  value: {
    fontSize: typeTokens.centsSize,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  range: {
    marginTop: space.xs,
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
  },
  options: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  option: {
    flex: 1,
    minHeight: a11y.minTouchTarget,
    padding: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: space.sm,
  },
  optionSelected: {
    borderWidth: 2,
  },
  optionLabel: {
    fontSize: typeTokens.labelSize,
  },
  optionExample: {
    fontSize: 12,
    opacity: 0.6,
  },
  warning: {
    fontSize: typeTokens.labelSize,
    lineHeight: typeTokens.labelSize * 1.5,
  },
  reset: {
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: space.sm,
  },
  resetLabel: {
    fontSize: typeTokens.labelSize,
  },
});
