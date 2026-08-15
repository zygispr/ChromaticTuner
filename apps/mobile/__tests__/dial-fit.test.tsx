import { a11y, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { cleanup, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { TuningDial } from '../src/components/molecules/TuningDial';

import { Themed } from './theme-harness';

/**
 * V69 on mobile — the dial fits the phone it is given, at the reader's text
 * size.
 *
 * The web half of this varies the viewport in a real browser (`dial.spec.ts`,
 * the `fits the viewport` and `never overlap` cases). Mobile cannot:
 * `jest-expo` has no layout engine, so `onLayout` never fires and there is
 * nothing to measure. What it CAN check is the arithmetic the component does
 * before any of that — which is where the fitting defect lived on web, and
 * which on this platform has one input web does not have at all.
 *
 * **That input is `fontScale`, and it is the reason this file exists.** Web's
 * type scale is fixed pixels, so a browser's text-size setting moves nothing on
 * the tuner screen; a phone's does, and the status slot above the microphone
 * control grows with it. A dial sized without that term is right on the default
 * setting and pushes the control off the screen at the largest one — the same
 * defect the maintainer reported on web (Defect 1), reached by a route web does
 * not have.
 *
 * **One render per test, and that is a limit of the runner rather than a
 * style.** Measured: the render that follows the SECOND explicit `cleanup` or
 * `unmount` in a file comes back as an empty tree, whether or not the screen
 * changed in between — and `afterEach(cleanup)` is one of the two. It is the
 * same family as the RNTL-under-jest-expo quirks `settings.test.tsx` and
 * `dial-rest.test.tsx` already record.
 *
 * That rules out the obvious shape for the text-size cases, which is to render
 * at two scales and compare. They assert the ARITHMETIC instead — the exact
 * size the screen and the scale imply — which is the stronger statement
 * anyway: a comparison says the dial got smaller, while this says by how much,
 * and a component that dropped the `fontScale` term fails it at every step
 * rather than only where two steps happen to differ.
 */

const HIDDEN = { includeHiddenElements: true } as const;

interface Screen {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly fontScale: number;
}

/**
 * The sums the component makes, restated here rather than imported.
 *
 * A test that reads its expectation out of the code under test asserts only
 * that the code is self-consistent — the note `dial-hub.spec.ts` opens with.
 */
function columnChrome(fontScale: number): number {
  const statusSlot = typeTokens.labelSize * 1.4 * 2 * fontScale + space.sm;
  return a11y.minTouchTarget * 2 + space.lg * 5 + statusSlot + space.md * 2;
}

/** G26: the cap is the smallest dial whose hub holds the note at full size. */
const MAX_SIZE = Math.round(typeTokens.noteSize / 0.24);

function expectedSize(screen: Screen): number {
  return Math.min(MAX_SIZE, screen.width, screen.height - columnChrome(screen.fontScale));
}

/** G25: proportional, with a ceiling and deliberately no floor. */
function expectedLabelSize(size: number): number {
  return Math.min(20, size * 0.04);
}

/**
 * Render the dial as though the phone were `screen`, and report its geometry.
 *
 * Through `Dimensions.get` rather than by mocking `useWindowDimensions`: the
 * hook's module is pulled in by React Native's own internals, so replacing it
 * takes more than the component down with it — tried, and the tree came back
 * empty. `useWindowDimensions` seeds its state from `Dimensions.get('window')`
 * on first render, so a spy installed before `render` is the whole of it.
 *
 * jest-expo's own default is 750x1334 at `fontScale: 2`, which is a screen no
 * assertion here should be resting on by accident.
 */
async function dialGeometry(screen: Screen): Promise<{ size: number; labelSize: number }> {
  jest.spyOn(Dimensions, 'get').mockReturnValue(screen as ReturnType<typeof Dimensions.get>);

  const view = await render(
    <Themed>
      <TuningDial
        state="in-tune"
        accidentalStyle="sharp"
        activePitchClass={4}
        subscribeToReading={() => () => {}}
      />
    </Themed>
  );

  const dial = StyleSheet.flatten(view.getByTestId('tuning-dial', HIDDEN).props.style) as {
    width: number;
    height: number;
  };
  const label = StyleSheet.flatten(view.getAllByTestId('dial-label', HIDDEN)[0]!.props.style) as {
    fontSize: number;
  };

  // Square, whatever it had to shrink to.
  expect(dial.width).toBe(dial.height);
  return { size: dial.width, labelSize: label.fontSize };
}

afterEach(cleanup);

const SCREENS: Array<[string, Screen]> = [
  ['a current phone', { width: 393, height: 852, scale: 3, fontScale: 1 }],
  ['the narrowest claimed', { width: 320, height: 568, scale: 2, fontScale: 1 }],
  ['the same phone in landscape', { width: 852, height: 393, scale: 3, fontScale: 1 }],
  // The largest step iOS offers without Larger Accessibility Sizes is ~1.35;
  // the accessibility steps go past 3. Both, because a dial that dropped the
  // term is correct at 1.0 and wrong by a growing margin above it.
  ['the largest ordinary text size', { width: 393, height: 700, scale: 3, fontScale: 1.35 }],
  ['the largest accessibility text size', { width: 393, height: 700, scale: 3, fontScale: 3.1 }],
];

describe('the dial fits the phone (V69, FR-018)', () => {
  for (const [name, screen] of SCREENS) {
    it(`takes the room left over on ${name}, and no more`, async () => {
      const { size, labelSize } = await dialGeometry(screen);

      expect(size).toBeGreaterThan(0);
      expect(size).toBeCloseTo(expectedSize(screen), 6);

      // Never wider than the screen and never taller than what the chrome
      // leaves, stated separately from the formula above: the `min()` having
      // three terms is the requirement, and an expectation that only restates
      // it would pass on a version that lost one of them in both places.
      expect(size).toBeLessThanOrEqual(screen.width);
      expect(size).toBeLessThanOrEqual(screen.height - columnChrome(screen.fontScale));

      // And what is left is a dial rather than a smear: the label is a constant
      // fraction of the circle, so the glyphs and the gaps between them shrink
      // together (G25). This is the mobile half of the floor web removed — a
      // fixed minimum label size here would put twelve glyphs on a circle too
      // small to hold them, exactly as it did there.
      expect(labelSize).toBeCloseTo(expectedLabelSize(size), 6);
    });
  }
});
