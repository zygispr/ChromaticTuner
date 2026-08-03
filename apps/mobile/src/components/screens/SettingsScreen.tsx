import { A4_MAX_HZ, A4_MIN_HZ, type AccidentalStyle } from '@chromatic-tuner/core';
import { usePreferences } from '@chromatic-tuner/react';
import { a11y, motion, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
 * How far below its resting place the sheet starts, in points.
 *
 * Comfortably taller than the sheet, so it begins fully off-screen whatever the
 * content height turns out to be.
 */
const SHEET_TRAVEL = 600;

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

  // `null` means "not known yet". Defaulting to `false` would animate the
  // sheet in the gap before `isReduceMotionEnabled()` resolves — moving the
  // screen exactly once for the users who asked it not to, on every open.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  // FR-057: drop the animation entirely under reduced motion rather than
  // merely shortening it. Same convention, same shape, as `TuningLine.tsx`.
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const offset = useSharedValue(SHEET_TRAVEL);

  useEffect(() => {
    if (!open) {
      offset.value = SHEET_TRAVEL;
      return;
    }
    // Hold off-screen until the preference is known; the check resolves in a
    // microtask, so this is not a visible delay.
    if (reduceMotion === null) return;

    offset.value = reduceMotion
      ? 0
      : withTiming(0, { duration: motion.colorMs, easing: Easing.out(Easing.quad) });
  }, [open, reduceMotion, offset]);

  const sheetMotion = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Modal
      testID="settings-modal"
      visible={open}
      // `none`, not `slide`. The platform animation moves the modal's single
      // root container, and the backdrop lives inside it — so the dim swept up
      // from the bottom edge along with the sheet, which is the defect. With it
      // off, the backdrop is at full extent immediately (FR-055) and the sheet
      // carries its own slide (FR-056).
      animationType="none"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/*
        Pressing the dim area closes the sheet (FR-049) — the gesture every
        sheet on this platform responds to, and the one the web has always
        supported.

        No press-origin tracking is needed to match the web fix landing
        alongside this. React Native's responder system grants a touch to a
        single view for the whole gesture rather than resolving to a common
        ancestor on release, so a touch beginning inside the sheet never reaches
        the backdrop. The sheet is a `Pressable` with no handler purely to
        swallow presses that land on it.
      */}
      <Pressable
        testID="settings-backdrop"
        // `accessible={false}`, NOT `accessibilityElementsHidden`: the backdrop
        // is the sheet's parent, so hiding it from assistive technology hides
        // every control inside the sheet with it. This keeps the wrapper from
        // being announced as an element of its own while leaving its
        // descendants exposed. Screen-reader users dismiss with Done or the
        // platform back gesture, exactly as on the web, where the backdrop is
        // likewise not keyboard-reachable and Escape does the job.
        accessible={false}
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
      >
        <Animated.View style={[styles.sheetMotion, sheetMotion]}>
          <Pressable
            testID="settings-sheet"
            accessible={false}
            onPress={() => undefined}
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
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // The transform lives on a wrapper so the sheet's own padding, radius and
  // background stay on the pressable that swallows touches.
  sheetMotion: {
    width: '100%',
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
