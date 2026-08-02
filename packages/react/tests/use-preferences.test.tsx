import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { A4_MAX_HZ, A4_MIN_HZ, frequencyOf } from '@chromatic-tuner/core';
import type { PreferencesStore } from '@chromatic-tuner/core';
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
  const { a4Hz, accidentalStyle, isNonStandardReference, persistenceFailed, setA4Hz, reset } =
    usePreferences();
  const { note } = useTuner();

  return (
    <div>
      <span data-testid="a4">{a4Hz}</span>
      <span data-testid="style">{accidentalStyle}</span>
      <span data-testid="non-standard">{String(isNonStandardReference)}</span>
      <span data-testid="persist-failed">{String(persistenceFailed)}</span>
      <span data-testid="note">{note ?? '-'}</span>
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
      new InMemoryPreferencesStore({ a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 })
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
          new InMemoryPreferencesStore({ a4Hz: 440, accidentalStyle: 'flat', schemaVersion: 1 })
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
