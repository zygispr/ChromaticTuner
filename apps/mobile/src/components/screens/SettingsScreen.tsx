import {
  A4_MAX_HZ,
  A4_MIN_HZ,
  type AccidentalStyle,
  type AppearancePreference,
} from '@chromatic-tuner/core';
import { usePreferences } from '@chromatic-tuner/react';
import { a11y, motion, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

/**
 * The same words, in the same order, as the web sheet (research D8, FR-124).
 *
 * "Match device", not "System" or "Auto". Both platforms assert this list, since
 * two hand-maintained copies of one vocabulary is how they drift apart.
 */
const APPEARANCE_OPTIONS: Array<{ value: AppearancePreference; label: string }> = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** How far one press of the stepper moves the reference pitch. */
const STEP_HZ = 1;

/**
 * How far to lift `−` and `+` so they sit on the centre of their buttons.
 *
 * Centring a Text centres its LINE BOX, and a mathematical operator is not in
 * the middle of its own: it is drawn on the font's math axis, which sits below
 * the box centre because the box reserves room for descenders these marks do
 * not have. Both marks therefore rendered low inside a correctly centred
 * button — visible enough that someone reported it from across a room.
 *
 * Measured with CoreText on the system font at this stepper's 32pt: the math
 * axis is 9.141pt above the baseline and the line box centres 12.094pt above
 * it, so the mark is 2.953pt low — 0.092em, and 0.094em at 16pt, which makes it
 * a fraction of the font size rather than a fixed distance. Both glyphs share
 * one math axis, so one correction serves the pair; correcting them separately
 * would misalign them with each other.
 *
 * iOS only, and not out of caution: Roboto centres these glyphs to within
 * 0.012em and misses in opposite directions for `−` and `+`, so this
 * correction would there introduce roughly three times the error it removes.
 * Measure per font before extending it to one.
 *
 * Signed as a `translateY`: negative is up.
 */
const MARK_OPTICAL_LIFT = Platform.select({ ios: -0.092 * typeTokens.centsSize, default: 0 });

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
    appearancePreference,
    isNonStandardReference,
    persistenceFailed,
    setA4Hz,
    setAccidentalStyle,
    setAppearancePreference,
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
            // `surface`, not `background`: the sheet is raised, and in dark the
            // scrim cannot say so — there is nothing below the background to
            // darken towards. See the token's own comment.
            style={[styles.sheet, { backgroundColor: colors.surface }]}
          >
            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.text }]}>Settings</Text>
              <Pressable
                testID="settings-close"
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && { backgroundColor: colors.pressed },
                ]}
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
                  style={({ pressed }) => [
                    styles.stepButton,
                    { borderColor: colors.line, opacity: a4Hz <= A4_MIN_HZ ? 0.4 : 1 },
                    pressed && { backgroundColor: colors.pressed },
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
                  style={({ pressed }) => [
                    styles.stepButton,
                    { borderColor: colors.line, opacity: a4Hz >= A4_MAX_HZ ? 0.4 : 1 },
                    pressed && { backgroundColor: colors.pressed },
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
                      style={({ pressed }) => [
                        styles.option,
                        // Selection carried by fill and weight as well as
                        // colour, so it survives greyscale (FR-015). This used
                        // to be a heavier border, which is a thin channel —
                        // one stroke colour over a 2 pt band — and on the web
                        // half it was the same treatment as the focus ring.
                        //
                        // The `selected` tint, not `text`: filling with `text`
                        // was the first attempt and overcorrected, spending the
                        // primary-action treatment on a preference. A tinted
                        // container is what a chosen segment gets on both
                        // platforms, and the label stays `text`.
                        { borderColor: selected ? colors.text : colors.line },
                        selected && { backgroundColor: colors.selected },
                        // The wash replaces the background outright, so it may
                        // only be applied to the option that has none. The
                        // filled one layers it as an overlay below.
                        pressed && !selected && { backgroundColor: colors.pressed },
                      ]}
                    >
                      {({ pressed }) => (
                        <>
                          {/* Layered, not swapped (FR-059) — the same overlay
                              `PermissionPrompt` uses, for the same reason:
                              replacing this control's background would erase
                              the fill and take its `background`-coloured label
                              with it. */}
                          {pressed && selected && (
                            <View
                              testID={`accidental-${option.value}-wash`}
                              style={[styles.wash, { backgroundColor: colors.pressed }]}
                            />
                          )}
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
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={[styles.legend, { color: colors.text }]}>Appearance</Text>

              {/* The Accidentals group's treatment, reused rather than
                  rewritten (research D8) — `selected` tint fill, bold label,
                  one border width. `accessibilityRole="radio"` because these
                  are mutually exclusive and exactly one is always chosen,
                  which is what a radio means to VoiceOver. */}
              <View style={styles.options}>
                {APPEARANCE_OPTIONS.map((option) => {
                  const selected = appearancePreference === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      testID={`appearance-${option.value}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setAppearancePreference(option.value)}
                      style={({ pressed }) => [
                        styles.option,
                        { borderColor: selected ? colors.text : colors.line },
                        selected && { backgroundColor: colors.selected },
                        // The wash replaces the background outright, so it may
                        // only be applied to an option that has none. The
                        // filled one layers it as an overlay, below.
                        pressed && !selected && { backgroundColor: colors.pressed },
                      ]}
                    >
                      {({ pressed }) => (
                        <>
                          {pressed && selected && (
                            <View
                              testID={`appearance-${option.value}-wash`}
                              style={[styles.wash, { backgroundColor: colors.pressed }]}
                            />
                          )}
                          <Text
                            style={[
                              styles.optionLabel,
                              { color: colors.text, fontWeight: selected ? '700' : '400' },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </>
                      )}
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
              style={({ pressed }) => [
                styles.reset,
                { borderColor: colors.line },
                pressed && { backgroundColor: colors.pressed },
              ]}
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
    // No border on this edge — see the web sheet, which dropped the same
    // `line` rule for the same reason: at the ruler's contrast it reads as a
    // drawn rule in dark and as nothing at all in light.
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
    // The same horizontal padding the reference badge uses — the app's other
    // compact control. Without it the word only just fits inside the box, which
    // reads as cramped now the wash makes the box visible.
    //
    // No negative margin to pull it outwards. An earlier attempt did that, to
    // keep the LABEL on the sheet's content edge — the wrong edge to align.
    // What a user sees is the box: this one's wash against the accidental
    // buttons' borders and the reset button's, all of which end on that edge.
    paddingHorizontal: space.md,
    alignItems: 'flex-end',
    justifyContent: 'center',
    // Matches every other control's radius. Borderless, so this went unnoticed
    // until the press wash gave it a fill — at which point it painted a hard
    // 44x44 square beside five rounded controls (FR-058).
    borderRadius: space.sm,
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
    // A transform rather than a margin: this moves the mark only, leaving the
    // 44pt touch target where a11y put it (a11y.minTouchTarget). The value is
    // already signed — negative is up — so a platform with nothing to correct
    // gets exactly 0 rather than the -0 that negating one here would produce.
    transform: [{ translateY: MARK_OPTICAL_LIFT }],
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
    // One width for both states, so choosing an option cannot resize the row
    // under the finger that chose it.
    borderWidth: 1,
    borderRadius: space.sm,
  },
  /** Matches the option's radius so the wash cannot square off its corners. */
  wash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: space.sm,
  },
  optionLabel: {
    fontSize: typeTokens.labelSize,
    /*
     * `alignItems: 'center'` on the option box is not enough on its own.
     *
     * That centres the Text ELEMENT, which is all that is needed while a label
     * fits on one line. "Match device" does not: at `labelSize` it needs ~95pt
     * in the ~92pt an option gets on a 393pt-wide phone, so it wraps — and React
     * Native left-aligns wrapped lines by default, leaving "Match" / "device"
     * ragged.
     *
     * The web half never showed this, because a `<button>` inherits
     * `text-align: center` from the UA stylesheet. Same layout, two different
     * defaults, which is the drift FR-018 exists to catch — and it took a human
     * looking at both apps side by side to see it.
     */
    textAlign: 'center',
  },
  optionExample: {
    fontSize: 12,
    // The `selected` tint sits close enough to this text that a heavier fade
    // drops it under AA; the token carries the measurement.
    opacity: a11y.mutedOpacity,
    // Same reason as the label above: this one is short today, but it is the
    // second line of the same box and must not go ragged if it ever wraps.
    textAlign: 'center',
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
