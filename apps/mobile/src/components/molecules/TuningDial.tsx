import {
  DIAL_SEGMENT_DEGREES,
  dialAngleDegrees,
  noteName,
  unwrapDegrees,
  type AccidentalStyle,
  type TuningState,
} from '@chromatic-tuner/core';
import { a11y, motion, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { stateColor, useAppearance, useThemeColors } from '../../theme';

export interface TuningDialProps {
  readonly state: TuningState;
  readonly accidentalStyle: AccidentalStyle;
  /** Pitch class of the note being named, or null when nothing is being read. */
  readonly activePitchClass: number | null;
  readonly subscribeToReading: (
    handler: (cents: number | null, clarity: number, midi: number | null) => void
  ) => () => void;
  /**
   * The note name and the cents readout, drawn in the centre of the circle
   * (FR-168), built from the note size the dial has room for.
   *
   * A render prop rather than a plain node, which is where this parts company
   * with the web dial. Web sizes the hub's text in `cqw` — a percentage of the
   * dial's own width, resolved by the browser — so the caller can hand over
   * finished elements and the geometry stays the dial's business. React Native
   * has no container units, so the only place that number can come from is
   * here, and the only way to give it to the caller is to ask for a function.
   */
  readonly hub?: (noteSize: number) => ReactNode;
}

const SEGMENTS = 12;

/**
 * How large the note name is as a fraction of the dial's width (FR-169).
 *
 * The same arithmetic the web dial carries, and the same number, because G23
 * requires one drawing on both platforms: the hub is a CIRCLE, so what has to
 * fit is the text block's half-diagonal against the hub's radius rather than
 * its width against the diameter. Measured on web at "C♯4", the block is about
 * 1.6x the note size wide and 1.4 tall, whose half-diagonal is ~1.06x the note
 * size; against a hub of 0.55R = 0.275 of the width that allows 0.259, rounded
 * down for the margin that font metrics differing between platforms will spend.
 */
const NOTE_SIZE_RATIO = 0.24;

/**
 * DERIVED, not chosen: the smallest dial whose hub holds the note name at the
 * full `type.noteSize`, so moving the note inside the circle can never make the
 * largest element on the screen smaller than the horizontal display draws it
 * (FR-169, G26). Change the ratio and the cap follows.
 */
const MAX_SIZE = Math.round(typeTokens.noteSize / NOTE_SIZE_RATIO);

/**
 * Everything in the tuner column that is NOT the dial.
 *
 * Web carries the same constant and learnt why the hard way: the dial is the
 * first element in this app whose HEIGHT competes with the viewport, and sizing
 * it from width alone pushed the microphone control off the bottom of the
 * screen (Defect 1). A phone has less height to spare than a laptop, not more.
 *
 * Summed from the pieces rather than measured off a screenshot, because a
 * screenshot is one device: the badge and the microphone control are both
 * `minTouchTarget`, the direction cue is one `space.lg` line, the status slot
 * scales with the reader's text size, and there are four `space.lg` gaps plus
 * the screen's own horizontal padding used vertically at top and bottom.
 */
function columnChrome(statusSlot: number): number {
  return a11y.minTouchTarget * 2 + space.lg * 5 + statusSlot + space.md * 2;
}

/** The face's radial budget, as fractions of the radius. Identical to web (G25). */
const HUB_RADIUS = 0.55;
const LABEL_RADIUS = 0.66;
const NEEDLE_INNER_RADIUS = 0.78;
const NEEDLE_OUTER_RADIUS = 0.96;
const TICK_INNER_RADIUS = 0.93;

/**
 * A radius fraction as a percentage of the dial's BOX, measured from its top.
 *
 * The box is a diameter across, so the centre is at 50% and a fraction `f` of
 * the radius is `50f` percentage points either side of it.
 */
const fromTop = (radiusFraction: number) => `${50 - 50 * radiusFraction}%` as const;

/** The same conversion for a radial LENGTH rather than a position. */
const radialSpan = (inner: number, outer: number) => `${50 * (outer - inner)}%` as const;

/**
 * The circular display: twelve segments, C at the top, clockwise is sharper.
 *
 * A sibling of `TuningLine`, not a variant of it (research D1), and the same
 * drawing as the web dial down to the radial fractions above (G23).
 *
 * THE ROTATION GOES ON THE WRAPPER, NEVER ON THE NEEDLE. `rotate` turns a view
 * about its own centre, and a needle drawn as a bar has its centre halfway
 * along itself — so rotating the needle directly makes it orbit its own
 * midpoint and swing out of the circle, while the style object reads exactly as
 * intended. **Jest cannot see this**: `jest-expo` has no layout engine, so a
 * transform on the needle and one on a concentric wrapper produce identical
 * trees. `dial-geometry.test.tsx` can only assert that the needle itself
 * carries no rotation; the paired screenshot in T052 is the rest of the gate,
 * and the web e2e (`helpers.ts:needleAngleDeg`) is what actually proved the
 * shape this file copies (research D5, guarantee G21).
 *
 * The angle and the opacity live in Reanimated shared values written from the
 * continuous channel, so they animate on the UI thread and never re-render
 * React at reading rate (Principle V, guarantee R1).
 */
export function TuningDial({
  state,
  accidentalStyle,
  activePitchClass,
  subscribeToReading,
  hub,
}: TuningDialProps) {
  const colors = useThemeColors();
  const appearance = useAppearance();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();

  const angle = useSharedValue(0);
  /**
   * 1 while a reading is live, 0 once it lapses (FR-162).
   *
   * A shared value rather than React state for the same reason the angle is:
   * it is written from the continuous channel, at reading rate.
   */
  const opacity = useSharedValue(1);

  /**
   * The accumulated, unwrapped angle. A ref rather than state because it is
   * written ~43 times a second, and it must persist across renders: folding it
   * back into [0, 360) is precisely what makes the needle spin a full turn
   * backwards at the top of the dial (data-model §5, guarantee G11).
   */
  const angleRef = useRef(0);

  /**
   * FR-163: nothing is drawn until something has been heard. "No angle yet" is
   * a different state from "an angle of zero" — a needle parked straight up
   * before the first pluck reads as "C detected".
   */
  const [hasReading, setHasReading] = useState(false);
  // Guards the one setState this component is allowed to make from the
  // continuous channel. It fires once per session, on the first reading.
  const announcedReading = useRef(false);

  const [reduceMotion, setReduceMotion] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  // FR-165: drop the animation entirely under reduced motion, rather than
  // merely shortening it. Same shape as `TuningLine`.
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
      subscribeToReading((cents, _clarity, midi) => {
        // A lapse holds the needle's ANGLE and fades it out of sight (FR-162).
        //
        // Both halves matter. Holding is right because the dial's rest position
        // would name a note, where the line's means nothing — but a needle left
        // visible goes on pointing at a string the player damped, which is what
        // was reported against the web build and fixed there first (Defect 2).
        // The angle survives in `angleRef`, so the needle fades back in where
        // it left rather than sweeping from anywhere (FR-162b).
        if (cents === null || midi === null) {
          opacity.value = reduceMotion
            ? 0
            : withTiming(0, { duration: motion.colorMs, easing: Easing.out(Easing.quad) });
          return;
        }

        if (!announcedReading.current) {
          announcedReading.current = true;
          setHasReading(true);
        }

        const next = unwrapDegrees(angleRef.current, dialAngleDegrees(midi, cents));
        angleRef.current = next;
        angle.value = reduceMotion
          ? next
          : withTiming(next, { duration: motion.markerMs, easing: Easing.out(Easing.quad) });
        opacity.value = reduceMotion
          ? 1
          : withTiming(1, { duration: motion.colorMs, easing: Easing.out(Easing.quad) });
      }),
    [subscribeToReading, angle, opacity, reduceMotion]
  );

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
    opacity: opacity.value,
  }));

  /**
   * The smallest of the cap, the width this component was given, and the height
   * actually left over — the same three terms as web's `min()`.
   *
   * `windowWidth` stands in until the first layout so the face is never drawn at
   * zero, which also keeps the component meaningful under a test runner that
   * never lays anything out.
   */
  const size = Math.min(
    MAX_SIZE,
    measuredWidth || windowWidth,
    windowHeight - columnChrome(statusSlotEstimate(fontScale))
  );

  const noteSize = size * NOTE_SIZE_RATIO;
  const segments = Array.from({ length: SEGMENTS }, (_, pitchClass) => pitchClass);

  return (
    <View
      style={styles.measure}
      onLayout={(event: LayoutChangeEvent) => setMeasuredWidth(event.nativeEvent.layout.width)}
    >
      <View
        testID="tuning-dial"
        // The needle's position is the same information the announcer speaks,
        // and it moves ~43 times a second. Announcing it too would be noise
        // (G24).
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        // NOTHING IN THE DIAL IS INTERACTIVE, AND IT MUST NOT ACT AS IF IT IS.
        //
        // Every rotated mark is a wrapper the size of the whole dial, because
        // the transform has to go on a concentric view rather than on the mark
        // (G21) — and a rotated square receives touches over its ROTATED area,
        // which overhangs the dial's own box by up to ((√2 − 1) / 2) x size.
        // On web that was 101px past the rim and made the settings badge above
        // the dial unreachable except at its two extreme ends (Defect 3). The
        // corners paint nothing, so the reach is invisible until something
        // inside it needs a touch (G24a).
        pointerEvents="none"
        style={[styles.dial, { width: size, height: size }]}
      >
        <View testID="dial-rim" style={[styles.rim, { borderColor: colors.line }]} />

        {segments.map((pitchClass) => (
          <View
            key={`tick-${pitchClass}`}
            testID="dial-tick"
            style={[
              styles.fill,
              {
                transform: [
                  {
                    rotate: `${DIAL_SEGMENT_DEGREES / 2 + pitchClass * DIAL_SEGMENT_DEGREES}deg`,
                  },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.mark,
                {
                  top: 0,
                  // 2 is a STROKE width, tangential rather than radial, and
                  // stays fixed on purpose: a proportional hairline goes
                  // sub-pixel and blurs on a small dial. The length beside it
                  // is radial and does scale (G25).
                  width: 2,
                  height: radialSpan(TICK_INNER_RADIUS, 1),
                  marginLeft: -1,
                  backgroundColor: colors.line,
                },
              ]}
            />
          </View>
        ))}

        {activePitchClass !== null && (
          <View
            testID="dial-target"
            style={[
              styles.fill,
              { transform: [{ rotate: `${activePitchClass * DIAL_SEGMENT_DEGREES}deg` }] },
            ]}
          >
            <View
              style={[
                styles.mark,
                {
                  top: 0,
                  // Wider than a boundary tick and reaching further in, so the
                  // two are told apart by shape as well as by colour (FR-015).
                  width: 4,
                  height: radialSpan(TICK_INNER_RADIUS - 0.03, 1),
                  marginLeft: -2,
                  backgroundColor: stateColor(state, appearance),
                },
              ]}
            />
          </View>
        )}

        {segments.map((pitchClass) => {
          const radians = (pitchClass * DIAL_SEGMENT_DEGREES * Math.PI) / 180;
          const active = activePitchClass === pitchClass;

          return (
            <Text
              key={`label-${pitchClass}`}
              testID="dial-label"
              style={[
                styles.label,
                {
                  left: `${50 + 50 * LABEL_RADIUS * Math.sin(radians)}%`,
                  top: `${50 - 50 * LABEL_RADIUS * Math.cos(radians)}%`,
                  fontSize: labelFontSize(size),
                  // Weight as well as colour, so the active segment survives
                  // greyscale (FR-015, SC-070).
                  fontWeight: active ? '700' : '400',
                  color: active ? stateColor(state, appearance) : colors.text,
                  // React Native has no percentage-of-self transform, so the
                  // label cannot be centred the way web centres it with
                  // `translate(-50%, -50%)`. Half its own box, in points, is
                  // the only form of that correction available here — which is
                  // exactly the mistake `ruler-geometry.test.tsx` exists to
                  // catch, made deliberately and with the size to hand.
                  marginLeft: -labelFontSize(size),
                  marginTop: -labelFontSize(size) * 0.6,
                  width: labelFontSize(size) * 2,
                },
              ]}
            >
              {/* The ONE place accidental style is applied, reused rather than
                  reimplemented — which is what makes FR-156 structural. */}
              {noteName(pitchClass, accidentalStyle)}
            </Text>
          );
        })}

        {hasReading && (
          <Animated.View testID="dial-needle-wrapper" style={[styles.fill, needleStyle]}>
            <View
              testID="dial-needle"
              style={[
                styles.mark,
                {
                  // A band in the outer face, no longer reaching the centre:
                  // the centre carries the note name and the cents readout
                  // (FR-157, FR-168), and a needle through them would cross the
                  // text at every angle it can point.
                  top: fromTop(NEEDLE_OUTER_RADIUS),
                  height: radialSpan(NEEDLE_INNER_RADIUS, NEEDLE_OUTER_RADIUS),
                  // The one stroke here that is NOT fixed, and the exception is
                  // earned: a needle confined to the outer band is a fraction
                  // of the length it had reaching the centre, and at a fixed
                  // 6pt it reads as a dash rather than as the dominant mark
                  // FR-021 asks for.
                  width: needleWidth(size),
                  marginLeft: -needleWidth(size) / 2,
                  borderRadius: needleWidth(size),
                  backgroundColor: stateColor(state, appearance),
                },
              ]}
            />
          </Animated.View>
        )}

        <View
          testID="dial-hub"
          style={[styles.hub, { width: `${HUB_RADIUS * 100}%`, height: `${HUB_RADIUS * 100}%` }]}
        >
          {hub?.(noteSize)}
        </View>
      </View>
    </View>
  );
}

/**
 * The status slot's height, estimated from the text scale.
 *
 * Duplicated rather than imported from `StatusBanner` on purpose: importing it
 * would make the dial depend on a sibling molecule for a number it only needs
 * an approximation of. Being a few points out moves the dial a few points; the
 * `min()` above still bounds it, and the paired screenshot is what judges it.
 */
function statusSlotEstimate(fontScale: number): number {
  return typeTokens.labelSize * 1.4 * 2 * fontScale + space.sm;
}

/**
 * Segment labels scale with the dial, with a ceiling and deliberately no floor.
 *
 * The floor was `10`, on the reasoning that the ring has room to spare in both
 * directions — twelve labels 30° apart at 0.66R being nowhere near touching.
 * True of a large dial, false of a small one: the spacing shrinks with the
 * circle while a floored glyph does not, and web measured adjacent labels
 * touching at a ~90px dial and piling into a smear below that. That is G25's
 * collision in the one dimension its table does not list, the type. Removed on
 * both platforms together, because G23 is one drawing rather than two that
 * agree at the sizes anyone happened to screenshot.
 *
 * The ceiling stays: it stops the labels growing into the needle on a big dial.
 */
function labelFontSize(size: number): number {
  return Math.min(20, size * 0.04);
}

function needleWidth(size: number): number {
  return Math.max(6, size * 0.017);
}

const styles = StyleSheet.create({
  measure: {
    width: '100%',
    alignItems: 'center',
  },
  dial: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 9999,
    // NO opacity multiplier, here or anywhere below. A dimmed token is
    // invisible to the palette test and to Axe alike, and has defeated the 3:1
    // floor twice in this repo (G22).
    borderWidth: 2,
  },
  fill: { ...StyleSheet.absoluteFill },
  mark: {
    position: 'absolute',
    left: '50%',
  },
  label: {
    position: 'absolute',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  hub: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
