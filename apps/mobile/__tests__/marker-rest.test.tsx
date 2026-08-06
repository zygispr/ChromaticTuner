import type { TuningState } from '@chromatic-tuner/core';
import { a11y } from '@chromatic-tuner/tokens';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

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

import { Themed } from './theme-harness';

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
  const view = await render(
    <Themed>
      <TuningLine state={state} subscribeToCents={subscribeToCents} />
    </Themed>
  );
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

/**
 * The ruler is never dimmed (FR-017, FR-021, WCAG 2.1 1.4.11).
 *
 * jest has no compositor, so this cannot measure the rendered contrast the way
 * `a11y.spec.ts` does on web. What it CAN do is forbid the mechanism: the rule
 * and its ticks were dimmed to 0.6 and 0.5, which composited `line` to 2.14:1
 * and 1.85:1 against a 3:1 floor. Nothing caught it — the tokens package checks
 * the palette, and Axe's contrast rule covers text only.
 *
 * So an `opacity` on either is a failure by construction here. The hierarchy
 * between major and minor ticks is carried by size, which costs no contrast.
 */
describe('the tuning ruler carries no opacity multiplier', () => {
  it('leaves the rule and every tick at full strength', async () => {
    const { view } = await renderLine('in-tune');

    // Walk the rendered tree rather than querying by type: every node in this
    // subtree is part of the ruler, and a dimmed one anywhere is the defect.
    const dimmed: number[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const element = node as { props?: { style?: unknown }; children?: unknown[] };
      const style = StyleSheet.flatten(element.props?.style) as { opacity?: number } | undefined;
      if (style?.opacity !== undefined && style.opacity < 1) dimmed.push(style.opacity);
      for (const child of element.children ?? []) walk(child);
    };
    walk(view.toJSON());

    // Two exemptions, both by value so a new one cannot appear unnoticed:
    //
    // - 0.12 / 0.28, the in-tune band. A soft zone behind the marker, and
    //   deliberately translucent — its meaning is redundant with the marker,
    //   the cents readout and the direction cue, so 1.4.11 does not bind it.
    // - `mutedOpacity`, the FLAT/SHARP labels. Those ARE bound, by the 4.5:1
    //   text floor rather than the 3:1 graphic one, and they are checked where
    //   the check is possible: `packages/tokens/tests/contrast.test.ts`
    //   composites `text` at this exact token over each surface and measures
    //   the result. Referenced rather than written as 0.65 so the two cannot
    //   drift apart and quietly re-open the exemption.
    //
    // Anything ELSE dimmed is the defect this guards.
    const exempt = [0.12, 0.28, a11y.mutedOpacity];
    expect(dimmed.filter((o) => !exempt.includes(o))).toEqual([]);
  });
});
