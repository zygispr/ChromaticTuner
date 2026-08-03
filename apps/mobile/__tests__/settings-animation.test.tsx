import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { useRef, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * User Story 5 (T041, T042): the backdrop stops sliding in with the sheet.
 *
 * **Deviation from T041/T042, which named `settings.test.tsx`.** Both
 * assertions need a Reanimated mock that RECORDS what it was asked to animate,
 * and the shared mock in `jest.setup.js` resolves `withTiming` straight to its
 * target — under it, an animated sheet and a non-animated one render
 * identically, so a reduced-motion test there would pass either way. A
 * file-local mock is the same approach `marker-rest.test.tsx` takes, and for
 * the same reason.
 */

const timingTargets: number[] = [];

jest.mock('react-native-reanimated', () => {
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

import { SettingsScreen } from '../src/components/screens/SettingsScreen';

function Wrapper({ children }: { children: ReactNode }) {
  const ports = useRef({ audioSource: new ScriptedAudioSource(), wakeLock: new NoopWakeLock() });
  return (
    <TunerProvider
      audioSource={ports.current.audioSource}
      wakeLock={ports.current.wakeLock}
      preferences={new InMemoryPreferencesStore()}
      autoStart={false}
    >
      {children}
    </TunerProvider>
  );
}

async function renderSheet() {
  const view = await render(
    <Wrapper>
      <SettingsScreen open onClose={jest.fn()} />
    </Wrapper>
  );

  // Let the async reduced-motion check resolve. The sheet holds off-screen
  // until the preference is known, so without this the tree is still in its
  // "unknown" state and nothing has been asked to animate either way.
  //
  // A real timer, not `Promise.resolve()`: a microtask settle overlaps RNTL's
  // own act scope from `render` and React tears the tree down with "overlapping
  // act() calls", which surfaces as a render that produced nothing at all.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  return view;
}

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  timingTargets.length = 0;
});

describe('sheet presentation (FR-055, FR-056, FR-057)', () => {
  it('does not let the platform slide the whole modal, backdrop included', async () => {
    await renderSheet();

    // `animationType="slide"` animates the modal's single root container, and
    // the backdrop lives inside it — so the dim swept up from the bottom edge
    // with the sheet. The two cannot move independently while it is in use.
    const modal = screen.getByTestId('settings-modal');
    expect(modal.props.animationType).not.toBe('slide');
    expect(modal.props.animationType).toBe('none');
  });

  it('animates the sheet itself instead (FR-056)', async () => {
    await renderSheet();

    // The slide has to come from somewhere once the Modal stops providing it.
    expect(timingTargets.length).toBeGreaterThan(0);
    // It travels to 0 — its resting position, flush with the bottom edge.
    expect(timingTargets[timingTargets.length - 1]).toBe(0);
  });

  it('drops the animation entirely under reduced motion (FR-057)', async () => {
    // Paired with the positive on purpose. On its own the negative passes
    // against unfixed code for the emptiest possible reason — there is no
    // animation yet to suppress — which is the same vacuous shape the US2
    // negatives had to be rescued from.
    await renderSheet();
    expect(timingTargets.length).toBeGreaterThan(0);

    cleanup();
    timingTargets.length = 0;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    await renderSheet();

    // Dropped, not shortened — the convention `TuningLine.tsx` already
    // established for the marker (FR-016). A shortened animation still moves,
    // which is the thing the preference asks the app not to do.
    expect(timingTargets).toHaveLength(0);

    // And the sheet is still there. Worth asserting in the same test rather
    // than a separate one: the animation now holds the sheet off-screen until
    // the preference resolves, so "no animation" and "no sheet" are one bad
    // edit apart.
    expect(screen.getByTestId('settings-sheet')).toBeTruthy();
    expect(screen.getByTestId('settings-close')).toBeTruthy();
  });
});
