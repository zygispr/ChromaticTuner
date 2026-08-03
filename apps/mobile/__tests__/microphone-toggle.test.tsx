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
