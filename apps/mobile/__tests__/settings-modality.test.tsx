import { type Appearance } from '@chromatic-tuner/core';
import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRef, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import { SettingsScreen } from '../src/components/screens/SettingsScreen';
import { TunerScreen } from '../src/components/screens/TunerScreen';

/**
 * V56 (006, FR-142, FR-143) — mobile parity, asserted rather than trusted.
 *
 * None of `006`'s four defects exists on this platform, and no production code
 * here changed (research D7). Focus escaping, the page scrolling behind, and
 * focus being stolen on a preference change are all prevented by things the
 * platform gives us for free — which is exactly why they are worth pinning:
 * each is one refactor away from disappearing without a failing test.
 *
 * A separate file from `__tests__/settings.test.tsx` on purpose. These assert
 * that behaviour we chose NOT to implement is still provided, so they must not
 * be deletable alongside a settings test someone is rewriting for other reasons
 * (FR-143).
 *
 * All three pass on today's code. That is the point, and it is the stated
 * exception to this feature's "a test that passes first time is wrong" rule:
 * they are non-regression pins, not regression tests, and there is no defect
 * here for them to have caught.
 */

// RNTL's automatic cleanup does not register under this jest-expo setup, so a
// mounted tree survives into the next test and every query resolves against the
// stale one.
afterEach(cleanup);

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

function Wrapper({
  children,
  store,
  device = 'light',
}: {
  children: ReactNode;
  store: InMemoryPreferencesStore;
  device?: Appearance;
}) {
  // Built once per mount: `TunerProvider` rebuilds its session whenever the
  // port identities change.
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

describe('the settings sheet gets its modality from the platform (V56, FR-142)', () => {
  it('renders inside a Modal that confines assistive technology', async () => {
    await render(
      <Wrapper store={new InMemoryPreferencesStore()}>
        <SettingsScreen open onClose={jest.fn()} />
      </Wrapper>
    );
    await settle();

    // It IS a Modal, not merely something wearing its testID — on Android that
    // is what makes the sheet its own native window, so containment is the
    // window's rather than anything this code does. `type` is the host
    // component name, which is the one place the rendered tree still
    // distinguishes a Modal from the `View` everything else collapses to.
    const modal = screen.getByTestId('settings-modal');
    expect(modal.type).toBe('Modal');

    // The VALUE, not the presence of the prop. `accessibilityViewIsModal` is
    // the iOS mechanism that stops VoiceOver walking out of the sheet onto the
    // tuner behind it, and a test that only checks the key is there would pass
    // for `accessibilityViewIsModal={false}` — which is the whole web defect,
    // arriving on the other platform.
    expect(modal.props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByTestId('settings-sheet')).toBeTruthy();
  });
});

describe('there is nothing behind the sheet to scroll (V56, FR-142)', () => {
  /**
   * This one is asserted against the SOURCE, and that is a deliberate retreat
   * from something better that does not exist here.
   *
   * The web's defect 2 needs a scrolling document to exist at all. This screen
   * is full-screen and centred with no scroll view, and `003`'s below-the-fold
   * content was web-only — so there is no equivalent on this platform.
   *
   * The obvious assertion is "no `ScrollView` in the rendered tree", and under
   * this jest-expo setup it **cannot fail**. Measured while writing this:
   * RNTL 14 removed the `UNSAFE_*ByType` queries, and the host tree it does
   * expose renders a real `<ScrollView>` as `type: 'View'` carrying only
   * `children` — indistinguishable from a plain `<View>`, and a `<FlatList>`
   * is too. Any render-level check would have passed happily on a tuner screen
   * full of scroll views, which is precisely the class of test this feature
   * exists to stop shipping.
   *
   * So it reads the files instead. Crude, but it fails on the change that
   * matters: someone adding a scroller to the tuner side. The settings screen
   * is excluded on purpose — a long sheet may legitimately need to scroll its
   * own content, and that is not what FR-142 is about.
   */
  it('renders and mounts without error', async () => {
    await render(
      <Wrapper store={new InMemoryPreferencesStore()}>
        <TunerScreen />
      </Wrapper>
    );
    await settle();

    expect(screen.getByTestId('tuner-screen')).toBeTruthy();
  });

  it('has no scrollable component anywhere on the tuner side', () => {
    const componentsDir = join(__dirname, '..', 'src', 'components');

    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.tsx') && entry.name !== 'SettingsScreen.tsx') {
          sources.push(path);
        }
      }
    };
    walk(componentsDir);

    // A guard on the guard: if the walk ever finds nothing, the loop below
    // asserts nothing and this test becomes a green vacuum.
    expect(sources.length).toBeGreaterThan(5);

    // Collected rather than asserted one at a time: jest's `expect` takes no
    // message argument, so a per-file assertion would fail with the file's
    // whole contents and no clue which file it was.
    const offenders = sources.filter((path) =>
      /\b(ScrollView|FlatList|SectionList|VirtualizedList)\b/.test(readFileSync(path, 'utf8'))
    );

    expect(offenders).toEqual([]);
  });
});

describe('changing a preference does not move accessibility focus (V56, FR-143)', () => {
  it('never calls setAccessibilityFocus', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');

    await render(
      <Wrapper store={new InMemoryPreferencesStore()}>
        <SettingsScreen open onClose={jest.fn()} />
      </Wrapper>
    );
    await settle();

    // The mobile equivalent of the web's defects 3 and 4. Nothing here moves
    // focus today — `SettingsScreen`'s effects are keyed on
    // `[open, reduceMotion, offset]`, and `offset` is a Reanimated shared value
    // with a stable identity, so a preference change re-renders without
    // re-running anything. An autofocus added "to announce the new value"
    // would be precisely the web bug, and this is what would fail.
    for (const testID of ['accidental-flat', 'appearance-dark', 'a4-increment', 'settings-reset']) {
      await act(async () => {
        fireEvent.press(screen.getByTestId(testID));
      });
      await settle();
    }

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
