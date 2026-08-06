import { render, type RenderResult } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TuningLine } from '../src/components/molecules/TuningLine';

import { Themed } from './theme-harness';

/**
 * The mobile ruler must be the same drawing as the web one (FR-018).
 *
 * Both of these were caught by looking at a screenshot of each platform side by
 * side, which is the only thing that could have caught either: every existing
 * test asserts a mechanism fired, and both mechanisms fired correctly at the
 * wrong coordinates.
 *
 * Web centres its ticks with `translate(-50%, -50%)`, which resolves against the
 * tick's own box and so works for either weight. React Native has no
 * percentage-of-self transform, so the port used a constant `marginTop: -14` —
 * half the MAJOR height, applied to both. A 16pt minor tick therefore hung
 * entirely above the rule with its bottom edge resting on the rule's bottom
 * edge, while the 28pt majors were centred correctly and hid the bug.
 *
 * These assert the invariant rather than the numbers: a tick's centre sits on
 * the rule's centre, and on the cents position it names. Anything expressed as
 * a constant offset drifts again the next time a size changes.
 */

function noSubscription() {
  return () => {};
}

/**
 * The entire ruler is `accessibilityElementsHidden` — the announcer speaks the
 * same reading once, and a marker moving 43 times a second must not (FR-020).
 * RNTL excludes hidden subtrees from every query by default, so without this
 * option each lookup below fails for the wrong reason.
 */
const HIDDEN = { includeHiddenElements: true } as const;

async function renderLine(): Promise<RenderResult> {
  return render(
    <Themed>
      <TuningLine state="in-tune" subscribeToCents={noSubscription} />
    </Themed>
  );
}

interface Box {
  readonly top?: string | number;
  readonly left?: string | number;
  readonly marginTop?: number;
  readonly marginLeft?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * How far an absolutely positioned box's centre sits from the anchor its `top`
 * percentage names — which is the whole of what went wrong.
 */
function verticalCentreOffset(style: Box): number {
  return (style.marginTop ?? 0) + (style.height ?? 0) / 2;
}

function horizontalCentreOffset(style: Box): number {
  return (style.marginLeft ?? 0) + (style.width ?? 0) / 2;
}

function flatten(element: { props: { style?: unknown } }): Box {
  return StyleSheet.flatten(element.props.style) as Box;
}

describe('tick marks are centred on the rule (FR-018, FR-021)', () => {
  it('puts every tick centre on the rule centre, whatever its weight', async () => {
    const view = await renderLine();

    const rule = flatten(view.getByTestId('tuning-rule', HIDDEN));
    const ruleCentre = verticalCentreOffset(rule);
    expect(rule.top).toBe('50%');

    const ticks = view.getAllByTestId('tuning-tick', HIDDEN);
    expect(ticks.length).toBeGreaterThan(4);

    for (const tick of ticks) {
      const style = flatten(tick);
      expect(style.top).toBe('50%');
      // A minor tick whose centre is above the rule's reads as sitting ON the
      // line rather than passing THROUGH it — the whole visible defect.
      expect(verticalCentreOffset(style)).toBe(ruleCentre);
    }
  });

  it('sees both tick weights, so a passing run is not one weight repeated', async () => {
    const view = await renderLine();

    const heights = new Set(
      view.getAllByTestId('tuning-tick', HIDDEN).map((t) => flatten(t).height)
    );
    expect(heights.size).toBe(2);
  });

  it('centres each tick on the cents position it names', async () => {
    const view = await renderLine();

    for (const tick of view.getAllByTestId('tuning-tick', HIDDEN)) {
      const style = flatten(tick);
      // `left` alone positions a box's LEADING edge. Without the compensating
      // margin every tick sat 1–1.5pt right of its own cents value, and the
      // +50 tick was drawn past the end of the rule entirely.
      expect(typeof style.left).toBe('string');
      expect(horizontalCentreOffset(style)).toBe(0);
    }
  });

  it('draws one tick per graduation, with no two at the same position', async () => {
    const view = await renderLine();

    const positions = view.getAllByTestId('tuning-tick', HIDDEN).map((t) => flatten(t).left);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe('the flat and sharp ends are labelled (FR-007, FR-015)', () => {
  it('names which end is which, so the line does not have to be learnt', async () => {
    const view = await renderLine();

    // One of FR-015's redundant non-colour channels, and the only one that says
    // which DIRECTION the line runs without the player first watching the marker
    // move. Web has carried these since 001; the mobile port dropped them.
    expect(view.getByText('FLAT', HIDDEN)).toBeTruthy();
    expect(view.getByText('SHARP', HIDDEN)).toBeTruthy();
  });
});
