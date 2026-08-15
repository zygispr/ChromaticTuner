import { dialAngleDegrees, DIAL_SEGMENT_DEGREES } from '@chromatic-tuner/core';
import { act, render, type RenderResult } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TuningDial } from '../src/components/molecules/TuningDial';

import { Themed } from './theme-harness';

/**
 * The mobile dial must be the same drawing as the web one (FR-148, G23, SC-071).
 *
 * **What this file cannot see, stated up front so nobody trusts it further than
 * it goes.** `jest-expo` has no layout engine and no compositor, so:
 *
 * - It cannot catch **D5**, the rotation landing on the needle instead of its
 *   wrapper. Both produce identical trees here; only the paired screenshot in
 *   T052 and review can tell them apart. Web *can* catch it in a real browser
 *   (`e2e/helpers.ts:needleAngleDeg`), which is why the web dial was built and
 *   proved first and this one is built to the shape web proved.
 * - It cannot measure contrast, overlap, or whether the hub text fits inside the
 *   hub. Those are assertions about boxes, and there are no boxes here.
 *
 * What it CAN do is pin the structure and the arithmetic: how many marks, in
 * what order, at which angles, from which shared function.
 */

function noSubscription() {
  return () => {};
}

/**
 * The whole dial is `accessibilityElementsHidden` (G24) — the announcer speaks
 * the same reading once, and a needle moving 43 times a second must not. RNTL
 * excludes hidden subtrees from every query by default, so without this option
 * each lookup below fails for the wrong reason.
 */
const HIDDEN = { includeHiddenElements: true } as const;

async function renderDial(activePitchClass: number | null = null): Promise<RenderResult> {
  return render(
    <Themed>
      <TuningDial
        state="in-tune"
        accidentalStyle="sharp"
        activePitchClass={activePitchClass}
        subscribeToReading={noSubscription}
      />
    </Themed>
  );
}

interface Box {
  readonly top?: string | number;
  readonly left?: string | number;
  readonly width?: string | number;
  readonly height?: string | number;
  readonly transform?: ReadonlyArray<Record<string, unknown>>;
  readonly pointerEvents?: string;
}

function flatten(element: { props: { style?: unknown } }): Box {
  return StyleSheet.flatten(element.props.style) as Box;
}

/** The `rotate` entry of a transform array, in degrees, or null if there is none. */
function rotationDeg(style: Box): number | null {
  const entry = style.transform?.find((t) => 'rotate' in t);
  if (!entry) return null;
  return Number.parseFloat(String(entry.rotate));
}

describe('the twelve segments (FR-154, FR-155, G23)', () => {
  it('labels every segment, C first, ascending clockwise', async () => {
    const view = await renderDial();

    const labels = view.getAllByTestId('dial-label', HIDDEN).map((node) => node.props.children);
    // The same list web asserts, in the same order, from the same `noteName`.
    expect(labels).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
  });

  it('respells the accidentals with flats and leaves the naturals alone (FR-156)', async () => {
    const view = await render(
      <Themed>
        <TuningDial
          state="in-tune"
          accidentalStyle="flat"
          activePitchClass={null}
          subscribeToReading={noSubscription}
        />
      </Themed>
    );

    expect(view.getAllByTestId('dial-label', HIDDEN).map((node) => node.props.children)).toEqual([
      'C',
      'D♭',
      'D',
      'E♭',
      'E',
      'F',
      'G♭',
      'G',
      'A♭',
      'A',
      'B♭',
      'B',
    ]);
  });

  it('draws one boundary tick per pair of segments, each halfway between centres', async () => {
    const view = await renderDial();

    const ticks = view.getAllByTestId('dial-tick', HIDDEN);
    expect(ticks).toHaveLength(12);

    const angles = ticks.map((tick) => rotationDeg(flatten(tick)));
    // 15, 45, 75 … — halfway between adjacent segment centres, which is what
    // makes a tick a BOUNDARY rather than a second mark on the note itself.
    expect(angles).toEqual(
      Array.from({ length: 12 }, (_, k) => DIAL_SEGMENT_DEGREES / 2 + k * DIAL_SEGMENT_DEGREES)
    );
  });

  it('marks the active segment at its centre, and draws nothing when there is none', async () => {
    expect(await renderDial(null).then((v) => v.queryAllByTestId('dial-target', HIDDEN))).toEqual(
      []
    );

    const view = await renderDial(4);
    const target = view.getByTestId('dial-target', HIDDEN);
    // E is pitch class 4, so 120° — the SEGMENT CENTRE, not the boundary.
    expect(rotationDeg(flatten(target))).toBe(4 * DIAL_SEGMENT_DEGREES);
  });
});

