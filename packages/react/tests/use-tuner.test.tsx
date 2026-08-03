import { act, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { frequencyOf } from '@chromatic-tuner/core';
import { NoopWakeLock, ScriptedAudioSource } from '@chromatic-tuner/core/testing';

import { TunerProvider } from '../src/TunerProvider';
import { useTuner } from '../src/useTuner';

const SAMPLE_RATE = 44100;

function tone(midi: number, length = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequencyOf(midi, 440)) / SAMPLE_RATE;
  for (let i = 0; i < length; i += 1) out[i] = 0.8 * Math.sin(step * i);
  return out;
}

function Harness({ onRender }: { onRender?: (() => void) | undefined }) {
  const { status, note, octave, tuningState, direction, cents } = useTuner();
  onRender?.();
  return (
    <div>
      <span data-testid="status">{status.kind}</span>
      <span data-testid="note">{note ?? '-'}</span>
      <span data-testid="octave">{octave ?? '-'}</span>
      <span data-testid="state">{tuningState}</span>
      <span data-testid="direction">{direction ?? '-'}</span>
      <span data-testid="cents">{cents === null ? '-' : Math.round(cents)}</span>
    </div>
  );
}

function renderWithProvider(source: ScriptedAudioSource, onRender?: () => void) {
  return render(
    <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()}>
      <Harness onRender={onRender} />
    </TunerProvider>
  );
}

describe('useTuner outside a provider (guarantee R3)', () => {
  it('throws immediately with a clear message rather than returning undefined', () => {
    // React logs the error boundary trace; the assertion is the throw itself.
    expect(() => render(<Harness />)).toThrow(/TunerProvider/i);
  });
});

describe('discrete state', () => {
  it('starts idle and exposes a no-reading tuning state', async () => {
    const source = new ScriptedAudioSource();
    renderWithProvider(source);

    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(screen.getByTestId('state').textContent).toBe('no-reading');
    expect(screen.getByTestId('note').textContent).toBe('-');
  });

  it('reports the note, octave, state and direction once a pitch is detected', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) }); // E2
    const { getByTestId } = renderWithProvider(source);

    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(12);
    });

    expect(getByTestId('status').textContent).toBe('reading');
    expect(getByTestId('note').textContent).toBe('E');
    expect(getByTestId('octave').textContent).toBe('2');
    expect(getByTestId('state').textContent).toBe('in-tune');
    expect(getByTestId('direction').textContent).toBe('-');
  });

  it('exposes an immutable snapshot, not the reused reading object (guarantee R2)', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) });
    const snapshots: Array<string | null> = [];

    function Capture() {
      const { note } = useTuner();
      snapshots.push(note);
      return null;
    }

    render(
      <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()}>
        <Capture />
      </TunerProvider>
    );

    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(12);
    });

    // The earliest snapshot must NOT have been retroactively mutated to 'E'.
    expect(snapshots[0]).toBeNull();
    expect(snapshots[snapshots.length - 1]).toBe('E');
  });
});

describe('subscribeToCents (guarantee R1)', () => {
  it('never triggers a React render', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) });
    let renders = 0;
    const centsSeen: Array<number | null> = [];

    function Subscriber() {
      const { subscribeToCents } = useTuner();
      renders += 1;
      const seen = useRef(centsSeen);
      useEffect(() => subscribeToCents((c) => seen.current.push(c)), [subscribeToCents]);
      return null;
    }

    render(
      <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()}>
        <Subscriber />
      </TunerProvider>
    );

    await act(async () => {
      await source.startedPromise;
    });

    const rendersBefore = renders;
    await act(async () => {
      source.pump(30);
    });

    expect(centsSeen.length).toBeGreaterThan(10);
    // The status may change once (listening -> reading). What must NOT happen
    // is a render per cents update — that is the 43 Hz re-render this design
    // exists to avoid (research D6).
    expect(renders - rendersBefore).toBeLessThanOrEqual(2);
  });

  it('returns a working unsubscribe', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) });
    const seen: Array<number | null> = [];

    function Subscriber() {
      const { subscribeToCents } = useTuner();
      useEffect(() => {
        const unsubscribe = subscribeToCents((c) => seen.push(c));
        unsubscribe();
      }, [subscribeToCents]);
      return null;
    }

    render(
      <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()}>
        <Subscriber />
      </TunerProvider>
    );

    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(20);
    });

    expect(seen).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('releases the microphone when the provider unmounts (FR-033)', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) });
    const { unmount } = renderWithProvider(source);

    await act(async () => {
      await source.startedPromise;
    });
    expect(source.isRunning).toBe(true);

    await act(async () => {
      unmount();
    });
    expect(source.isRunning).toBe(false);
  });
});
