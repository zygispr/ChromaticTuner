import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { A4_MAX_HZ, A4_MIN_HZ, frequencyOf } from '@chromatic-tuner/core';
import type { Appearance, PreferencesStore, StoredPreferences } from '@chromatic-tuner/core';
import {
  InMemoryPreferencesStore,
  NoopWakeLock,
  ScriptedAudioSource,
} from '@chromatic-tuner/core/testing';

import { TunerProvider } from '../src/TunerProvider';
import { usePreferences } from '../src/usePreferences';
import { useTuner } from '../src/useTuner';

/**
 * User Story 4 at the React seam (T083, T086).
 *
 * The core model is tested exhaustively in `packages/core`; what is only
 * testable here is the wiring — that a stored preference reaches the analyzer,
 * that the accidental choice reaches every note display, and that a clamped
 * setter cannot put the UI into a state the domain rejects.
 */

const SAMPLE_RATE = 44100;

function tone(midi: number, length = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequencyOf(midi, 440)) / SAMPLE_RATE;
  for (let i = 0; i < length; i += 1) out[i] = 0.8 * Math.sin(step * i);
  return out;
}

function Harness() {
  const {
    a4Hz,
    accidentalStyle,
    isNonStandardReference,
    persistenceFailed,
    tunerDisplay,
    setA4Hz,
    setTunerDisplay,
    reset,
  } = usePreferences();
  const { note } = useTuner();

  return (
    <div>
      <span data-testid="a4">{a4Hz}</span>
      <span data-testid="style">{accidentalStyle}</span>
      <span data-testid="non-standard">{String(isNonStandardReference)}</span>
      <span data-testid="persist-failed">{String(persistenceFailed)}</span>
      <span data-testid="display">{tunerDisplay}</span>
      <span data-testid="note">{note ?? '-'}</span>
      <button data-testid="pick-dial" onClick={() => setTunerDisplay('dial')}>
        dial
      </button>
      <button data-testid="pick-line" onClick={() => setTunerDisplay('line')}>
        line
      </button>
      <button data-testid="up" onClick={() => setA4Hz(a4Hz + 50)}>
        up
      </button>
      <button data-testid="down" onClick={() => setA4Hz(a4Hz - 50)}>
        down
      </button>
      {/* A step that stays inside the range, for the tests that are not about clamping. */}
      <button data-testid="nudge" onClick={() => setA4Hz(a4Hz - 8)}>
        nudge
      </button>
      <button data-testid="reset" onClick={reset}>
        reset
      </button>
    </div>
  );
}

function renderWith(store?: PreferencesStore, source = new ScriptedAudioSource()) {
  const props = store === undefined ? {} : { preferences: store };
  return render(
    <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()} {...props}>
      <Harness />
    </TunerProvider>
  );
}

describe('usePreferences outside a provider', () => {
  it('throws with a clear message rather than returning undefined', () => {
    function Bare() {
      usePreferences();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/TunerProvider/i);
  });
});

describe('defaults and loading', () => {
  it('starts at concert pitch with sharps when nothing is stored', async () => {
    renderWith(new InMemoryPreferencesStore());

    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('440'));
    expect(screen.getByTestId('style').textContent).toBe('sharp');
    expect(screen.getByTestId('non-standard').textContent).toBe('false');
  });

  it('adopts a stored preference on mount', async () => {
    renderWith(
      new InMemoryPreferencesStore({
        a4Hz: 432,
        accidentalStyle: 'flat',
        appearance: 'system',
        tunerDisplay: 'line',
        schemaVersion: 1,
      })
    );

    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('432'));
    expect(screen.getByTestId('style').textContent).toBe('flat');
    expect(screen.getByTestId('non-standard').textContent).toBe('true');
  });

  it('works with no store at all, keeping preferences for the session', async () => {
    renderWith(undefined);

    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('440'));
    await act(async () => {
      screen.getByTestId('nudge').click();
    });
    expect(screen.getByTestId('a4').textContent).toBe('432');
  });
});

