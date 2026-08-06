import { color } from '@chromatic-tuner/tokens';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import App from '../src/App';

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
  schemaVersion: 1,
} as const;

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
