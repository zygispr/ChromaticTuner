import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { color, space } from '@chromatic-tuner/tokens';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { useRef } from 'react';
import { StyleSheet } from 'react-native';

import { ReferenceBadge } from '../src/components/atoms/ReferenceBadge';
import { MicrophoneToggle } from '../src/components/molecules/MicrophoneToggle';
import { PermissionPrompt } from '../src/components/molecules/PermissionPrompt';
import { StatusBanner } from '../src/components/molecules/StatusBanner';
import { SettingsScreen } from '../src/components/screens/SettingsScreen';

/**
 * Every control reacts to touch — the mobile half of FR-058 / FR-059.
 *
 * Raised by V20's human leg, which was about the web: the tester noted that
 * nothing in the app responds to hover. Hover does not exist here, so the
 * equivalent is feedback while the finger is still down — the state a user
 * occupies for the whole duration of a deliberate press.
 *
 * Two shapes, asserted differently on purpose, because they composite
 * differently:
 *
 * - **Ghost** controls are transparent at rest, so the wash simply becomes
 *   their background.
 * - **Solid** controls are already filled with `text`. Replacing that fill
 *   would erase the button and take its `background`-coloured label with it, so
 *   they layer the wash as an overlay instead — what the web does with an inset
 *   box-shadow, expressed the way React Native can express it.
 *
 * The asymmetry is asserted rather than hidden, so neither shape can quietly
 * lose its feedback.
 */

/**
 * A file-local Pressable that renders in whichever press state a test asks for.
 *
 * **Deviation, and why.** The obvious test — fire a press and read the style
 * back — cannot work here. React Native resolves `style({ pressed })` inside
 * `Pressable` and hands the host `View` the finished object, so the rendered
 * tree never carries the function; RNTL exposes host components only, so the
 * composite is unreachable. Driving the real responder does not help either:
 * the host carries `onResponderGrant` rather than `onPressIn`, and firing the
 * full grant sequence leaves the internal press state untouched under jest-expo.
 *
 * So the press state is supplied rather than simulated. `marker-rest.test.tsx`
 * and `settings-animation.test.tsx` set the precedent for a file-local mock
 * where the shared setup makes the real thing unobservable.
 *
 * What this proves: each control's style responds to `pressed` with the wash,
 * which is the contract all of them now rely on. What it does not prove: that
 * React Native flips `pressed` on a real touch. That is RN's own behaviour, and
 * the device run is where the app is actually touched.
 */
let mockPressed = false;

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  // Hoisted above the imports by Jest, so these cannot be import statements —
  // the same constraint marker-rest.test.tsx and settings-animation.test.tsx
  // work under.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */

  return {
    __esModule: true,
    default: ({ style, children, ...rest }: Record<string, unknown>) =>
      React.createElement(
        View,
        {
          ...rest,
          style: typeof style === 'function' ? style({ pressed: mockPressed }) : style,
        },
        typeof children === 'function' ? children({ pressed: mockPressed }) : children
      ),
  };
});

afterEach(() => {
  cleanup();
  mockPressed = false;
});

const WASH = color.pressed.light;

/** Transparent at rest, so the wash becomes the background outright. */
const GHOST = [
  'reference-badge',
  'microphone-toggle',
  'settings-close',
  'a4-decrement',
  'a4-increment',
  'accidental-flat',
  'settings-reset',
];

/**
 * Controls with a fill of their own, and what each is filled with.
 *
 * Keyed rather than listed because there are now two fills: the primary actions
 * take `text`, and a chosen accidental takes the quieter `selected` tint. What
 * they share is the constraint this file exists for — the wash has to layer
 * over the fill instead of replacing it, whatever the fill is.
 *
 * `accidental-sharp` is here and `accidental-flat` is a ghost because sharps is
 * the default preference: the chosen accidental is the filled shape and the
 * unchosen one is not, so which side each lands on is a fact about the default,
 * not about the control. `settings.test.tsx` covers the fill following the
 * selection when it moves.
 */
const FILLED: Record<string, string> = {
  'allow-microphone': color.text.light,
  'retry-button': color.text.light,
  'accidental-sharp': color.selected.light,
};
const SOLID = Object.keys(FILLED);

/**
 * Pressables that are not controls.
 *
 * `SettingsScreen`'s backdrop is a Pressable because tapping it dismisses, and
 * the sheet is one purely to swallow presses so they never reach the backdrop
 * (US3). Washing either would light the whole sheet up under any touch inside
 * it.
 */
const INERT = ['settings-backdrop', 'settings-sheet'];

/**
 * `includeHiddenElements` throughout, because `SettingsScreen` renders an open
 * `Modal`: RNTL follows the aria-modal rule and treats everything outside it as
 * hidden, which would make every other control on the screen unqueryable. The
 * question here is what a control's style resolves to, not what a screen reader
 * would reach — that is `settings.test.tsx`'s job.
 */
const DEEP = { includeHiddenElements: true } as const;

/** The resolved background of a control, after RN flattens its style array. */
function backgroundOf(testID: string): string | undefined {
  const style = StyleSheet.flatten(screen.getByTestId(testID, DEEP).props.style) as {
    backgroundColor?: string;
  };
  return style?.backgroundColor;
}

/**
 * Every control in one tree, rendered once.
 *
 * One render per test on purpose: rendering twice within a test, or unmounting
 * between, leaves every later query in the file resolving against an empty tree
 * under this jest-expo setup. So each press state gets its own test.
 */