describe('setA4Hz clamps rather than rejecting (guarantee R4)', () => {
  it('stops at the top of the range instead of going out of bounds', async () => {
    renderWith(new InMemoryPreferencesStore());
    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('440'));

    // Two presses of +50 would reach 540 if the setter simply added.
    await act(async () => {
      screen.getByTestId('up').click();
    });
    await act(async () => {
      screen.getByTestId('up').click();
    });

    expect(Number(screen.getByTestId('a4').textContent)).toBe(A4_MAX_HZ);
  });

  it('stops at the bottom of the range', async () => {
    renderWith(new InMemoryPreferencesStore());
    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('440'));

    await act(async () => {
      screen.getByTestId('down').click();
    });
    await act(async () => {
      screen.getByTestId('down').click();
    });

    expect(Number(screen.getByTestId('a4').textContent)).toBe(A4_MIN_HZ);
  });
});

describe('persistence', () => {
  it('writes a change through to the store', async () => {
    const store = new InMemoryPreferencesStore();
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('440'));

    await act(async () => {
      screen.getByTestId('nudge').click();
    });

    await waitFor(async () => expect((await store.load())?.a4Hz).toBe(432));
  });

  it('keeps working, and says so, when the store cannot write (obligation P2)', async () => {
    const store = new InMemoryPreferencesStore();
    store.saveError = new Error('quota exceeded');
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('440'));

    await act(async () => {
      screen.getByTestId('nudge').click();
    });

    // The value the user chose still applies for this session...
    expect(screen.getByTestId('a4').textContent).toBe('432');
    // ...and the failure is surfaced rather than swallowed.
    await waitFor(() => expect(screen.getByTestId('persist-failed').textContent).toBe('true'));
  });

  it('clears stored data on reset, so the next launch is a fresh install', async () => {
    const store = new InMemoryPreferencesStore({
      a4Hz: 415,
      accidentalStyle: 'flat',
      appearance: 'dark',
      tunerDisplay: 'line',
      schemaVersion: 1,
    });
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('a4').textContent).toBe('415'));

    await act(async () => {
      screen.getByTestId('reset').click();
    });

    expect(screen.getByTestId('a4').textContent).toBe('440');
    expect(screen.getByTestId('style').textContent).toBe('sharp');
    await waitFor(async () => expect(await store.load()).toBeNull());
  });
});

describe('the reference pitch reaches the live analyzer (T086)', () => {
  it('renames a held note when A4 changes, without losing the reading', async () => {
    const source = new ScriptedAudioSource({ samples: tone(69) }); // A4 at 440
    renderWith(new InMemoryPreferencesStore(), source);

    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(12);
    });
    expect(screen.getByTestId('note').textContent).toBe('A');

    // Drop A4 far enough that a 440 Hz tone is no longer nearest to A.
    await act(async () => {
      screen.getByTestId('down').click();
    });
    await act(async () => {
      source.pump(12);
    });

    // The reading survived the change — the display never blanked (N7) — and
    // the same physical pitch is now named against the new reference.
    expect(screen.getByTestId('note').textContent).not.toBe('-');
    expect(screen.getByTestId('non-standard').textContent).toBe('true');
  });
});

/**
 * V42 / M9-M11 — the appearance at the React seam.
 *
 * The rule itself is proved exhaustively in `packages/core`. What is only
 * testable here is that the provider RESOLVES rather than passes through: that
 * it publishes one appearance every surface reads (M9), that it says when
 * storage has answered (M10), and that a seeded provider is correct on its very
 * first render rather than one commit later (M11).
 */
