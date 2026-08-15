import type { TuningState } from '@chromatic-tuner/core';
import { motion } from '@chromatic-tuner/tokens';
import { act, cleanup, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

/**
 * V66 / FR-165 on mobile — Reduce Motion removes the sweep, it does not shorten
 * it.
 *
 * The web half of this lives in `apps/web/e2e/dial-motion.spec.ts` and can read
 * a composed `transition-duration` off a real browser. Nothing here can: the
 * angle and the opacity are Reanimated shared values written from the
 * continuous channel, which by design never re-renders React, so the style in
 * the rendered tree reflects whatever the values held at the LAST render rather
 * than what the last reading set. What is observable is what the component
 * ASKS for — hence `withTiming` as a spy, the same instrument
 * `dial-rest.test.tsx` and `marker-rest.test.tsx` already use — and the shared
 * values themselves, captured as they are created.
 *
 * Both halves of the pairing are asserted in every case. "No `withTiming`
 * calls" passes for the emptiest possible reason on a component that never
 * animated anything, which is the vacuity `settings-animation.test.tsx` had to
 * be rescued from; so each reduced-motion assertion sits beside one that the
 * needle still MOVED to the right angle.
 */

interface TimingCall {
  readonly target: number;
  readonly duration: number | undefined;
}

const timingCalls: TimingCall[] = [];
/**
 * Every shared value the component created, in creation order.
 *
 * The component makes exactly two and always in this order — the angle, then
 * the opacity — and their initial values (0 and 1) are asserted below so a
 * reordering shows up as a failed expectation rather than as a silently
 * swapped instrument.
 */
const sharedValues: Array<{ value: number }> = [];

jest.mock('react-native-reanimated', () => {
  // `require` rather than an import: jest.mock factories are hoisted above the
  // import block, so anything they close over must be resolved at call time.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const AnimatedView = React.forwardRef((props: object, ref: unknown) =>
    React.createElement(View, { ...props, ref })
  );
  AnimatedView.displayName = 'Animated.View';

  const easingFn = () => 0;

  return {
    __esModule: true,
    default: { View: AnimatedView },
    // MEMOISED, unlike the mock in `dial-rest.test.tsx`, and it has to be. A
    // shared value is created once and survives every render; a mock that
    // returns a fresh object each time hands the component a new one on every
    // re-render — and this dial re-renders three times before the first
    // reading (the reduced-motion preference resolving, the layout measuring,
    // the needle mounting). Captured at render time, the object the test held
    // was the FIRST one and the component was writing to the third: the angle
    // read back as 0 forever while the component was working correctly.
    // `dial-rest.test.tsx` never noticed because it only ever inspects
    // `withTiming` calls.
    useSharedValue: (initial: number) => {
      // No type argument: `React` here comes from `require` inside a hoisted
      // mock factory, so it is untyped and `useRef<T>()` is a compile error.
      const ref = React.useRef(null) as { current: { value: number } | null };
      if (ref.current === null) {
        ref.current = { value: initial };
        sharedValues.push(ref.current);
      }
      return ref.current;
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (target: number, config?: { duration?: number }) => {
      timingCalls.push({ target, duration: config?.duration });
      return target;
    },
    Easing: { out: () => easingFn, quad: easingFn, linear: easingFn },
  };
});

// Imported after the mock so the component picks it up.
import { TuningDial } from '../src/components/molecules/TuningDial';

import { Themed } from './theme-harness';

type ReadingHandler = (cents: number | null, clarity: number, midi: number | null) => void;

/** B2 is pitch class 11 — 330°, and the short way there from 0° is −30. */
const MIDI_B2 = 47;
/** C3 is pitch class 0 — 0°, thirty degrees on from where the needle now is. */
const MIDI_C3 = 48;

async function renderDial(state: TuningState = 'in-tune') {
  let handler: ReadingHandler | null = null;
  await render(
    <Themed>
      <TuningDial
        state={state}
        accidentalStyle="sharp"
        activePitchClass={4}
        subscribeToReading={(incoming) => {
          handler = incoming;
          return () => {
            handler = null;
          };
        }}
      />
    </Themed>
  );

  // `isReduceMotionEnabled()` is a promise, and the subscription effect re-runs
  // when it resolves. Emitting before that flush would exercise the default
  // preference no matter what the spy was told to return — the failure mode
  // being that the reduced-motion test quietly tests the other branch.
  await act(async () => {});

  return {
    angle: sharedValues[0]!,
    opacity: sharedValues[1]!,
    // Wrapped in `act`: the FIRST reading flips `hasReading`, which mounts the
    // needle. Un-awaited, React reports overlapping `act()` calls and the
    // subscription effect stops running in every LATER test in the file.
    emit: (cents: number | null, midi: number | null) =>
      act(() => {
        handler?.(cents, midi === null ? 0 : 1, midi);
      }),
  };
}

beforeEach(() => {
  timingCalls.length = 0;
  sharedValues.length = 0;
  jest.restoreAllMocks();
});

// RNTL's automatic cleanup does not register under this jest-expo setup, so a
// mounted tree survives into the next test — as `settings.test.tsx` records.
// Here the leftover component keeps its subscription and leaks its `act` scope.
afterEach(cleanup);

describe('the needle under Reduce Motion (FR-165, V66)', () => {
  it('animates the angle and the fade when motion is allowed (positive half)', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const { angle, opacity, emit } = await renderDial();
    expect(angle.value).toBe(0);
    expect(opacity.value).toBe(1);

    await emit(0, MIDI_B2);
    await emit(null, null);

    // Both channels animate, and they are told apart by DURATION rather than by
    // value: `unwrapDegrees` returns the short way round, so a needle crossing
    // twelve o'clock is asked for exactly 0 — which is also a lapsed opacity.
    expect(timingCalls.some((call) => call.duration === motion.markerMs)).toBe(true);
    expect(timingCalls.some((call) => call.duration === motion.colorMs)).toBe(true);
  });

  it('drops the animation entirely rather than shortening it', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { angle, opacity, emit } = await renderDial();

    await emit(0, MIDI_B2);
    await emit(null, null);

    // Dropped, not shortened. A shortened animation still moves, which is the
    // thing the preference asks the app not to do — the convention
    // `TuningLine.tsx` established for the marker (FR-016).
    expect(timingCalls).toHaveLength(0);

    // And the needle still went somewhere and still faded, which is what stops
    // the assertion above passing on a dial that stopped updating at all.
    expect(angle.value).toBeCloseTo(-30, 5);
    expect(opacity.value).toBe(0);
  });

  it('still crosses the top of the dial the short way with no tween (V66 step 4, G10)', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { angle, emit } = await renderDial();

    // Unwrapping is not an animation concern, and this is the case that says
    // so. An implementation that folded the unwrap into the animated path —
    // unwrap only when there is a tween to unwrap — would leave the needle
    // jumping the long way round for exactly the users who asked for less
    // movement. The identity function asks for 330 here.
    await emit(0, MIDI_B2);
    expect(angle.value).toBeCloseTo(-30, 5);

    await emit(0, MIDI_C3);
    expect(angle.value).toBeCloseTo(0, 5);
  });
});