function AllControls() {
  const audio = useRef(new ScriptedAudioSource()).current;
  const prefs = useRef(new InMemoryPreferencesStore()).current;
  const wake = useRef(new NoopWakeLock()).current;

  return (
    <TunerProvider audioSource={audio} wakeLock={wake} preferences={prefs} autoStart={false}>
      <ReferenceBadge a4Hz={440} isNonStandard={false} onOpenSettings={() => undefined} />
      <MicrophoneToggle capturing onToggle={() => undefined} />
      <PermissionPrompt onAllow={() => undefined} />
      <StatusBanner
        status={{ kind: 'error', message: 'The microphone is unavailable.' }}
        onRetry={() => undefined}
        captureStopped={false}
      />
      <SettingsScreen open onClose={() => undefined} />
    </TunerProvider>
  );
}

async function renderWith(pressed: boolean): Promise<void> {
  mockPressed = pressed;
  // RNTL 14's `render` is asynchronous; an un-awaited call leaves every
  // subsequent query resolving against a stale tree.
  await render(<AllControls />);
  // The stored preference arrives one turn of the event loop later.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/**
 * Asserted as whole objects rather than in a loop of bare `expect`s: Jest has
 * no per-assertion message, so a loop would report only "expected X, got Y"
 * without naming which control failed. A keyed object puts the offender in the
 * diff.
 */
function backgroundsOf(testIDs: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(testIDs.map((testID) => [testID, backgroundOf(testID)]));
}

function allSetTo<T>(testIDs: readonly string[], value: T) {
  return Object.fromEntries(testIDs.map((testID) => [testID, value]));
}

/**
 * The wash is clipped to a control's own corners, so it cannot paint a square.
 *
 * Reported after the wash shipped: the settings sheet's "Done" button was the
 * only control in either app without a corner radius, which nothing had noticed
 * while it was an unfilled label. Give it a background and the omission becomes
 * a hard 44x44 square beside five rounded controls.
 *
 * Asserted across every control rather than on "Done" alone. The defect was not
 * really that one button was wrong — it was that nothing checked the set was
 * consistent, so the next control to skip a radius would look fine until
 * something filled it in.
 */
it('every control has rounded corners for the wash to follow (FR-058)', async () => {
  await renderWith(false);

  const radii = Object.fromEntries(
    [...GHOST, ...SOLID].map((testID) => [
      testID,
      (
        StyleSheet.flatten(screen.getByTestId(testID, DEEP).props.style) as {
          borderRadius?: number;
        }
      ).borderRadius,
    ])
  );

  expect(radii).toEqual(allSetTo([...GHOST, ...SOLID], space.sm));
});

/**
 * "Done" is padded like the app's other compact control, and pulled outwards.
 *
 * Reported from the device: the control looked too small and the word barely
 * fitted. It had no horizontal padding at all — a 44 pt touch target wrapped
 * tight around roughly 40 pt of text, which reads as cramped now the wash makes
 * the box visible.
 *
 * It carries **no** horizontal margin. An earlier attempt pulled the box
 * outwards with a negative one, to keep the LABEL on the sheet's content edge —
 * the wrong edge to align. What a user sees is the box: this one's wash against
 * the accidental buttons' borders and the reset button's, all of which end on
 * that edge. A negative margin puts this control 8 px past all of them.
 *
 * RNTL cannot measure layout, so the web spec asserts the resulting edges and
 * this asserts the style that produces them.
 */
it('the Done control is padded like the other compact control (FR-058)', async () => {
  await renderWith(false);

  const done = StyleSheet.flatten(screen.getByTestId('settings-close', DEEP).props.style) as {
    paddingHorizontal?: number;
    marginRight?: number;
    marginHorizontal?: number;
  };
  const badge = StyleSheet.flatten(screen.getByTestId('reference-badge', DEEP).props.style) as {
    paddingHorizontal?: number;
  };

  expect(done.paddingHorizontal).toBe(badge.paddingHorizontal);
  expect(done.paddingHorizontal).toBe(space.md);

  // Nothing may shift the box off the edge the controls below it share.
  expect(done.marginRight ?? 0).toBe(0);
  expect(done.marginHorizontal ?? 0).toBe(0);
});

it('no control carries the wash at rest (FR-058, FR-059)', async () => {
  await renderWith(false);

  for (const [testID, background] of Object.entries(
    backgroundsOf([...GHOST, ...SOLID, ...INERT])
  )) {
    expect({ testID, background }).not.toEqual({ testID, background: WASH });
  }

  // The filled controls' fill is exactly what the wash must not replace.
  expect(backgroundsOf(SOLID)).toEqual(FILLED);
  for (const testID of SOLID) {
    expect(screen.queryByTestId(`${testID}-wash`, DEEP)).toBeNull();
  }
});

it('every control washes while the finger is still down (FR-059)', async () => {
  await renderWith(true);

  expect(backgroundsOf(GHOST)).toEqual(allSetTo(GHOST, WASH));

  // The fill survives the press, or the label goes invisible against it.
  expect(backgroundsOf(SOLID)).toEqual(FILLED);
  expect(
    Object.fromEntries(
      SOLID.map((testID) => [
        testID,
        (
          StyleSheet.flatten(screen.getByTestId(`${testID}-wash`, DEEP).props.style) as {
            backgroundColor?: string;
          }
        ).backgroundColor,
      ])
    )
  ).toEqual(allSetTo(SOLID, WASH));

  for (const [testID, background] of Object.entries(backgroundsOf(INERT))) {
    expect({ testID, background }).not.toEqual({ testID, background: WASH });
  }
});
