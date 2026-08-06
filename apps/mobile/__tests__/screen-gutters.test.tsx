import { space } from '@chromatic-tuner/tokens';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TunerScreen } from '../src/components/screens/TunerScreen';

import { Themed } from './theme-harness';

/**
 * The screen's horizontal gutter has to sit on a view that keeps it.
 *
 * `SafeAreaView` sets its own padding from the safe-area insets and clobbers
 * whatever the style asked for on those edges. A portrait iPhone has zero left
 * and right insets, so `paddingHorizontal: space.md` on the SafeAreaView was
 * silently discarded on every phone in portrait — the ruler ran edge to edge,
 * its ±50 ticks were clipped by the screen, and FLAT/SHARP touched the bezel.
 *
 * It looked correct for as long as the ruler was a fixed 320pt, which is
 * narrower than any phone: the gutter in the screenshot was slack in the ruler,
 * not padding. Making the ruler fluid removed the slack and revealed it.
 *
 * Jest cannot reproduce that clobbering — nothing computes an inset here, and
 * `SafeAreaView` renders as a plain view that honours the padding perfectly.
 * So this asserts the STRUCTURE instead: the gutter belongs to a view that has
 * no insets to lose it to, and the SafeAreaView is left to do the one job it
 * does reliably.
 */

function flatten(element: { props: { style?: unknown } }) {
  return (StyleSheet.flatten(element.props.style) ?? {}) as {
    paddingHorizontal?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
}

async function renderScreen() {
  return render(
    <Themed>
      <TunerScreen />
    </Themed>
  );
}

describe('the screen keeps its horizontal gutter (FR-018)', () => {
  it('puts the gutter on the content view, not on the safe-area view', async () => {
    const view = await renderScreen();

    const content = flatten(view.getByTestId('tuner-content'));
    expect(content.paddingHorizontal).toBe(space.md);
  });

  it('asks SafeAreaView for no horizontal padding, because it would not keep it', async () => {
    const view = await renderScreen();

    const safeArea = flatten(view.getByTestId('tuner-screen'));
    // Any of the three would be dropped in portrait and honoured in landscape,
    // which is worse than not setting it: the layout would change with the
    // rotation for a reason nothing on screen explains.
    expect(safeArea.paddingHorizontal).toBeUndefined();
    expect(safeArea.paddingLeft).toBeUndefined();
    expect(safeArea.paddingRight).toBeUndefined();
  });

  it('renders the tuner inside the padded view, not beside it', async () => {
    const view = await renderScreen();

    // A gutter on a view the tuner is not a descendant of pads nothing. RNTL
    // has no ancestor query, so this walks the padded subtree looking for the
    // display in it.
    expect(within(view.getByTestId('tuner-content'))).toBe(true);
  });
});

/** True when the padded view has the tuner display somewhere beneath it. */
function within(content: { children?: unknown[] | null }): boolean {
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    const element = node as { props?: { testID?: string }; children?: unknown[] | null };
    if (element.props?.testID === 'tuner-display') return true;
    return (element.children ?? []).some(walk);
  };
  return (content.children ?? []).some(walk);
}
