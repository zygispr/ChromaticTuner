import type { TuningState } from '@chromatic-tuner/core';
import { render } from '@testing-library/react-native';

/**
 * User Story 2 on mobile (T021): the marker is told to return to rest when the
 * reading lapses.
 *
 * **Deviation from T021, which named `tuner-flow.test.tsx`.** The assertion
 * there cannot work. The marker's position lives in a Reanimated shared value
 * written from the continuous channel, which by design never triggers a React
 * render (guarantee R1) — so the rendered `transform` reflects whatever the
 * value held at the last render, not what the lapse just set. A test reading
 * the rendered style measures the mock's render timing, not the component: the
 * first draft of it passed against unfixed code for exactly that reason.
 *
 * What IS observable, and is the thing that matters, is whether the component
 * asks for the rest position at all. So this file mocks `withTiming` as a spy
 * and asserts on the targets requested. It needs a file-local Reanimated mock,
 * which is why it is a separate file rather than an addition to the flow tests.
 */

const timingTargets: number[] = [];

jest.mock('react-native-reanimated', () => {
  // `require` rather than an import: jest.mock factories are hoisted above the
  // import block, so anything they close over must be resolved at call time.
  // This mirrors the factories already in `apps/mobile/jest.setup.js`.
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
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (target: number) => {
      timingTargets.push(target);
      return target;
    },
    Easing: { out: () => easingFn, quad: easingFn, linear: easingFn },
  };
});

// Imported after the mock so the component picks it up.
import { TuningLine } from '../src/components/molecules/TuningLine';

type CentsHandler = (cents: number | null) => void;

async function renderLine(state: TuningState = 'flat') {
  let handler: CentsHandler | null = null;
  const subscribeToCents = (incoming: CentsHandler) => {
    handler = incoming;
    return () => {
      handler = null;
    };
  };

  // RNTL 14 made `render` asynchronous; without the await the effect that
  // establishes the subscription has not run and `handler` is still null.
  const view = await render(<TuningLine state={state} subscribeToCents={subscribeToCents} />);
  return { view, emit: (cents: number | null) => handler?.(cents) };
}

beforeEach(() => {
  timingTargets.length = 0;
});

describe('marker rest on lapse (FR-043, FR-044)', () => {
  it('animates back to the rest position when the reading lapses', async () => {
    const { emit } = await renderLine();

    emit(-30);
    const displaced = timingTargets[timingTargets.length - 1];
    expect(displaced).toBeDefined();
    expect(Math.abs(displaced!)).toBeGreaterThan(5);

    emit(null);

    // Rest is 0 — the same coordinate the shared value starts at, which is what
    // FR-044 requires. A lapse that resolved to anything else would leave the
    // marker somewhere no reading ever put it.
    expect(timingTargets[timingTargets.length - 1]).toBe(0);
  });

  it('reaches rest through the same animation path as a real reading (FR-043)', async () => {
    const { emit } = await renderLine();

    emit(-40);
    const beforeLapse = timingTargets.length;
    emit(null);

    // One more timing call, not a direct assignment: the marker should travel
    // back rather than teleport, so a lapse reads as the marker letting go.
    expect(timingTargets.length).toBe(beforeLapse + 1);
  });

  it('tracks again after resting', async () => {
    const { emit } = await renderLine();

    emit(-30);
    emit(null);
    emit(25);

    const last = timingTargets[timingTargets.length - 1];
    expect(last).toBeDefined();
    expect(last!).toBeGreaterThan(5);
  });
});
