import { NoopWakeLock, ScriptedAudioSource } from '@chromatic-tuner/core/testing';
import { TunerProvider } from '@chromatic-tuner/react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { TunerScreen } from '../src/components/screens/TunerScreen';

/**
 * User Story 1 on mobile (T006), mirroring `apps/web/e2e/microphone-toggle.spec.ts`.
 *
 * `isRunning` on the scripted source is the assertion that matters. Checking
 * only what the button says would pass while the audio source stayed open —
 * and "the OS recording indicator went out" is the whole user-facing point of
 * the story, which on this platform is the port having been stopped.
 */

async function renderTuner(source: ScriptedAudioSource) {
  return render(
    <TunerProvider audioSource={source} wakeLock={new NoopWakeLock()}>
      <TunerScreen />
    </TunerProvider>
  );
}

/**
 * Let the failure paths reach the screen.
 *
 * `startedPromise` never resolves when `start()` rejects, so the tests that
 * begin from a blocked microphone have nothing to await — and the chain from
 * the rejection to the rendered banner needs the event loop to turn, not just
 * the microtask queue to drain.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

/**
 * Capture the handler `useMicrophoneLifecycle` registers, so the test can drive
 * a real foreground/background transition.
 *
 * Spying on the registration rather than calling some exported helper is
 * deliberate: FR-040 is about what happens when the platform fires this event,
 * so a test that bypasses `AppState` proves nothing about the requirement.
 */
function captureAppStateHandler() {
  const handlers: Array<(state: string) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
    if (event !== 'change') return { remove: jest.fn() } as never;

    const listener = handler as (state: string) => void;
    handlers.push(listener);

    // `remove` MUST actually remove. A no-op stub leaves the handler from a
    // previous effect run in the array, and the test then invokes a
    // subscription React has already torn down — reporting a lifecycle bug that
    // does not exist. This cost a debugging cycle; the stub was the defect.
    return {
      remove: () => {
        const at = handlers.indexOf(listener);
        if (at >= 0) handlers.splice(at, 1);
      },
    } as never;
  });
  return handlers;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('microphone toggle (US1)', () => {
  it('stops the audio source and starts it again (FR-036, FR-037, FR-038)', async () => {
    const source = new ScriptedAudioSource();
    await renderTuner(source);
    await act(async () => {
      await source.startedPromise;
    });

    expect(source.isRunning).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });
    expect(source.isRunning).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });
    expect(source.isRunning).toBe(true);
  });

  it('names the action it will take, and the name changes (FR-039, FR-042)', async () => {
    const source = new ScriptedAudioSource();
    await renderTuner(source);
    await act(async () => {
      await source.startedPromise;
    });

    expect(screen.getByTestId('microphone-toggle')).toHaveTextContent(/stop listening/i);

    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });
    expect(screen.getByTestId('microphone-toggle')).toHaveTextContent(/start listening/i);
  });

  it('does not present the stopped state as "Starting…" (FR-039)', async () => {
    const source = new ScriptedAudioSource();
    await renderTuner(source);
    await act(async () => {
      await source.startedPromise;
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });

    // Before this story a user-initiated stop left the session in `idle`, whose
    // copy is "Starting…" — the opposite of what actually happened.
    const status = screen.getByTestId('tuner-status');
    expect(status).toHaveTextContent(/microphone is off/i);
    expect(status).not.toHaveTextContent(/starting/i);
  });

  it('does not offer to stop a microphone that never opened (FR-039)', async () => {
    const source = new ScriptedAudioSource({
      failWith: { kind: 'permission-denied', canRetry: true },
    });
    await renderTuner(source);
    await settle();

    // Capture intent survives a failed start, and the label was derived from
    // intent alone — so a denied microphone showed "Try again" beside a "Stop
    // listening" that claimed the tuner held it.
    expect(source.isRunning).toBe(false);
    expect(screen.getByTestId('microphone-toggle')).toHaveTextContent(/start listening/i);
  });

  it('retries from the capture control rather than switching intent off (FR-038)', async () => {
    const source = new ScriptedAudioSource({
      failWith: { kind: 'permission-denied', canRetry: true },
    });
    await renderTuner(source);
    await settle();

    // The user allows the microphone in Settings and comes back.
    source.setFailure(null);
    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });

    // Treating this as an intent toggle would stop a session that was never
    // running and leave the tuner switched off — from a button that said start.
    expect(source.isRunning).toBe(true);
    expect(screen.getByTestId('microphone-toggle')).toHaveTextContent(/stop listening/i);
  });

  it('keeps a user-initiated stop across backgrounding and returning (FR-040)', async () => {
    const handlers = captureAppStateHandler();
    const source = new ScriptedAudioSource();
    await renderTuner(source);
    await act(async () => {
      await source.startedPromise;
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });
    expect(source.isRunning).toBe(false);

    await act(async () => {
      for (const handler of handlers) handler('background');
    });
    await act(async () => {
      for (const handler of handlers) handler('active');
    });

    // The lifecycle hook calls start() on every return to the foreground. Unless
    // intent gates the hook, this silently reverses the user's decision.
    expect(source.isRunning).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId('microphone-toggle'));
    });
    expect(source.isRunning).toBe(true);
  });
});
