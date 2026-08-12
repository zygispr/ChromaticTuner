import type { TuningState } from '@chromatic-tuner/core';
import { motion } from '@chromatic-tuner/tokens';
import { act, cleanup, render } from '@testing-library/react-native';

/**
 * FR-162 / FR-163 on mobile, mirroring `marker-rest.test.tsx`.
 *
 * **The dial's lapse behaviour is the opposite of the line's, and that is
 * deliberate.** The line returns its marker to centre, because centre means
 * nothing on a line. The dial's rest position would be a real note, so the
 * needle HOLDS its angle — and then fades out of sight entirely, because a
 * needle left visible goes on pointing at a string the player has damped
 * (FR-162, FR-162a, FR-162b).
 *
 * **Deviation from T044 as written.** The task describes the Phase 3 behaviour:
 * "hold angle and recolour on lapse". That is the half-built version of FR-162
 * the maintainer reported against the running web app — see Defect 2 in
 * tasks.md — and mobile is built from the corrected requirement rather than
 * from the task's snapshot of it. A test written to the task would pin the
 * defect on this platform exactly as `dial-rest.spec.ts` did on web.
 *
 * Same instrument as `marker-rest.test.tsx`, for the same reason: the needle's
 * angle and opacity live in Reanimated shared values written from the
 * continuous channel, which by design never triggers a React render (R1). The
 * rendered style therefore reflects whatever the values held at the last
 * render, not what the lapse just set — a test reading it measures the mock's
 * timing rather than the component. What IS observable is what the component
 * ASKS for, so `withTiming` is a spy and the assertions are about the targets
 * requested.
 */

interface TimingCall {
  readonly target: number;
  readonly duration: number | undefined;
}

const timingCalls: TimingCall[] = [];

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
    useSharedValue: (initial: number) => ({ value: initial }),
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

const HIDDEN = { includeHiddenElements: true } as const;

/** E2 and F♯2, two pitch classes apart, so a change of angle is unmistakable. */
const MIDI_E2 = 40;
const MIDI_FS2 = 42;

async function renderDial(state: TuningState = 'in-tune') {
  let handler: ReadingHandler | null = null;
  const view = await render(
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

  return {
    view,
    // Wrapped in `act`: the FIRST reading flips `hasReading`, which mounts the
    // needle. Without it React warns and the tree the assertions query is the
    // one from before the update.
    emit: (cents: number | null, midi: number | null) =>
      act(() => {
        handler?.(cents, midi === null ? 0 : 1, midi);
      }),
  };
}

beforeEach(() => {
  timingCalls.length = 0;
});

// RNTL's automatic cleanup does not register under this jest-expo setup, so a
// mounted tree survives into the next test — as `settings.test.tsx` already
// records. Here it is worse than a stale query: the leftover component keeps
// its subscription, and its `act` scope leaks into the next test.
afterEach(cleanup);

/**
 * The two shared values are told apart by DURATION, not by value.
 *
 * The obvious discriminator — opacity is only ever 0 or 1 — is wrong, and this
 * test caught it: `unwrapDegrees` returns the angle by the SHORT way, so a
 * needle crossing twelve o'clock is asked for exactly `0`, which is also the
 * opacity of a lapsed needle. The angle animates over `markerMs` and the fade
 * over `colorMs`, and those never collide.
 */
function angleTargets(): number[] {
  return timingCalls.filter((call) => call.duration === motion.markerMs).map((c) => c.target);
}

function lastOpacityTarget(): number | undefined {
  return timingCalls.filter((call) => call.duration === motion.colorMs).at(-1)?.target;
}

describe('the lapsed needle (FR-162, FR-163)', () => {
  it('draws no needle until something has been heard (FR-163)', async () => {
    const { view } = await renderDial();

    expect(view.queryAllByTestId('dial-needle', HIDDEN)).toEqual([]);
  });

  it('fades out of sight when the reading lapses (FR-162)', async () => {
    const { emit } = await renderDial();

    await emit(0, MIDI_E2);
    expect(lastOpacityTarget()).toBe(1);

    await emit(null, null);

    // Zero, not a dimmed value. G22 forbids resting at any partial alpha —
    // nothing is left on screen to fail a contrast ratio only if the needle is
    // fully gone.
    expect(lastOpacityTarget()).toBe(0);
  });

  it('holds its angle through the lapse rather than resting on a note (FR-162)', async () => {
    const { emit } = await renderDial();

    await emit(0, MIDI_FS2);
    const heldAngle = angleTargets().at(-1);
    expect(heldAngle).toBeDefined();

    await emit(null, null);

    // The lapse asks for no new angle at all. Returning to rest is the LINE's
    // behaviour; the dial's rest position is 0°, which is C — a note the tuner
    // never heard.
    expect(angleTargets().at(-1)).toBe(heldAngle);
  });

  it('fades back in at the angle it left (FR-162b)', async () => {
    const { emit } = await renderDial();

    await emit(0, MIDI_FS2);
    const heldAngle = angleTargets().at(-1);

    await emit(null, null);
    expect(lastOpacityTarget()).toBe(0);

    await emit(0, MIDI_FS2);
    expect(lastOpacityTarget()).toBe(1);
    // Same note, so the same angle — and crucially it was never reset in
    // between, which is what an unmount-and-remount would have done.
    expect(angleTargets().at(-1)).toBe(heldAngle);
  });

  it('always takes the short way round, including across the top (G9, G10)', async () => {
    const { emit } = await renderDial();

    // B2 is MIDI 47, pitch class 11, which is 330° — and the needle starts at
    // 0°. The short way there is BACKWARDS by 30, not forwards by 330.
    await emit(0, 47);
    expect(angleTargets().at(-1)).toBeCloseTo(-30, 5);

    // Then C3 (MIDI 48), which is 0° — 30° on from where the needle now is.
    await emit(0, 48);
    expect(angleTargets().at(-1)).toBeCloseTo(0, 5);

    // Stated as the invariant as well as the values, because this is the whole
    // of G9: no step may exceed half a turn. The identity function — the
    // unfixed code — asks for 330 and then 0, a 330° lurch backwards to travel
    // 30° forwards, and BOTH of its endpoints are correct. An assertion about
    // where the needle came to rest cannot see this at all.
    const steps = angleTargets();
    for (let i = 1; i < steps.length; i += 1) {
      expect(Math.abs(steps[i]! - steps[i - 1]!)).toBeLessThanOrEqual(180);
    }
  });
});
