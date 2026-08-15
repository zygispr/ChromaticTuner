import type { Appearance, AppearancePreference } from '@chromatic-tuner/core';
import { NoopWakeLock, ScriptedAudioSource } from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { color } from '@chromatic-tuner/tokens';
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import App from '../src/App';
import { TunerScreen } from '../src/components/screens/TunerScreen';

/** Built once: new port identities would rebuild the session on every rerender. */
const ports = { audioSource: new ScriptedAudioSource(), wakeLock: new NoopWakeLock() };

/**
 * V45 / M11 / M12 — the first frame the user ever sees is already correct.
 *
 * `useColorScheme()` is mocked to `'light'` and the seeded preference is
 * `'dark'`, so the device says the OPPOSITE of what is stored. Nothing but the
 * seed can produce a dark first frame.
 *
 * **The assertion is on the initial commit, with no `act()` flush.** That is the
 * whole test. A provider that starts from `DEFAULT_PREFERENCES` and corrects
 * itself in an effect is right one commit later, which is invisible to any
 * assertion written after a flush — and on a real launch it is a frame of the
 * wrong appearance, which is exactly the flash research D5 exists to prevent
 * (FR-120).
 */
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

const DARK_RECORD = {
  a4Hz: 440,
  accidentalStyle: 'sharp',
  appearance: 'dark',
  tunerDisplay: 'line',
  schemaVersion: 1,
} as const;

/**
 * User Story 3 on mobile (T044, FR-115, FR-116).
 *
 * `useColorScheme()` is mocked at module scope above, so the device value is
 * varied here by re-rendering the provider with a different `deviceAppearance` —
 * which is exactly what `App` does when the real hook's value changes. The pair
 * of tests is the point: either alone is satisfied by a broken implementation.
 */
function backgroundOf(): string | undefined {
  return (
    StyleSheet.flatten(screen.getByTestId('tuner-screen').props.style) as {
      backgroundColor?: string;
    }
  ).backgroundColor;
}

/**
 * Seeded through `initialPreferences` rather than by pressing the control: this
 * is about what the provider does with a stored choice when the DEVICE moves,
 * and seeding it synchronously keeps the test to that one variable.
 */
function Harness({ device, appearance }: { device: Appearance; appearance: AppearancePreference }) {
  return (
    <TunerProvider
      audioSource={ports.audioSource}
      wakeLock={ports.wakeLock}
      deviceAppearance={device}
      initialPreferences={{ ...DARK_RECORD, appearance }}
      autoStart={false}
    >
      <TunerScreen />
    </TunerProvider>
  );
}

describe('following the device, and not following it (T044)', () => {
  it('moves with the device while the preference is system (FR-115)', async () => {
    const view = await render(<Harness device="light" appearance="system" />);
    expect(backgroundOf()).toBe(color.background.light);

    await act(async () => {
      view.rerender(<Harness device="dark" appearance="system" />);
    });

    expect(backgroundOf()).toBe(color.background.dark);
  });

  it('does not move with the device once a choice is explicit (FR-116)', async () => {
    const view = await render(<Harness device="light" appearance="dark" />);
    expect(backgroundOf()).toBe(color.background.dark);

    // The device swings both ways; neither move may be visible. Without this,
    // the follow test above passes for an app that ignores the stored choice.
    for (const device of ['dark', 'light'] as const) {
      await act(async () => {
        view.rerender(<Harness device={device} appearance="dark" />);
      });
      expect(backgroundOf()).toBe(color.background.dark);
    }
  });
});

describe('the first rendered frame (V45, M11)', () => {
  it('is dark when the seeded preference is dark and the device is light', async () => {
    await render(<App initialPreferences={DARK_RECORD} />);

    // Read immediately. No `settle()`, no `act()` — anything that needs one has
    // already lost the frame this test is about.
    const background = (
      StyleSheet.flatten(screen.getByTestId('tuner-screen').props.style) as {
        backgroundColor?: string;
      }
    ).backgroundColor;

    expect(background).toBe(color.background.dark);
  });

  it('follows the light device when the seeded preference is system', async () => {
    await render(<App initialPreferences={{ ...DARK_RECORD, appearance: 'system' }} />);

    const background = (
      StyleSheet.flatten(screen.getByTestId('tuner-screen').props.style) as {
        backgroundColor?: string;
      }
    ).backgroundColor;

    // The seed is honoured as a CHOICE, and that choice is "match the device" —
    // which this environment reports as light. A first frame that came out dark
    // here would mean the seed's resolved value had been frozen at write time.
    expect(background).toBe(color.background.light);
  });
});
