import { A4_MAX_HZ, A4_MIN_HZ } from '@chromatic-tuner/core';
import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { useRef, type ReactNode } from 'react';
import { AudioManager } from 'react-native-audio-api';

import { ReferenceBadge } from '../src/components/atoms/ReferenceBadge';
import { SettingsScreen } from '../src/components/screens/SettingsScreen';
import { TunerScreen } from '../src/components/screens/TunerScreen';

/**
 * User Story 4 on mobile (T088, T089).
 *
 * The model and the hook are covered in `packages/core` and `packages/react`;
 * what only exists here is the mobile settings screen and the reference badge.
 *
 * `SettingsScreen` is driven by its own `open` prop rather than through the
 * tuner's local state, because React Native's `Modal` does not unmount
 * predictably under Jest — testing through it would measure the Modal mock
 * rather than the settings screen. Reachability from the tuner gets one
 * integration test at the bottom, which is the part that genuinely needs it.
 */

// RNTL's automatic cleanup does not register under this jest-expo setup, so a
// mounted tree survives into the next test and every query there resolves
// against the stale one. Unmounting explicitly is what keeps the tests
// independent.
afterEach(cleanup);

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/**
 * Press a control and let the resulting state update land.
 *
 * The `act` wrapper is load-bearing: without it React schedules the first
 * update from a press but silently drops every subsequent one in this
 * environment, so a two-step interaction appears to stop working after step
 * one. That is an artifact of the jest-expo act environment — the same code
 * steps correctly in a real browser, which the Playwright settings spec covers.
 */
async function press(testID: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
  await settle();
}

/**
 * The ports are created once per mount, not per render.
 *
 * `TunerProvider` builds a new session whenever the port identities change, so
 * constructing them inline in the JSX would rebuild the session — and re-run
 * every effect hanging off it — on each state update.
 */
function Wrapper({ children, store }: { children: ReactNode; store: InMemoryPreferencesStore }) {
  const ports = useRef({ audioSource: new ScriptedAudioSource(), wakeLock: new NoopWakeLock() });

  return (
    <TunerProvider
      audioSource={ports.current.audioSource}
      wakeLock={ports.current.wakeLock}
      preferences={store}
      autoStart={false}
    >
      {children}
    </TunerProvider>
  );
}

async function renderSettings(store = new InMemoryPreferencesStore(), onClose = jest.fn()) {
  // RNTL 14 made `render` asynchronous; an un-awaited call leaves every
  // subsequent query resolving against a stale tree.
  await render(
    <Wrapper store={store}>
      <SettingsScreen open onClose={onClose} />
    </Wrapper>
  );
  // The stored preference arrives one turn of the event loop later.
  await settle();
  return { store, onClose };
}