describe('the needle (FR-157, FR-163, G21)', () => {
  it('draws no needle at all before the first reading (FR-163)', async () => {
    const view = await renderDial();

    // "No angle yet" is a different state from "an angle of zero": a needle
    // parked straight up before the first pluck reads as "C detected".
    expect(view.queryAllByTestId('dial-needle', HIDDEN)).toEqual([]);
  });

  it('rotates a wrapper, and never the needle itself (G21, D5)', async () => {
    let handler: ((cents: number | null, clarity: number, midi: number | null) => void) | null =
      null;
    const view = await render(
      <Themed>
        <TuningDial
          state="in-tune"
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

    // E2 is MIDI 40. Wrapped in `act` because the first reading flips the
    // state that mounts the needle.
    await act(async () => {
      handler!(0, 0.99, 40);
    });

    // The needle exists now, and carries NO rotation of its own. This is the
    // weakest half of D5's defence — a tree with the rotate on the needle would
    // fail here, but a tree with the rotate on a wrapper that is not concentric
    // with the dial would pass. The screenshot in T052 is the other half.
    const needle = view.getByTestId('dial-needle', HIDDEN);
    expect(rotationDeg(flatten(needle))).toBeNull();

    expect(view.getByTestId('dial-needle-wrapper', HIDDEN)).toBeTruthy();
  });
});

describe('the face is the same drawing as web (G23, G25)', () => {
  it('takes its angles from the shared function rather than its own arithmetic', async () => {
    // Not a test of the component so much as a guard on the claim SC-071 makes:
    // both platforms must reach the needle's angle through `dialAngleDegrees`.
    // A mobile dial that recomputed `pitchClass * 30 + cents * 0.3` locally
    // would agree today and drift the first time the shared one is corrected —
    // which has already happened once, when G6 was found to be wrong about the
    // B/C boundary.
    expect(dialAngleDegrees(40, 0)).toBe(4 * DIAL_SEGMENT_DEGREES);
    expect(dialAngleDegrees(40, 25)).toBeCloseTo(4 * DIAL_SEGMENT_DEGREES + 7.5, 5);
  });

  it('expresses every radial dimension as a fraction of the dial (G25)', async () => {
    const view = await renderDial(4);

    // The hub, the labels and the ticks are positioned in PERCENTAGES, not
    // points. Web learnt this the hard way: a fixed 10px tick and a fixed 16px
    // label against a proportional ring collide below a ~250px dial and nothing
    // says so. Mobile has more size variation than web, not less.
    const hub = flatten(view.getByTestId('dial-hub', HIDDEN));
    expect(typeof hub.width).toBe('string');

    for (const label of view.getAllByTestId('dial-label', HIDDEN)) {
      const style = flatten(label);
      expect(typeof style.left).toBe('string');
      expect(typeof style.top).toBe('string');
    }
  });

  it('takes no touches, anywhere (G24a)', async () => {
    const view = await renderDial();

    // The web defect this mirrors: every rotated mark is a wrapper the size of
    // the whole dial, and a rotated square receives input over its ROTATED
    // area — 101px past the rim on a 489px dial. On web that made the settings
    // badge above the dial unclickable except at its two extreme ends. React
    // Native hit-tests rotated views the same way, and the dial is decoration.
    expect(view.getByTestId('tuning-dial', HIDDEN).props.pointerEvents).toBe('none');
  });

  /**
   * V70 / G24 / FR-164 — the dial says nothing to a screen reader.
   *
   * BOTH props, because on Android one of them does nothing: iOS reads
   * `accessibilityElementsHidden` and Android reads
   * `importantForAccessibility="no-hide-descendants"`, so a dial carrying only
   * the first is silent on one platform and reads out twelve note names on the
   * other. `TuningLine` already carries the pair for the same reason.
   *
   * The count is the other half. RNTL excludes hidden subtrees from every query
   * by default — which is why `HIDDEN` exists all through this file — so
   * "nothing found without the option" and "twelve found with it" together say
   * the marks exist AND are hidden, where either alone is satisfied by a dial
   * that simply is not there.
   */
  it('is hidden from assistive technology on both platforms (V70, G24, FR-164)', async () => {
    const view = await renderDial(4);

    const dial = view.getByTestId('tuning-dial', HIDDEN);
    expect(dial.props.accessibilityElementsHidden).toBe(true);
    expect(dial.props.importantForAccessibility).toBe('no-hide-descendants');

    expect(view.getAllByTestId('dial-label', HIDDEN)).toHaveLength(12);
    expect(view.queryAllByTestId('dial-label')).toEqual([]);
    expect(view.queryAllByTestId('dial-tick')).toEqual([]);
    expect(view.queryAllByTestId('tuning-dial')).toEqual([]);
  });
});
