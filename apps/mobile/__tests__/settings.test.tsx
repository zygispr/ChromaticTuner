import { A4_MAX_HZ, A4_MIN_HZ, type Appearance } from '@chromatic-tuner/core';
import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { a11y, color } from '@chromatic-tuner/tokens';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { useRef, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { AudioManager } from 'react-native-audio-api';

import { ReferenceBadge } from '../src/components/atoms/ReferenceBadge';
import { SettingsScreen } from '../src/components/screens/SettingsScreen';
import { TunerScreen } from '../src/components/screens/TunerScreen';

import { Themed } from './theme-harness';

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
function Wrapper({
  children,
  store,
  device = 'light',
}: {
  children: ReactNode;
  store: InMemoryPreferencesStore;
  device?: Appearance;
}) {
  const ports = useRef({ audioSource: new ScriptedAudioSource(), wakeLock: new NoopWakeLock() });

  return (
    <TunerProvider
      audioSource={ports.current.audioSource}
      wakeLock={ports.current.wakeLock}
      preferences={store}
      deviceAppearance={device}
      autoStart={false}
    >
      {children}
    </TunerProvider>
  );
}

async function renderSettings(
  store = new InMemoryPreferencesStore(),
  onClose = jest.fn(),
  device: Appearance = 'light'
) {
  // RNTL 14 made `render` asynchronous; an un-awaited call leaves every
  // subsequent query resolving against a stale tree.
  await render(
    <Wrapper store={store} device={device}>
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
      <Themed>
        <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={() => undefined} />
      </Themed>
    );

    // A regex, not a string: this matcher is an EXACT match here, and the
    // badge now trails a gear glyph. What matters is that the pitch is shown.
    expect(screen.getByTestId('reference-badge')).toHaveTextContent(/A4 440 Hz/);
    expect(screen.getByTestId('reference-badge').props.accessibilityLabel).toMatch(/standard 440/i);
  });

  it('says outright that the reference is not standard', async () => {
    // A non-standard reference silently changes the meaning of every reading,
    // so it must not be readable only as a subtle colour shift — the number and
    // the accessible label both carry it.
    await render(
      <Themed>
        <ReferenceBadge a4Hz={432} isNonStandard onOpenSettings={() => undefined} />
      </Themed>
    );

    expect(screen.getByTestId('reference-badge')).toHaveTextContent(/A4 432 Hz/);
    expect(screen.getByTestId('reference-badge').props.accessibilityLabel).toMatch(
      /not the standard 440/i
    );
  });

  /**
   * The way into settings has to look like the way into settings.
   *
   * The badge's visible label is a reference pitch, so nothing about it said
   * "settings" to a sighted user — while assistive technology has been told
   * since `001`, the accessible label leading with the word. The gear closes
   * that gap the other way round, and must NOT reach the label, which is
   * already correct.
   */
  it('carries a gear the label does not mention (FR-052)', async () => {
    await render(
      <Themed>
        <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={() => undefined} />
      </Themed>
    );

    const badge = screen.getByTestId('reference-badge');
    // Pitch first, gear trailing — asserted as one ordered pattern rather than
    // two independent substrings, so a leading gear would fail.
    expect(badge).toHaveTextContent(/A4 440 Hz\s*⚙/);
    expect(badge.props.accessibilityLabel).toMatch(/^Settings\./);
    expect(badge.props.accessibilityLabel).not.toContain('⚙');
  });

  it('opens settings when pressed', async () => {
    const onOpenSettings = jest.fn();
    await render(
      <Themed>
        <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={onOpenSettings} />
      </Themed>
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
      new InMemoryPreferencesStore({
        a4Hz: A4_MAX_HZ,
        accidentalStyle: 'sharp',
        appearance: 'system',
        schemaVersion: 1,
      })
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
      new InMemoryPreferencesStore({
        a4Hz: A4_MIN_HZ,
        accidentalStyle: 'sharp',
        appearance: 'system',
        schemaVersion: 1,
      })
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

  /**
   * The chosen accidental is marked by a fill, not by a heavier border (FR-015).
   *
   * The original treatment gave both options a 2px border and changed only its
   * colour. That is a thin greyscale channel — one stroke colour over a 2px
   * band — and on the web half it collided outright with the focus ring, which
   * is also a `text` outline.
   *
   * The fill is the `selected` tint rather than `text`. Built with `text`
   * first, which overcorrected: that is the primary-action fill
   * (`allow-microphone`, `retry-button`), and spending it on a preference made
   * the accidental buttons the loudest thing in the sheet. The tint is what a
   * chosen segment gets on both platforms, and the label stays `text` instead
   * of inverting.
   *
   * Asserted across a toggle rather than on the default alone: a static check
   * passes just as well against two buttons that are permanently styled that
   * way, which is not the property that matters.
   */
  it('marks the chosen accidental with a fill that follows the choice (FR-015)', async () => {
    await renderSettings();

    const boxOf = (testID: string) =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style) as {
        backgroundColor?: string;
        borderWidth?: number;
        borderColor?: string;
      };
    const labelColorOf = (text: string) =>
      (StyleSheet.flatten(screen.getByText(text).props.style) as { color?: string }).color;

    expect(boxOf('accidental-sharp').backgroundColor).toBe(color.selected.light);
    // A tint, not an inversion: the label stays `text` in both states.
    expect(labelColorOf('Sharps')).toBe(color.text.light);

    // The unchosen option stays a ghost. FR-052 still holds: it carries a
    // border at rest, so it reads as a control before anything touches it.
    expect(boxOf('accidental-flat').backgroundColor).toBeUndefined();
    expect(boxOf('accidental-flat').borderColor).toBe(color.line.light);
    expect(labelColorOf('Flats')).toBe(color.text.light);

    // Neither option may be the heavier box, or the row resizes on toggle.
    expect(boxOf('accidental-sharp').borderWidth).toBe(boxOf('accidental-flat').borderWidth);

    await press('accidental-flat');

    expect(boxOf('accidental-flat').backgroundColor).toBe(color.selected.light);
    expect(boxOf('accidental-sharp').backgroundColor).toBeUndefined();
    // The label never moves, so the fill is carrying the choice on its own.
    expect(labelColorOf('Flats')).toBe(color.text.light);
    expect(labelColorOf('Sharps')).toBe(color.text.light);
  });

  /**
   * User Story 1 on mobile (T021, FR-118, FR-124).
   *
   * The device is emulated as the OPPOSITE of whatever is chosen throughout.
   * "Choose Dark, assert dark colours" passes on a build where the control is
   * inert, as long as the device is already dark — and `useColorScheme()`
   * returns whatever this environment feels like, so that would be a coin toss
   * rather than a test.
   */
  it('offers three appearance options by their plain-language names (FR-124)', async () => {
    await renderSettings();

    // The same words the web sheet uses, in the same order (research D8).
    // "Match device", not "System" or "Auto".
    expect(screen.getByTestId('appearance-system')).toBeTruthy();
    expect(screen.getByText('Match device')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();

    // 'system' is the default, so it is the chosen one on a fresh install.
    expect(screen.getByTestId('appearance-system').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('appearance-light').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('appearance-dark').props.accessibilityState.selected).toBe(false);
  });

  it('repaints the sheet when an appearance is chosen against the device (FR-118)', async () => {
    // Device light; the user asks for dark.
    const { store } = await renderSettings(new InMemoryPreferencesStore(), jest.fn(), 'light');

    const sheetBackground = () =>
      (
        StyleSheet.flatten(screen.getByTestId('settings-sheet').props.style) as {
          backgroundColor?: string;
        }
      ).backgroundColor;

    expect(sheetBackground()).toBe(color.surface.light);

    await press('appearance-dark');

    expect(screen.getByTestId('appearance-dark').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('appearance-system').props.accessibilityState.selected).toBe(false);
    // The rendered colours moved, not just the selected flag.
    expect(sheetBackground()).toBe(color.surface.dark);
    // US1 does not claim persistence, but the choice must at least reach the
    // provider as the CHOICE — 'dark', not the light it was resolved against.
    expect((await store.load())?.appearance).toBe('dark');
  });

  it('hands the appearance back to a device set the other way (FR-115)', async () => {
    // Device dark, preference explicitly light, then back to Match device.
    await renderSettings(new InMemoryPreferencesStore(), jest.fn(), 'dark');

    await press('appearance-light');
    const sheetBackground = () =>
      (
        StyleSheet.flatten(screen.getByTestId('settings-sheet').props.style) as {
          backgroundColor?: string;
        }
      ).backgroundColor;
    expect(sheetBackground()).toBe(color.surface.light);

    await press('appearance-system');

    // Back under the device's control, which is dark — so this only passes if
    // 'system' resolves live rather than freezing what it replaced.
    expect(sheetBackground()).toBe(color.surface.dark);
  });

  it('marks the chosen appearance with the same fill the accidentals use (FR-126)', async () => {
    await renderSettings(new InMemoryPreferencesStore(), jest.fn(), 'light');

    const boxOf = (testID: string) =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style) as {
        backgroundColor?: string;
        borderWidth?: number;
        borderColor?: string;
      };

    expect(boxOf('appearance-system').backgroundColor).toBe(color.selected.light);
    expect(boxOf('appearance-light').backgroundColor).toBeUndefined();
    expect(boxOf('appearance-dark').backgroundColor).toBeUndefined();

    // Equal borders on all three, or the row resizes under the finger.
    expect(boxOf('appearance-light').borderWidth).toBe(boxOf('appearance-system').borderWidth);
    expect(boxOf('appearance-dark').borderWidth).toBe(boxOf('appearance-system').borderWidth);

    await press('appearance-dark');

    // The fill FOLLOWS the choice — a static check would pass on three buttons
    // permanently styled this way.
    expect(boxOf('appearance-dark').backgroundColor).toBe(color.selected.dark);
    expect(boxOf('appearance-system').backgroundColor).toBeUndefined();
  });

  it('resets to defaults and clears storage (FR-024)', async () => {
    const { store } = await renderSettings(
      new InMemoryPreferencesStore({
        a4Hz: 415,
        accidentalStyle: 'flat',
        appearance: 'system',
        schemaVersion: 1,
      })
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

  /**
   * T054 / FR-123 / SC-054 — the appearance is no different.
   *
   * Separate from the reference-pitch case above because the failure mode is
   * specific: an appearance that reverted on a failed write would be visible
   * instantly and would look like the control being broken, where a reverted
   * reference pitch merely looks like a slow slider. The choice applies, the
   * EXISTING warning surface says it will not be remembered, and no new surface
   * is introduced.
   */
  it('still changes the appearance when the write fails, and says so (FR-123)', async () => {
    const store = new InMemoryPreferencesStore();
    store.saveError = new Error('storage full');
    const { store: seeded } = await renderSettings(store, jest.fn(), 'light');

    expect(screen.queryByTestId('persistence-warning')).toBeNull();

    await press('appearance-dark');

    // Applied, and visibly so — the sheet actually repainted.
    expect(screen.getByTestId('appearance-dark').props.accessibilityState.selected).toBe(true);
    expect(
      (
        StyleSheet.flatten(screen.getByTestId('settings-sheet').props.style) as {
          backgroundColor?: string;
        }
      ).backgroundColor
    ).toBe(color.surface.dark);

    // ...and the user is told it will not survive, through the surface that
    // already existed.
    expect(screen.getByTestId('persistence-warning')).toBeTruthy();
    expect(await seeded.load()).toBeNull();
  });

  it('verifies every appearance option meets the 44pt touch target (T053, FR-125)', async () => {
    await renderSettings();

    for (const value of ['system', 'light', 'dark'] as const) {
      const style = StyleSheet.flatten(screen.getByTestId(`appearance-${value}`).props.style) as {
        minHeight?: number;
      };
      expect(style.minHeight).toBe(a11y.minTouchTarget);
    }
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

/**
 * User Story 3 on mobile (T031): the backdrop dismisses.
 *
 * The web sheet has always closed on a backdrop press; here the backdrop was a
 * plain `View` with no handler, so the gesture every platform sheet responds to
 * did nothing at all.
 *
 * React Native needs no press-origin tracking to match the web behaviour fixed
 * alongside this: the responder system assigns a touch to one view for the
 * whole gesture rather than resolving to a common ancestor at the end, so a
 * touch that starts inside the sheet never reaches the backdrop.
 */
describe('backdrop dismissal (FR-049)', () => {
  it('closes when the backdrop is pressed', async () => {
    const onClose = jest.fn();
    await renderSettings(new InMemoryPreferencesStore(), onClose);

    fireEvent.press(screen.getByTestId('settings-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the sheet itself is pressed (FR-048)', async () => {
    const onClose = jest.fn();
    await renderSettings(new InMemoryPreferencesStore(), onClose);

    fireEvent.press(screen.getByTestId('settings-sheet'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes on Done (FR-050)', async () => {
    const onClose = jest.fn();
    await renderSettings(new InMemoryPreferencesStore(), onClose);

    fireEvent.press(screen.getByTestId('settings-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * User Story 4 on mobile (T037): the reference badge reads as a control.
 *
 * Mirrors the web assertions. There is no Axe here, so the check is on the
 * rendered style — which is why the web half carries the composited-contrast
 * measurement and this one carries the structural claim.
 */
describe('reference badge affordance (FR-052, FR-053)', () => {
  function badgeStyle() {
    const node = screen.getByTestId('reference-badge');
    return Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style.filter(Boolean))
      : node.props.style;
  }

  function labelStyle() {
    const node = screen.getByText(/A4 \d+ Hz/);
    return Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style.filter(Boolean))
      : node.props.style;
  }

  it('draws a visible border in the standard state', async () => {
    await render(
      <Wrapper store={new InMemoryPreferencesStore()}>
        <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={jest.fn()} />
      </Wrapper>
    );

    const style = badgeStyle();
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).not.toBe('transparent');

    // Opacity is the mechanism that defeated a correct colour token at 3.9:1 in
    // `001`, so the standard state must not be dimmed to make it quiet.
    expect(style.opacity ?? 1).toBe(1);
  });

  it('keeps the non-standard state louder on two channels (FR-022)', async () => {
    const onOpenSettings = jest.fn();

    await render(
      <Wrapper store={new InMemoryPreferencesStore()}>
        <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={onOpenSettings} />
      </Wrapper>
    );
    const standard = { badge: badgeStyle(), label: labelStyle() };
    cleanup();

    await render(
      <Wrapper store={new InMemoryPreferencesStore()}>
        <ReferenceBadge a4Hz={432} isNonStandard onOpenSettings={onOpenSettings} />
      </Wrapper>
    );
    const nonStandard = { badge: badgeStyle(), label: labelStyle() };

    // Colour and weight both still separate them, so the distinction survives
    // greyscale on weight alone.
    expect(nonStandard.label.color).not.toBe(standard.label.color);
    expect(Number(nonStandard.label.fontWeight)).toBeGreaterThan(Number(standard.label.fontWeight));
  });
});