describe('ReferenceBadge (FR-022, T089)', () => {
  it('reads as standard at concert pitch', async () => {
    await render(
      <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={() => undefined} />
    );

    expect(screen.getByTestId('reference-badge')).toHaveTextContent('A4 440 Hz');
    expect(screen.getByTestId('reference-badge').props.accessibilityLabel).toMatch(/standard 440/i);
  });

  it('says outright that the reference is not standard', async () => {
    // A non-standard reference silently changes the meaning of every reading,
    // so it must not be readable only as a subtle colour shift — the number and
    // the accessible label both carry it.
    await render(<ReferenceBadge a4Hz={432} isNonStandard onOpenSettings={() => undefined} />);

    expect(screen.getByTestId('reference-badge')).toHaveTextContent('A4 432 Hz');
    expect(screen.getByTestId('reference-badge').props.accessibilityLabel).toMatch(
      /not the standard 440/i
    );
  });

  it('opens settings when pressed', async () => {
    const onOpenSettings = jest.fn();
    await render(
      <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={onOpenSettings} />
    );

    await press('reference-badge');
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsScreen (T088)', () => {
  it('shows the stored reference pitch and asks to be closed', async () => {
    const { onClose } = await renderSettings();

    expect(screen.getByTestId('a4-value')).toHaveTextContent('440 Hz');

    await press('settings-close');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('steps the reference pitch one hertz at a time', async () => {
    await renderSettings();

    await press('a4-decrement');
    expect(screen.getByTestId('a4-value')).toHaveTextContent('439 Hz');

    await press('a4-increment');
    await press('a4-increment');
    expect(screen.getByTestId('a4-value')).toHaveTextContent('441 Hz');
  });

  it('does not go past the top of the range', async () => {
    await renderSettings(
      new InMemoryPreferencesStore({ a4Hz: A4_MAX_HZ, accidentalStyle: 'sharp', schemaVersion: 1 })
    );
    expect(screen.getByTestId('a4-value')).toHaveTextContent(`${A4_MAX_HZ} Hz`);

    // The control is disabled here, and the setter clamps as well — belt and
    // braces, because guarantee R4 says an invalid state must be unreachable.
    expect(screen.getByTestId('a4-increment').props.accessibilityState.disabled).toBe(true);
    await press('a4-increment');
    expect(screen.getByTestId('a4-value')).toHaveTextContent(`${A4_MAX_HZ} Hz`);
  });

  it('does not go past the bottom of the range', async () => {
    await renderSettings(
      new InMemoryPreferencesStore({ a4Hz: A4_MIN_HZ, accidentalStyle: 'sharp', schemaVersion: 1 })
    );
    expect(screen.getByTestId('a4-value')).toHaveTextContent(`${A4_MIN_HZ} Hz`);

    expect(screen.getByTestId('a4-decrement').props.accessibilityState.disabled).toBe(true);
    await press('a4-decrement');
    expect(screen.getByTestId('a4-value')).toHaveTextContent(`${A4_MIN_HZ} Hz`);
  });

  it('switches the accidental style and persists it (FR-023, FR-024)', async () => {
    const { store } = await renderSettings();

    expect(screen.getByTestId('accidental-sharp').props.accessibilityState.selected).toBe(true);

    await press('accidental-flat');

    expect(screen.getByTestId('accidental-flat').props.accessibilityState.selected).toBe(true);
    expect((await store.load())?.accidentalStyle).toBe('flat');
  });

  it('resets to defaults and clears storage (FR-024)', async () => {
    const { store } = await renderSettings(
      new InMemoryPreferencesStore({ a4Hz: 415, accidentalStyle: 'flat', schemaVersion: 1 })
    );
    expect(screen.getByTestId('a4-value')).toHaveTextContent('415 Hz');

    await press('settings-reset');

    expect(screen.getByTestId('a4-value')).toHaveTextContent('440 Hz');
    expect(screen.getByTestId('accidental-sharp').props.accessibilityState.selected).toBe(true);
    expect(await store.load()).toBeNull();
  });

  it('says so when a preference cannot be saved, and keeps working (obligation P2)', async () => {
    const store = new InMemoryPreferencesStore();
    store.saveError = new Error('storage full');
    await renderSettings(store);

    expect(screen.queryByTestId('persistence-warning')).toBeNull();

    await press('a4-decrement');

    // Applied for this session...
    expect(screen.getByTestId('a4-value')).toHaveTextContent('439 Hz');
    // ...and the user is told it will not survive.
    expect(screen.getByTestId('persistence-warning')).toBeTruthy();
  });
});

describe('settings are reachable from the tuner', () => {
  it('opens when the reference badge is pressed', async () => {
    (AudioManager.checkRecordingPermissions as jest.Mock).mockResolvedValue('Granted');

    await render(
      <TunerProvider
        audioSource={new ScriptedAudioSource()}
        wakeLock={new NoopWakeLock()}
        preferences={new InMemoryPreferencesStore()}
        autoStart={false}
      >
        <TunerScreen />
      </TunerProvider>
    );
    await settle();

    expect(screen.queryByTestId('settings-sheet')).toBeNull();

    await press('reference-badge');

    expect(screen.getByTestId('settings-sheet')).toBeTruthy();
    expect(screen.getByTestId('a4-value')).toHaveTextContent('440 Hz');
  });
});