function AppearanceHarness() {
  const { appearance, appearancePreference, preferencesLoaded, setAppearancePreference } =
    usePreferences();

  return (
    <div>
      <span data-testid="appearance">{appearance}</span>
      <span data-testid="preference">{appearancePreference}</span>
      <span data-testid="loaded">{String(preferencesLoaded)}</span>
      <button data-testid="choose-dark" onClick={() => setAppearancePreference('dark')}>
        dark
      </button>
      <button data-testid="choose-system" onClick={() => setAppearancePreference('system')}>
        system
      </button>
    </div>
  );
}

function renderAppearance(props: {
  device?: Appearance;
  store?: PreferencesStore;
  initial?: StoredPreferences;
}) {
  // Built conditionally rather than spread with undefineds: the package sets
  // `exactOptionalPropertyTypes`, so `deviceAppearance={undefined}` is a type
  // error rather than the same thing as omitting it.
  const optional = {
    ...(props.device === undefined ? {} : { deviceAppearance: props.device }),
    ...(props.store === undefined ? {} : { preferences: props.store }),
    ...(props.initial === undefined ? {} : { initialPreferences: props.initial }),
  };

  return render(
    <TunerProvider
      audioSource={new ScriptedAudioSource()}
      wakeLock={new NoopWakeLock()}
      {...optional}
    >
      <AppearanceHarness />
    </TunerProvider>
  );
}

describe('the provider resolves one appearance for the whole tree (M9)', () => {
  it('lets an explicit choice beat a contradicting device (FR-116)', async () => {
    // The device says light and the stored preference says dark. An
    // implementation that forwards `deviceAppearance` to the tree — or that
    // never calls the rule at all — renders 'light' here.
    renderAppearance({
      device: 'light',
      store: new InMemoryPreferencesStore({
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance: 'dark',
        tunerDisplay: 'line',
        schemaVersion: 1,
      }),
    });

    await waitFor(() => expect(screen.getByTestId('appearance').textContent).toBe('dark'));
    // The stored preference is published alongside it, because the control has
    // to show 'dark' as chosen rather than infer it from what was rendered.
    expect(screen.getByTestId('preference').textContent).toBe('dark');
  });

  it('follows the device while the preference is system (FR-115)', async () => {
    const { rerender } = renderAppearance({ device: 'dark' });
    await waitFor(() => expect(screen.getByTestId('appearance').textContent).toBe('dark'));

    rerender(
      <TunerProvider
        audioSource={new ScriptedAudioSource()}
        wakeLock={new NoopWakeLock()}
        deviceAppearance="light"
      >
        <AppearanceHarness />
      </TunerProvider>
    );

    expect(screen.getByTestId('appearance').textContent).toBe('light');
    expect(screen.getByTestId('preference').textContent).toBe('system');
  });

  it('stops following the device once an explicit choice is made (FR-116)', async () => {
    const { rerender } = renderAppearance({
      device: 'light',
      store: new InMemoryPreferencesStore(),
    });
    await waitFor(() => expect(screen.getByTestId('appearance').textContent).toBe('light'));

    await act(async () => {
      screen.getByTestId('choose-dark').click();
    });
    expect(screen.getByTestId('appearance').textContent).toBe('dark');

    // The device swings to dark and back. Neither move may be visible, because
    // the user has taken the decision away from it.
    for (const device of ['dark', 'light'] as const) {
      rerender(
        <TunerProvider
          audioSource={new ScriptedAudioSource()}
          wakeLock={new NoopWakeLock()}
          deviceAppearance={device}
        >
          <AppearanceHarness />
        </TunerProvider>
      );
      expect(screen.getByTestId('appearance').textContent).toBe('dark');
    }
  });

  it('defaults deviceAppearance to light so a test need not care', () => {
    renderAppearance({});
    expect(screen.getByTestId('appearance').textContent).toBe('light');
  });
});

