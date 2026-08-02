import { frequencyOf } from '@chromatic-tuner/core';
import { NoopWakeLock, ScriptedAudioSource } from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { act, render, screen } from '@testing-library/react-native';

import { TunerScreen } from '../src/components/screens/TunerScreen';

/**
 * Primary-flow integration test for the mobile app (T056).
 *
 * The note label, cents readout, tuning line and direction cue are deliberately
 * hidden from assistive technology — `ScreenReaderAnnouncer` speaks all four as
 * one sentence instead (FR-020, T090) — so the queries below opt in explicitly
 * with `includeHiddenElements`. They are asserting the VISUAL rendering, which
 * is exactly the thing that is hidden. The announcer's own wording is covered
 * in packages/react.
 *
 * Constitution Principle III exempts UI shells from the 90% numeric target but
 * requires at least one integration test covering the primary user flow. The
 * native audio module is mocked at the port boundary — this exercises the real
 * component tree, the real shared hook, and the real DSP.
 */

const SAMPLE_RATE = 44100;

function tone(midi: number, length = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequencyOf(midi, 440)) / SAMPLE_RATE;
  for (let i = 0; i < length; i += 1) out[i] = 0.8 * Math.sin(step * i);
  return out;
}

// React Native Testing Library 14 made `render` asynchronous, so it must be
// awaited — an un-awaited call returns a Promise and every query then fails
// with "render function has not been called".
async function renderTuner(source: ScriptedAudioSource) {
  return render(
    <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()}>
      <TunerScreen />
    </TunerProvider>
  );
}

describe('mobile tuner flow', () => {
  it('shows a listening state before any audio arrives', async () => {
    const source = new ScriptedAudioSource();
    await renderTuner(source);

    await act(async () => {
      await source.startedPromise;
    });

    expect(screen.getByTestId('tuner-display')).toBeTruthy();
    expect(screen.getByTestId('tuning-line', { includeHiddenElements: true })).toBeTruthy();
  });

  it('names the played note and reports it as in tune', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) }); // E2
    await renderTuner(source);

    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(12);
    });

    // Note name and octave are rendered as separate Text nodes (FR-003).
    expect(screen.getByTestId('note-label', { includeHiddenElements: true })).toHaveTextContent(
      /^E2$/
    );
    expect(screen.getByTestId('direction-cue', { includeHiddenElements: true })).toHaveTextContent(
      /in tune/i
    );
  });

  it('tells the player to tighten when the string is flat', async () => {
    // 30 cents below E2.
    const flat = new Float32Array(SAMPLE_RATE);
    const hz = frequencyOf(40, 440) * Math.pow(2, -30 / 1200);
    const step = (2 * Math.PI * hz) / SAMPLE_RATE;
    for (let i = 0; i < flat.length; i += 1) flat[i] = 0.8 * Math.sin(step * i);

    const source = new ScriptedAudioSource({ samples: flat });
    await renderTuner(source);

    await act(async () => {
      await source.startedPromise;
    });
    await act(async () => {
      source.pump(12);
    });

    expect(screen.getByTestId('direction-cue', { includeHiddenElements: true })).toHaveTextContent(
      /tighten/i
    );
    expect(screen.getByTestId('cents-readout', { includeHiddenElements: true })).toHaveTextContent(
      /-\d+/
    );
  });

  it('releases the microphone when the tree unmounts (FR-033)', async () => {
    const source = new ScriptedAudioSource({ samples: tone(40) });
    const { unmount } = await renderTuner(source);

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
