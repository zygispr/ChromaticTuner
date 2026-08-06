import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { type as typeTokens } from '@chromatic-tuner/tokens';
import { act, cleanup, render, screen, within } from '@testing-library/react-native';
import { useRef, type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { SettingsScreen } from '../src/components/screens/SettingsScreen';

/**
 * The `−` and `+` marks are centred on the button, not merely their boxes.
 *
 * Flexbox centres the Text's LINE BOX, and these two glyphs do not sit in the
 * middle of theirs: like every mathematical operator they are drawn on the
 * font's math axis, which is well below the line box's centre because that box
 * reserves room for descenders these marks do not have. So both marks rendered
 * low inside a correctly centred button.
 *
 * Measured with CoreText, system font, at the stepper's own 32pt:
 *
 *     ascent 30.938  descent 6.750  line box 37.688
 *     math axis      9.141 above the baseline  (identical for − and +)
 *     line box centre 12.094 above the baseline
 *     error          2.953pt low = 0.092em
 *
 * The same measurement at 16pt gives 0.094em, so the error is a fixed fraction
 * of the font size rather than a fixed number of points, and correcting it as
 * an em keeps it right if the type scale moves.
 *
 * It is iOS-only on purpose. Roboto centres these glyphs almost exactly — its
 * error is 0.012em, and its `−` and `+` miss in OPPOSITE directions — so
 * applying the system font's correction on Android would introduce a visible
 * error roughly three times the one it removes. Re-measure per font; do not
 * carry this number to a platform it was not measured on.
 *
 * This asserts the correction is applied and points the right way. It cannot
 * assert the rendered pixels: Jest has no text engine, which is exactly why
 * nothing caught this until someone looked at the sheet on a phone.
 */

afterEach(cleanup);

function Wrapper({ children }: { children: ReactNode }) {
  const ports = useRef({ audioSource: new ScriptedAudioSource(), wakeLock: new NoopWakeLock() });
  return (
    <TunerProvider
      audioSource={ports.current.audioSource}
      wakeLock={ports.current.wakeLock}
      preferences={new InMemoryPreferencesStore()}
      deviceAppearance="light"
      autoStart={false}
    >
      {children}
    </TunerProvider>
  );
}

async function renderStepper() {
  await render(
    <Wrapper>
      <SettingsScreen open onClose={jest.fn()} />
    </Wrapper>
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/** The `translateY` applied to the mark inside a stepper button, in points. */
function lift(testID: string): number | undefined {
  const label = within(screen.getByTestId(testID)).getByText(/[−+]/);
  const style = StyleSheet.flatten(label.props.style) as {
    transform?: readonly { readonly translateY?: number }[];
  };
  return style.transform?.find((t) => t.translateY !== undefined)?.translateY;
}

describe('the stepper marks sit on the centre of their buttons (FR-018)', () => {
  it('lifts both marks off the math axis onto the button centre', async () => {
    await renderStepper();

    for (const testID of ['a4-decrement', 'a4-increment']) {
      const applied = lift(testID);
      expect(applied).toBeDefined();

      if (Platform.OS === 'ios') {
        // Upwards. A downward correction would double the error rather than
        // remove it, and nothing else in this file would notice.
        expect(applied!).toBeLessThan(0);
        // The measured 0.092em, with room for a re-measurement on a future
        // system font but not for an invented number: 0.06em–0.12em of 32pt.
        expect(Math.abs(applied!)).toBeGreaterThan(0.06 * typeTokens.centsSize);
        expect(Math.abs(applied!)).toBeLessThan(0.12 * typeTokens.centsSize);
      } else {
        // Roboto needs no help; see the header.
        expect(applied).toBe(0);
      }
    }
  });

  it('corrects both marks identically, because they share one math axis', async () => {
    await renderStepper();

    // `−` is a 2.5pt rule and `+` is a 15.5pt cross, but CoreText puts the
    // centre of both at the same height above the baseline. Correcting them by
    // different amounts would misalign the pair with each other, which reads
    // worse than both being low together.
    const decrement = lift('a4-decrement');
    // Spelled out rather than left to `toBe(undefined) === toBe(undefined)`,
    // which passes on code that corrects neither mark.
    expect(decrement).toBeDefined();
    expect(lift('a4-increment')).toBe(decrement);
  });
});