describe('preferencesLoaded (M10, M11)', () => {
  it('is false until the store answers, then true and never false again', async () => {
    const seen: string[] = [];

    function Recorder() {
      const { preferencesLoaded } = usePreferences();
      seen.push(String(preferencesLoaded));
      return null;
    }

    render(
      <TunerProvider
        audioSource={new ScriptedAudioSource()}
        wakeLock={new NoopWakeLock()}
        preferences={new InMemoryPreferencesStore()}
      >
        <Recorder />
      </TunerProvider>
    );

    // The first render happens before any promise can settle, so this is the
    // state the web app must NOT write `data-theme` from.
    expect(seen[0]).toBe('false');

    await waitFor(() => expect(seen.at(-1)).toBe('true'));
    // Once true it stays true: a later render must never hand the web effect a
    // reason to stop writing.
    expect(seen.slice(seen.indexOf('true'))).not.toContain('false');
  });

  it('is true on the FIRST render when initialPreferences is supplied (M11)', () => {
    const seen: string[] = [];

    function Recorder() {
      const { preferencesLoaded, appearance } = usePreferences();
      seen.push(`${String(preferencesLoaded)}:${appearance}`);
      return null;
    }

    render(
      <TunerProvider
        audioSource={new ScriptedAudioSource()}
        wakeLock={new NoopWakeLock()}
        deviceAppearance="light"
        initialPreferences={{
          a4Hz: 440,
          accidentalStyle: 'sharp',
          appearance: 'dark',
          tunerDisplay: 'line',
          schemaVersion: 1,
        }}
      >
        <Recorder />
      </TunerProvider>
    );

    // Asserted with no act() flush and no waitFor: this is the initial commit,
    // and it is the whole point. A provider that seeds from DEFAULT_PREFERENCES
    // and corrects itself in an effect renders 'false:light' here — one frame
    // of the wrong appearance, which on mobile is the flash D5 exists to
    // prevent (FR-120).
    expect(seen[0]).toBe('true:dark');
  });

  it('does not read the store at all when initialPreferences is supplied (M11)', () => {
    const store = new InMemoryPreferencesStore({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'light',
      tunerDisplay: 'line',
      schemaVersion: 1,
    });

    renderAppearance({
      device: 'light',
      store,
      initial: {
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance: 'dark',
        tunerDisplay: 'line',
        schemaVersion: 1,
      },
    });

    // The seed wins, and the async load is skipped rather than raced — if it
    // ran, this would flip to 'light' a tick later and the store would have
    // been read.
    expect(screen.getByTestId('appearance').textContent).toBe('dark');
    expect(store.loadCount).toBe(0);
  });
});

describe('the appearance choice is persisted like any other preference', () => {
  it('writes the whole record, keeping the other two settings', async () => {
    const store = new InMemoryPreferencesStore();
    renderAppearance({ device: 'light', store });
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));

    await act(async () => {
      screen.getByTestId('choose-dark').click();
    });

    await waitFor(async () => {
      expect(await store.load()).toEqual({
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance: 'dark',
        tunerDisplay: 'line',
        schemaVersion: 1,
      });
    });
  });

  it('stores system as a choice in its own right, not as what it resolved to', async () => {
    // FR-119: a user who picks "Match device" in daylight is still matching the
    // device that night. Storing 'light' here would break that the first time
    // the OS changed.
    const store = new InMemoryPreferencesStore();
    renderAppearance({ device: 'light', store });
    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('true'));

    await act(async () => {
      screen.getByTestId('choose-dark').click();
    });
    await act(async () => {
      screen.getByTestId('choose-system').click();
    });

    await waitFor(async () => expect((await store.load())?.appearance).toBe('system'));
    expect(screen.getByTestId('appearance').textContent).toBe('light');
  });
});

