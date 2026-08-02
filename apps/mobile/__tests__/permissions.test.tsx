import type { TunerStatus } from '@chromatic-tuner/core';
import { frequencyOf } from '@chromatic-tuner/core';
import { NoopWakeLock, ScriptedAudioSource } from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AudioManager } from 'react-native-audio-api';

import { PermissionPrompt } from '../src/components/molecules/PermissionPrompt';
import { StatusBanner } from '../src/components/molecules/StatusBanner';
import { TunerScreen } from '../src/components/screens/TunerScreen';

/**
 * User Story 3 on mobile (T069–T071).
 *
 * The recovery copy and the explainer are tested by rendering those components
 * directly with the statuses they must handle. Driving them through the whole
 * provider → gate → session stack would test React Native Testing Library's
 * async render scheduling far more than it tests the copy, and the session
 * itself already has 47 tests of its own in `packages/core`.
 *
 * The one thing that genuinely needs the full stack — whether the explainer or
 * the tuner is shown — gets an integration test at the bottom.
 */

const SAMPLE_RATE = 44100;

function tone(midi: number, length = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequencyOf(midi, 440)) / SAMPLE_RATE;
  for (let i = 0; i < length; i += 1) out[i] = 0.8 * Math.sin(step * i);
  return out;
}

describe('PermissionPrompt (FR-028, FR-031)', () => {
  it('states plainly that audio is never recorded or transmitted', async () => {
    await render(<PermissionPrompt onAllow={() => undefined} />);

    expect(screen.getByTestId('privacy-note')).toHaveTextContent(/never recorded/i);
    expect(screen.getByTestId('privacy-note')).toHaveTextContent(/never sent anywhere/i);
  });

  it('says what the microphone is for before asking for it', async () => {
    await render(<PermissionPrompt onAllow={() => undefined} />);

    expect(screen.getByTestId('permission-prompt')).toHaveTextContent(/hear the string you play/i);
  });

  it('hands control back only when the user chooses to continue', async () => {
    const onAllow = jest.fn();
    await render(<PermissionPrompt onAllow={onAllow} />);

    expect(onAllow).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('allow-microphone'));
    expect(onAllow).toHaveBeenCalledTimes(1);
  });
});

describe('StatusBanner recovery copy (SC-014)', () => {
  /** Every failure a user can actually reach, and the words that must appear. */
  const FAILURES: Array<{ status: TunerStatus; steps: RegExp }> = [
    { status: { kind: 'permission-denied', canRetry: true }, steps: /Settings ›/ },
    { status: { kind: 'permission-denied', canRetry: false }, steps: /Settings ›/ },
    { status: { kind: 'no-microphone' }, steps: /headset/i },
    { status: { kind: 'microphone-busy' }, steps: /call|voice memo|recorder/i },
    { status: { kind: 'error', message: 'The audio session died.' }, steps: /audio session died/i },
  ];

  for (const { status, steps } of FAILURES) {
    it(`gives ${status.kind} an explanation and a next step`, async () => {
      await render(<StatusBanner status={status} onRetry={() => undefined} />);

      // Both halves matter: a title with no steps is a dead end, and steps with
      // no way to act on them are a suggestion the user cannot follow.
      expect(screen.getByTestId('tuner-status')).toBeTruthy();
      expect(screen.getByTestId('recovery-steps')).toHaveTextContent(steps);
      expect(screen.getByTestId('retry-button')).toBeTruthy();
    });
  }

  it('names this platform’s real settings path, not a vague instruction', async () => {
    await render(
      <StatusBanner
        status={{ kind: 'permission-denied', canRetry: true }}
        onRetry={() => undefined}
      />
    );

    // "Allow the microphone in Settings" is useless if the switch cannot be
    // found, so the path is spelled out.
    expect(screen.getByTestId('recovery-steps')).toHaveTextContent(/Privacy|Apps/);
  });

  it('retries when asked', async () => {
    const onRetry = jest.fn();
    await render(<StatusBanner status={{ kind: 'no-microphone' }} onRetry={onRetry} />);

    fireEvent.press(screen.getByTestId('retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows a hint but no recovery while merely listening', async () => {
    await render(<StatusBanner status={{ kind: 'listening' }} onRetry={() => undefined} />);

    expect(screen.getByTestId('tuner-status')).toHaveTextContent(/play a string/i);
    expect(screen.queryByTestId('recovery-steps')).toBeNull();
    expect(screen.queryByTestId('retry-button')).toBeNull();
  });

  it('gets out of the way once a note is being read', async () => {
    const reading = {
      frequency: 82.41,
      midi: 40,
      cents: 0,
      clarity: 0.99,
      state: 'in-tune' as const,
      timestamp: 0,
    };
    await render(<StatusBanner status={{ kind: 'reading', reading }} onRetry={() => undefined} />);

    expect(screen.queryByTestId('status-banner')).toBeNull();
  });
});

describe('the gate decides whether to explain first', () => {
  async function renderScreen(source: ScriptedAudioSource) {
    // RNTL 14 made `render` asynchronous; an un-awaited call leaves every
    // subsequent query resolving against a stale tree.
    const result = await render(
      <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()} autoStart={false}>
        <TunerScreen />
      </TunerProvider>
    );
    // The chain is checkRecordingPermissions() → state → effect → start() →
    // status → render, which needs the event loop to turn, not just the
    // microtask queue to drain.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    return result;
  }

  it('explains before the OS prompt, touching nothing until the user agrees', async () => {
    (AudioManager.checkRecordingPermissions as jest.Mock).mockResolvedValue('Undetermined');

    const source = new ScriptedAudioSource({ samples: tone(40) });
    await renderScreen(source);

    expect(screen.getByTestId('permission-prompt')).toBeTruthy();
    expect(source.startCount).toBe(0);
    expect(screen.queryByTestId('tuner-display')).toBeNull();
  });

  it('goes straight to the tuner when permission is already held (FR-026)', async () => {
    (AudioManager.checkRecordingPermissions as jest.Mock).mockResolvedValue('Granted');

    const source = new ScriptedAudioSource({ samples: tone(40) });
    await renderScreen(source);

    expect(screen.queryByTestId('permission-prompt')).toBeNull();
    expect(screen.getByTestId('tuner-display')).toBeTruthy();
    expect(source.isRunning).toBe(true);
  });
});
