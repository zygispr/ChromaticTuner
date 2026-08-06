import { render, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

/**
 * A file-local Reanimated mock, for one reason: the shared value in
 * `jest.setup.js` is `(initial) => ({ value: initial })`, a fresh object per
 * render, so a value written between renders is lost at the next one. These
 * tests read the marker's position across a re-render — the layout event is
 * what triggers it — so the value has to survive one, as a real shared value
 * does. Everything else matches the global mock.
 */
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
    useSharedValue: (initial: number) => React.useRef({ value: initial }).current,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (target: number) => target,
    Easing: { out: () => easingFn, quad: easingFn, linear: easingFn },
  };
});

// Imported after the mock so the component picks it up.
import { TuningLine } from '../src/components/molecules/TuningLine';

import { Themed } from './theme-harness';

/**
 * The ruler is as wide as the screen allows it to be (FR-018, FR-021).
 *
 * The mobile port drew it at a hardcoded 320pt while web drew it at `width:
 * 100%` capped at 720 — so on a 393pt iPhone the signature element of the app
 * sat inside 36pt gutters where the screen's own padding asks for 16, and the
 * same ruler was a different drawing on the two platforms again.
 *
 * 320 is also a phone from 2016: every point of unused width is resolution the
 * player loses, since half the rule is 50 cents no matter how wide it is.
 *
 * These assert the invariant — travel scales with the width the ruler is given
 * — rather than any particular number, because a second hardcoded constant
 * would fail on exactly the device it was measured against and no other.
 */

const HIDDEN = { includeHiddenElements: true } as const;

type CentsHandler = (cents: number | null) => void;

interface LayoutLike {
  readonly nativeEvent: {
    readonly layout: { readonly x: number; readonly y: number; width: number; height: number };
  };
}

interface Box {
  readonly width?: string | number;
  readonly maxWidth?: number;
  readonly transform?: readonly { readonly translateX?: number }[];
}

function flatten(element: { props: { style?: unknown } }): Box {
  return StyleSheet.flatten(element.props.style) as Box;
}

async function renderLine() {
  let handler: CentsHandler | null = null;
  const view = await render(
    <Themed>
      <TuningLine
        state="flat"
        subscribeToCents={(incoming) => {
          handler = incoming;
          return () => {
            handler = null;
          };
        }}
      />
    </Themed>
  );

  return {
    view,
    emit: (cents: number | null) => handler?.(cents),
    /**
     * Yoga runs natively, so nothing measures this tree under Jest — the layout
     * event is the component's only source of truth for its own width, and
     * delivering one here is what a real frame does.
     *
     * Invoked as a prop rather than through `fireEvent(el, 'layout', …)`:
     * RNTL's dispatcher drops this one silently, leaving a test that passes a
     * width nothing ever reads. `act` is what flushes the state update it
     * causes, so the next query sees the re-rendered marker.
     */
    layout: async (width: number) => {
      const line = view.getByTestId('tuning-line', HIDDEN) as unknown as {
        props: { onLayout?: (event: LayoutLike) => void };
      };
      await act(async () => {
        line.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width, height: 96 } } });
      });
    },
    markerOffset: () =>
      flatten(view.getByTestId('tuning-marker', HIDDEN)).transform?.[0]?.translateX,
  };
}

describe('the ruler fills the width it is given (FR-018, FR-021)', () => {
  it('asks for the full width rather than a fixed number of points', async () => {
    const { view } = await renderLine();

    const container = flatten(view.getByTestId('tuning-line', HIDDEN));
    expect(container.width).toBe('100%');
    // Capped like web, so a tablet or a landscape phone does not stretch the
    // rule past the distance an eye can track in one glance.
    expect(container.maxWidth).toBeGreaterThan(320);
  });

  it('scales marker travel to the measured width, not to a constant', async () => {
    const { emit, layout, markerOffset } = await renderLine();

    // Full deflection: at the display range the marker sits on the end of the
    // rule, which is half the ruler's width from centre — whatever that is.
    emit(-50);

    await layout(360);
    expect(markerOffset()).toBeCloseTo(-180);

    // The same reading on a narrower ruler is a proportionally shorter travel.
    // A hardcoded width answers -160 to both.
    await layout(200);
    expect(markerOffset()).toBeCloseTo(-100);
  });

  it('keeps the in-tune zone proportional to the rule', async () => {
    const { view } = await renderLine();

    // A zone sized in points would stop meaning ±5 cents the moment the rule
    // stopped being 320 wide, and would say "in tune" over the wrong span.
    const zone = flatten(view.getByTestId('in-tune-zone', HIDDEN));
    expect(typeof zone.width).toBe('string');
    expect(String(zone.width)).toMatch(/%$/);
  });
});