describe('the accidental choice reaches every note display (FR-023)', () => {
  it('spells the same pitch as D♯ or E♭ according to the preference', async () => {
    const source = new ScriptedAudioSource({ samples: tone(39) }); // D#2 / Eb2

    const sharp = render(
      <TunerProvider
        audioSource={source}
        wakeLock={new NoopWakeLock()}
        preferences={new InMemoryPreferencesStore()}
      >
        <Harness />
      </TunerProvider>
    );
    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(12);
    });
    expect(screen.getByTestId('note').textContent).toBe('D♯');
    sharp.unmount();

    const flatSource = new ScriptedAudioSource({ samples: tone(39) });
    render(
      <TunerProvider
        audioSource={flatSource}
        wakeLock={new NoopWakeLock()}
        preferences={
          new InMemoryPreferencesStore({
            a4Hz: 440,
            accidentalStyle: 'flat',
            appearance: 'system',
            tunerDisplay: 'line',
            schemaVersion: 1,
          })
        }
      >
        <Harness />
      </TunerProvider>
    );
    await act(async () => {
      await flatSource.startedPromise;
    });
    await waitFor(() => expect(screen.getByTestId('style').textContent).toBe('flat'));
    await act(async () => {
      flatSource.pump(12);
    });

    expect(screen.getByTestId('note').textContent).toBe('E♭');
  });
});

/**
 * G20 and the FR-150 half of the display preference, at the React seam.
 *
 * The core proves the value is stored and repaired; what is only provable here
 * is the wiring — that the choice reaches consumers, survives the same
 * optimistic-write path every other setting uses, and that reset returns it.
 */
describe('tuner display (007 FR-146, FR-150, G20)', () => {
  it('defaults to the line when nothing is stored (FR-149)', async () => {
    renderWith(new InMemoryPreferencesStore());
    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('line'));
  });

  it('adopts a stored dial on mount (FR-150)', async () => {
    renderWith(
      new InMemoryPreferencesStore({
        a4Hz: 440,
        accidentalStyle: 'sharp',
        appearance: 'system',
        tunerDisplay: 'dial',
        schemaVersion: 1,
      })
    );

    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('dial'));
  });

  it('applies a change immediately and persists it', async () => {
    const store = new InMemoryPreferencesStore();
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('line'));

    const savesBefore = store.saveCount;
    await act(async () => {
      screen.getByTestId('pick-dial').click();
    });

    expect(screen.getByTestId('display').textContent).toBe('dial');
    await waitFor(() => expect(store.saveCount).toBeGreaterThan(savesBefore));
    const written = await store.load();
    expect(written?.tunerDisplay).toBe('dial');
  });

  it('leaves the other three preferences alone when it changes', async () => {
    // The setter spreads the whole record. A spread that dropped a sibling
    // would be invisible to a test that only reads back the field it set.
    const store = new InMemoryPreferencesStore({
      a4Hz: 432,
      accidentalStyle: 'flat',
      appearance: 'dark',
      tunerDisplay: 'line',
      schemaVersion: 1,
    });
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('line'));

    await act(async () => {
      screen.getByTestId('pick-dial').click();
    });

    await waitFor(async () => {
      const written = await store.load();
      expect(written).toMatchObject({
        a4Hz: 432,
        accidentalStyle: 'flat',
        appearance: 'dark',
        tunerDisplay: 'dial',
      });
    });
  });

  it('still applies the change when the write fails, and reports it (FR-153)', async () => {
    const store = new InMemoryPreferencesStore();
    store.saveError = new Error('quota exceeded');
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('line'));

    await act(async () => {
      screen.getByTestId('pick-dial').click();
    });

    // Applied anyway: a storage failure must not block the choice the user can
    // plainly see they made (obligation P2).
    expect(screen.getByTestId('display').textContent).toBe('dial');
    await waitFor(() => expect(screen.getByTestId('persist-failed').textContent).toBe('true'));
  });

  it('returns to the line on reset (FR-150)', async () => {
    const store = new InMemoryPreferencesStore();
    renderWith(store);
    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('line'));

    await act(async () => {
      screen.getByTestId('pick-dial').click();
    });
    expect(screen.getByTestId('display').textContent).toBe('dial');

    await act(async () => {
      screen.getByTestId('reset').click();
    });
    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('line'));
  });
});
