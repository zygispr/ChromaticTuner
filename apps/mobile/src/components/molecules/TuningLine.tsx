import {
  DISPLAY_RANGE_CENTS,
  IN_TUNE_TOLERANCE_CENTS,
  type TuningState,
} from '@chromatic-tuner/core';
import { a11y, motion, space } from '@chromatic-tuner/tokens';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { stateColor, useAppearance, useThemeColors } from '../../theme';
import { TickMark } from '../atoms/TickMark';

export interface TuningLineProps {
  readonly state: TuningState;
  readonly subscribeToCents: (handler: (cents: number | null) => void) => () => void;
}

const TICKS = [-40, -30, -20, -10, 10, 20, 30, 40];
const MAJOR_TICKS = [-50, 0, 50];
const LINE_WIDTH = 320;

/**
 * The product's signature element: one horizontal line, flat left, sharp right.
 *
 * The marker position lives in a Reanimated shared value, so it animates on the
 * UI thread. Routing ~43 readings a second through React state would re-render
 * across the bridge at that rate and visibly stutter (Principle V, research D6).
 * Only the discrete tuning state — which changes rarely — goes through React.
 */
export function TuningLine({ state, subscribeToCents }: TuningLineProps) {
  const colors = useThemeColors();
  const appearance = useAppearance();
  const offset = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  // FR-016: drop the animation entirely under reduced motion, rather than
  // merely shortening it.
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

  useEffect(
    () =>
      subscribeToCents((cents) => {
        // A lapsed reading returns the marker to rest rather than leaving it
        // asserting a position the tuner can no longer justify (FR-043, R3).
        // Travelling back through `withTiming` rather than snapping, so a lapse
        // reads as the marker letting go.
        //
        // Written out rather than left to `Math.min(50, null)`, which coerces
        // to 0 and happens to land on the right answer. Correct by accident is
        // not correct.
        const requested = cents === null ? 0 : cents;
        const clamped = Math.max(-DISPLAY_RANGE_CENTS, Math.min(DISPLAY_RANGE_CENTS, requested));
        const target = (clamped / DISPLAY_RANGE_CENTS) * (LINE_WIDTH / 2);
        offset.value = reduceMotion
          ? target
          : withTiming(target, { duration: motion.markerMs, easing: Easing.out(Easing.quad) });
      }),
    [subscribeToCents, offset, reduceMotion]
  );

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const inTuneWidth = (IN_TUNE_TOLERANCE_CENTS / DISPLAY_RANGE_CENTS) * LINE_WIDTH;

  return (
    <View
      testID="tuning-line"
      // The marker's position is the same information the announcer speaks,
      // and it moves ~43 times a second. Announcing it too would be noise.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.container, { width: LINE_WIDTH }]}
    >
      <View
        testID="in-tune-zone"
        style={[
          styles.inTuneZone,
          {
            width: inTuneWidth,
            marginLeft: -inTuneWidth / 2,
            backgroundColor: stateColor('in-tune', appearance),
            opacity: state === 'in-tune' ? 0.28 : 0.12,
          },
        ]}
      />

      <View testID="tuning-rule" style={[styles.line, { backgroundColor: colors.line }]} />

      {TICKS.map((cents) => (
        <TickMark key={cents} cents={cents} />
      ))}
      {MAJOR_TICKS.map((cents) => (
        <TickMark key={`major-${cents}`} cents={cents} major />
      ))}

      <Animated.View
        testID="tuning-marker"
        style={[styles.marker, { backgroundColor: stateColor(state, appearance) }, markerStyle]}
      />

      {/*
        Which end is which, named rather than left to be inferred (FR-007): one
        of FR-015's redundant non-colour channels, and the only one that reads
        before the marker has moved. Web has carried these since 001 and the
        mobile port dropped them, so the two platforms disagreed about what the
        signature element of the app looks like (FR-018).
      */}
      <View style={styles.ends}>
        <Text style={[styles.endLabel, { color: colors.text }]}>FLAT</Text>
        <Text style={[styles.endLabel, { color: colors.text }]}>SHARP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 96,
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    // 4, not 2, and no opacity multiplier — see the web organism, which carries
    // the measurements. 0.6 composited `line` to 2.14:1 against a 3:1 floor.
    height: 4,
    marginTop: -2,
  },
  inTuneZone: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    height: 40,
    marginTop: -20,
    borderRadius: 6,
  },
  marker: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 6,
    height: 72,
    marginTop: -36,
    marginLeft: -3,
    borderRadius: 3,
  },
  ends: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xs,
  },
  endLabel: {
    // 12 and 1.2 mirror the web block's `fontSize: 12` and `letterSpacing:
    // '0.1em'` — React Native measures letter spacing in points, so the em has
    // to be resolved against the size here rather than by the layout engine.
    fontSize: 12,
    letterSpacing: 1.2,
    // `mutedOpacity`, not a bare number: these started life at 0.55 on web,
    // which composited `text` to 3.9:1 against the 4.5:1 floor for 12pt text.
    // The token carries the ceiling and `packages/tokens/tests/contrast.test.ts`
    // now composites and measures it, which is the only gate that can see an
    // opacity applied at a call site — jest has no compositor and Axe never
    // runs here.
    opacity: a11y.mutedOpacity,
  },
});
